#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const candidateSha = (process.env.RELEASE_CANDIDATE_SHA || gitHead()).trim().toLowerCase();

if (!/^[a-f0-9]{40}$/.test(candidateSha)) {
  console.error("[production:go-no-go] RELEASE_CANDIDATE_SHA must be a full 40-character commit SHA.");
  process.exit(1);
}

const templatePath = resolve(process.cwd(), "docs/PRODUCTION_GO_NO_GO_TEMPLATE.md");
const outputPath = resolve(
  process.cwd(),
  process.env.PRODUCTION_GO_NO_GO_OUTPUT || `artifacts/production-go-no-go/${candidateSha}.md`
);
const replacements = {
  "{{CANDIDATE_SHA}}": candidateSha,
  "{{FOUNDATION_RUN_ID}}": process.env.PRODUCTION_FOUNDATION_RUN_ID || "NOT_RECORDED",
  "{{GENERATED_AT}}": new Date().toISOString(),
  "{{MIGRATION_REHEARSAL_RUN_ID}}": process.env.PRODUCTION_MIGRATION_REHEARSAL_RUN_ID || "NOT_RECORDED",
  "{{STAGING_RUN_ID}}": process.env.STAGING_RELEASE_RUN_ID || "NOT_RECORDED"
};

let contents = readFileSync(templatePath, "utf8");

for (const [token, value] of Object.entries(replacements)) {
  contents = contents.replaceAll(token, value);
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, contents, { mode: 0o640 });
console.log(`[production:go-no-go] Wrote exact-SHA form to ${outputPath}.`);

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
}
