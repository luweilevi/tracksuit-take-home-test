import type { HasDBClient } from "../shared.ts";
import type * as insightsTable from "$tables/insights.ts";
import { log } from "../log.ts";

type Input = HasDBClient & {
  brand: number;
  text: string;
};

export default (input: Input): insightsTable.Row => {
  const createdAt = new Date().toISOString();
  const [row] = input.db.sql<insightsTable.Row>`
    INSERT INTO insights (brand, createdAt, text)
    VALUES (${input.brand}, ${createdAt}, ${input.text})
    RETURNING id, brand, createdAt, text
  `;

  log("info", "created insight", {
    id: row?.id ?? null,
    brand: input.brand,
    textLength: input.text.length,
  });

  if (!row) {
    throw new Error("insert failed");
  }

  return row;
};
