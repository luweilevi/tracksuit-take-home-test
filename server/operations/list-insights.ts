import type { Insight } from "$models/insight.ts";
import type { HasDBClient } from "../shared.ts";
import type * as insightsTable from "$tables/insights.ts";
import { log } from "../log.ts";

type Input = HasDBClient;

export default (input: Input): Insight[] => {
  const rows = input.db.sql<insightsTable.Row>`SELECT * FROM insights`;

  const result: Insight[] = rows.map((row) => ({
    ...row,
    createdAt: new Date(row.createdAt),
  }));

  log("info", "listed insights", { count: result.length });
  return result;
};
