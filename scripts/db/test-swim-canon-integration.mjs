#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sql = await readFile(path.join(root, "tests/sql/swim_canon_progress_integration.sql"), "utf8");
const connectionString =
  process.env.SWIM_CANON_TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55422/postgres";
const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  console.log("[test:swim-canon:db] PASS publication, immutability, 16.7%, correction, retraction and idempotency.");
} finally {
  await client.end();
}
