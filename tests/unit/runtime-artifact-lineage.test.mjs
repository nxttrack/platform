import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const retirementVersions = ["20260913232635", "20260913234447"];
const correctionVersions = ["20260914012125", "20260914012126"];
const latestArtifactVersion = "20260915090000";

// Execute the actual release guard. No database connection is made: a complete
// artifact must reach the DATABASE_URL check, and incomplete artifacts must fail
// earlier. This catches future migrations added without updating the release pin.
function inspectArtifact(omittedVersions) {
  const fixture = mkdtempSync(join(tmpdir(), "nxttrack-artifact-lineage-"));
  try {
    mkdirSync(join(fixture, "scripts/release"), { recursive: true });
    mkdirSync(join(fixture, "supabase/migrations"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(fixture, "node_modules"), "dir");
    for (const file of ["assert-runtime-schema-compatibility.mjs", "compatible-application-ancestry.mjs"]) {
      copyFileSync(join(root, "scripts/release", file), join(fixture, "scripts/release", file));
    }
    for (const file of readdirSync(join(root, "supabase/migrations"))) {
      if (file.endsWith(".sql") && !omittedVersions.includes(file.slice(0, 14))) {
        copyFileSync(join(root, "supabase/migrations", file), join(fixture, "supabase/migrations", file));
      }
    }
    const env = { ...process.env, GITHUB_WORKSPACE: root };
    delete env.DATABASE_URL;
    delete env.DEPLOYED_SOURCE_SHA;
    const result = spawnSync(process.execPath, [join(fixture, "scripts/release/assert-runtime-schema-compatibility.mjs")], {
      cwd: root, env, encoding: "utf8"
    });
    assert.equal(result.status, 1);
    return result.stderr;
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test("the complete artifact passes the pinned lineage guard before requiring a database", () => {
  assert.match(inspectArtifact([]), /DATABASE_URL is required/);
});

test("149-migration artifacts cannot omit either the SQL corrections or bot retirement", () => {
  for (const omitted of [correctionVersions, retirementVersions]) {
    assert.match(inspectArtifact(omitted), /Local migration lineage does not match/);
  }
});

test("150-migration artifacts cannot omit any individual correction or retirement migration", () => {
  for (const version of [...correctionVersions, ...retirementVersions]) {
    assert.match(inspectArtifact([version]), /Local migration lineage does not match/);
  }
});

test("the badge RLS repair is part of the pinned complete artifact", () => {
  assert.match(inspectArtifact([latestArtifactVersion]), /Local migration lineage does not match/);
});
