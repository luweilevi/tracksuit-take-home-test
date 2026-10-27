import { type ExportResult, ExportResultCode } from "@opentelemetry/core";
import {
  type Context,
  context,
  SpanStatusCode,
  trace,
  type Tracer,
} from "@opentelemetry/api";
import {
  BasicTracerProvider,
  type ReadableSpan,
  SimpleSpanProcessor,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { isHttpError, type Middleware } from "@oak/oak";
import { log, withRequestId } from "./log.ts";

type MetricKey = string;

type MetricSample = {
  method: string;
  route: string;
  status: number;
  count: number;
  errors: number;
  durationMs: number;
};

const samples = new Map<MetricKey, MetricSample>();

class JsonSpanExporter implements SpanExporter {
  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      const spanContext = span.spanContext();
      const durationMs = (span.duration[0] * 1e3) + (span.duration[1] / 1e6);
      log("info", "span", {
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        name: span.name,
        durationMs,
        status: span.status.code,
        attributes: span.attributes,
      });
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}

let tracer: Tracer | undefined;

export function installTelemetry(): void {
  const provider = new BasicTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new JsonSpanExporter()));
  provider.register();
  tracer = trace.getTracer("suit-tracker");
  log("info", "telemetry installed", {
    signals: ["logs", "traces", "metrics"],
  });
}

function routeLabel(pathname: string): string {
  if (
    pathname === "/insights/create" || pathname === "/insights/delete" ||
    pathname === "/insights"
  ) {
    return pathname;
  }
  return pathname.replace(/\/\d+(?=\/|$)/g, "/:id");
}

function record(
  method: string,
  route: string,
  status: number,
  durationMs: number,
): void {
  const key = `${method} ${route} ${status}`;
  const current = samples.get(key) ?? {
    method,
    route,
    status,
    count: 0,
    errors: 0,
    durationMs: 0,
  };
  current.count += 1;
  current.durationMs += durationMs;
  if (status >= 500 && status !== 501) current.errors += 1;
  samples.set(key, current);
}

export function renderMetrics(): string {
  const lines = [
    "# HELP http_requests_total HTTP requests (rate).",
    "# TYPE http_requests_total counter",
    "# HELP http_request_errors_total HTTP 5xx responses (errors).",
    "# TYPE http_request_errors_total counter",
    "# HELP http_request_duration_ms_sum Total request duration in milliseconds.",
    "# TYPE http_request_duration_ms_sum counter",
    "# HELP http_request_duration_ms_count Observed requests for duration.",
    "# TYPE http_request_duration_ms_count counter",
  ];

  const errors = new Map<
    string,
    { method: string; route: string; errors: number }
  >();

  for (const sample of samples.values()) {
    const labels =
      `method="${sample.method}",route="${sample.route}",status="${sample.status}"`;
    lines.push(`http_requests_total{${labels}} ${sample.count}`);
    lines.push(`http_request_duration_ms_sum{${labels}} ${sample.durationMs}`);
    lines.push(`http_request_duration_ms_count{${labels}} ${sample.count}`);

    const errorKey = `${sample.method} ${sample.route}`;
    const current = errors.get(errorKey) ?? {
      method: sample.method,
      route: sample.route,
      errors: 0,
    };
    current.errors += sample.errors;
    errors.set(errorKey, current);
  }

  for (const sample of errors.values()) {
    lines.push(
      `http_request_errors_total{method="${sample.method}",route="${sample.route}"} ${sample.errors}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function observeRequest(): Middleware {
  return async (ctx, next) => {
    const requestId = ctx.request.headers.get("x-request-id") ??
      crypto.randomUUID();
    ctx.response.headers.set("x-request-id", requestId);
    const method = ctx.request.method;
    const path = ctx.request.url.pathname;
    const started = performance.now();
    const activeTracer = tracer ?? trace.getTracer("suit-tracker");

    const span = activeTracer.startSpan("http.request", {
      attributes: {
        "http.request.method": method,
        "url.path": path,
        "request.id": requestId,
      },
    });
    const spanContext: Context = trace.setSpan(context.active(), span);

    try {
      await context.with(
        spanContext,
        () => withRequestId(requestId, () => next()),
      );
    } catch (error) {
      if (isHttpError(error)) {
        ctx.response.status = error.status;
        span.setStatus({
          code: error.status >= 500
            ? SpanStatusCode.ERROR
            : SpanStatusCode.UNSET,
        });
        throw error;
      }
      ctx.response.status = 500;
      span.setStatus({ code: SpanStatusCode.ERROR });
      log("error", "request failed", {
        requestId,
        method,
        path,
        error: error instanceof Error ? error.name : "Error",
      });
    } finally {
      const status = ctx.response.status ?? 200;
      const durationMs = performance.now() - started;
      span.setAttribute("http.response.status_code", status);
      span.end();
      const route = routeLabel(path);
      record(method, route, status, durationMs);
      log("info", "request", {
        requestId,
        method,
        path: route,
        status,
        durationMs,
      });
    }
  };
}
