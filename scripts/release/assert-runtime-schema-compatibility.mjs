#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { assertCompatibleApplicationAncestry } from "./compatible-application-ancestry.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const sourceCheckout = process.env.GITHUB_WORKSPACE || root;
const minimumAppSha = "541fe5fd6cee083cb809eef236382cfd2d519ed3";
const requiredMigrationVersion = "20260908111450";
const expectedFingerprint = "2b38518a37e41adb2da11224561e44e185c28ca45a962e1f8acfd361aab38aba";
// Additive presentation storage preserves the existing application/schema minimum.
// Previous applications retain their native contract and rollback compatibility.
// This V4.2 artifact requires its complete, independently pinned migration lineage.
const requiredArtifactMigrationVersion = "20260914145431";
const expectedArtifactFingerprint = "ec8535f2f83642e679a309bb3a4992af96581cf420e055abb2001069495157cd";
const versions = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .flatMap((file) => /^([0-9]{14})_.*\.sql$/.exec(file)?.[1] ?? [])
  .sort();
const localFingerprint = createHash("sha256").update(versions.join("\n")).digest("hex");

const minimumFingerprint = createHash("sha256")
  .update(versions.filter((version) => version <= requiredMigrationVersion).join("\n"))
  .digest("hex");
if (versions.at(-1) !== requiredArtifactMigrationVersion
  || localFingerprint !== expectedArtifactFingerprint
  || minimumFingerprint !== expectedFingerprint) {
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

assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha, candidateSha: deployedSourceSha });

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
  console.log(`[release:schema] PASS migrations=${versions.length} fingerprint=${localFingerprint} minimumSchemaFingerprint=${expectedFingerprint} minimumAppSha=${minimumAppSha}`);
} finally {
  await client.end();
}
