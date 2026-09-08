#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourceCheckout = process.env.GITHUB_WORKSPACE || root;
const minimumAppSha = "352b38cd69958a3d59d31b39aaa798e6de70a77f";
const requiredMigrationVersion = "20260908111450";
const expectedFingerprint = "686f431e1b015f6f4f597137689f4b2dcb9b0c70a070666b26428bdaaebc293e";
const versions = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .flatMap((file) => /^([0-9]{14})_.*\.sql$/.exec(file)?.[1] ?? [])
  .sort();
const localFingerprint = createHash("sha256").update(versions.join("\n")).digest("hex");

if (versions.at(-1) !== requiredMigrationVersion || localFingerprint !== expectedFingerprint) {
  throw new Error("Local migration lineage does not match the runtime schema contract.");
}

const checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: sourceCheckout,
  encoding: "utf8"
}).trim();
const deployedSourceSha = process.env.DEPLOYED_SOURCE_SHA || checkoutSha;
if (!/^[0-9a-f]{40}$/.test(deployedSourceSha) || checkoutSha !== deployedSourceSha) {
  throw new Error("Deployed source SHA does not match the retained source checkout.");
}

execFileSync("git", ["merge-base", "--is-ancestor", minimumAppSha, deployedSourceSha], {
  cwd: sourceCheckout,
  stdio: "ignore"
});

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const history = await client.query(
    "select version::text from supabase_migrations.schema_migrations order by version::text"
  );
  const applied = new Set(history.rows.map((row) => row.version));
  const missing = versions.filter((version) => !applied.has(version));
  if (missing.length) throw new Error(`Database is missing ${missing.length} required migration(s).`);

  const result = await client.query("select * from public.runtime_schema_compatibility()");
  const contract = result.rows[0];
  if (result.rowCount !== 1
    || contract.contract_version !== 5
    || contract.minimum_compatible_app_sha !== minimumAppSha
    || contract.minimum_schema_fingerprint !== expectedFingerprint
    || contract.required_migration_version !== requiredMigrationVersion) {
    throw new Error("Database runtime schema contract does not match this application artifact.");
  }
  console.log(`[release:schema] PASS migrations=${versions.length} fingerprint=${expectedFingerprint} minimumAppSha=${minimumAppSha}`);
} finally {
  await client.end();
}
