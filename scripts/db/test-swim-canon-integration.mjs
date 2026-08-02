#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));
const testFiles = [
  "swim_canon_progress_integration.sql",
  "swim_canon_badge_batch_integration.sql",
  "swim_canon_curriculum_wizard_integration.sql",
  "swim_canon_transition_carryover_integration.sql",
  "swim_canon_group_planning_integration.sql",
  "swim_canon_billing_offerings_holidays_integration.sql",
  "swim_canon_analytics_forecast_integration.sql"
];
const connectionString =
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  for (const testFile of testFiles) {
    const sql = await readFile(path.join(root, "tests/sql", testFile), "utf8");
    await client.query(sql);
  }
  console.log("[test:swim-canon:db] PASS progress, badges, immutable curriculum publication, migration parity, reviewed transitions, referenced carryover, structured planning, VAT documents, credit notes, paid offering holds, verified placement, non-destructive holidays, rolling analytics, lifecycle reconciliation, deterministic forecasts, reviewed soft holds, forecast accuracy, DST, hierarchy, capacity buckets and idempotency.");
} finally {
  await client.end();
}
