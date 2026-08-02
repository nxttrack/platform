#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));
const testFiles = [
  "swim_canon_progress_integration.sql",
  "swim_canon_badge_batch_integration.sql",
  "swim_canon_curriculum_wizard_integration.sql"
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
  console.log("[test:swim-canon:db] PASS progress, badges, immutable curriculum publication, explicit migration parity and idempotency.");
} finally {
  await client.end();
}
