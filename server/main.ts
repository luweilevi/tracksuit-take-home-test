import { Database } from "@db/sqlite";
import * as oak from "@oak/oak";
import * as path from "@std/path";
import { Port } from "../lib/utils/index.ts";
import createInsight from "./operations/create-insight.ts";
import listInsights from "./operations/list-insights.ts";
import lookupInsight from "./operations/lookup-insight.ts";
import { z } from "zod";
import { log } from "./log.ts";
import {
  installTelemetry,
  observeRequest,
  renderMetrics,
} from "./observability.ts";
import { createTable } from "./tables/insights.ts";

installTelemetry();
log("info", "loading configuration");

const env = {
  port: Port.parse(Deno.env.get("SERVER_PORT")),
};

const dbFilePath = path.resolve("tmp", "db.sqlite3");

log("info", "opening database", { path: dbFilePath });

await Deno.mkdir(path.dirname(dbFilePath), { recursive: true });
const db = new Database(dbFilePath);

try {
  db.exec(createTable);
} catch (error) {
  log("error", "schema migration failed", {
    table: "insights",
    error: error instanceof Error ? error.name : "Error",
  });
  throw error;
}

function insightsTableReady(): boolean {
  const rows = db.sql<{ name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'insights'
  `;
  return rows.length === 1;
}

log("info", "schema ready", { table: "insights", ready: insightsTableReady() });

const router = new oak.Router();

// Liveness: process is up. Does not check the database.
router.get("/_health", (ctx) => {
  ctx.response.body = "OK";
  ctx.response.status = 200;
});

// Readiness: the insights table must exist. Point the ECS health check here.
router.get("/_ready", (ctx) => {
  const ready = insightsTableReady();
  ctx.response.status = ready ? 200 : 503;
  ctx.response.body = ready ? "OK" : "insights table missing";
});

router.get("/_metrics", (ctx) => {
  ctx.response.status = 200;
  ctx.response.type = "text/plain";
  ctx.response.body = renderMetrics();
});

router.get("/insights", (ctx) => {
  const result = listInsights({ db });
  ctx.response.body = result;
  ctx.response.status = 200;
});

const CreateInsightBody = z.object({
  brand: z.number().int().min(0),
  text: z.string().trim().min(1).max(4000),
});

// Literal paths are registered before /insights/:id.
// Writes are POST and DELETE.
router.post("/insights/create", async (ctx) => {
  let payload: unknown;
  try {
    payload = await ctx.request.body.json();
  } catch {
    ctx.response.status = 400;
    ctx.response.body = { error: "invalid json" };
    return;
  }

  const parsed = CreateInsightBody.safeParse(payload);
  // #region agent log
  fetch("http://127.0.0.1:7282/ingest/b51e5113-d5e9-4bbc-829d-ee1174a7bb31", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "a110e8",
    },
    body: JSON.stringify({
      sessionId: "a110e8",
      runId: "post-fix",
      hypothesisId: "D",
      location: "main.ts:POST /insights/create",
      message: "create payload parsed",
      data: {
        ok: parsed.success,
        brand: parsed.success ? parsed.data.brand : null,
        textLength: parsed.success ? parsed.data.text.length : null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  if (!parsed.success) {
    ctx.response.status = 400;
    ctx.response.body = { error: "invalid insight" };
    return;
  }

  const row = createInsight({ db, ...parsed.data });
  ctx.response.status = 201;
  ctx.response.body = row;
});

router.delete("/insights/delete", (ctx) => {
  ctx.response.status = 501;
  ctx.response.body = { error: "not implemented" };
});

router.get("/insights/:id", (ctx) => {
  const id = Number(ctx.params.id);
  const result = lookupInsight({ db, id });
  ctx.response.body = result ?? null;
  ctx.response.status = result ? 200 : 404;
});

const app = new oak.Application();

app.use(observeRequest());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(env);
log("info", "server started", { port: env.port });
