import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const repositoryPackage = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as {
  engines: { node: string };
  pnpm: { overrides: Record<string, string> };
};

test("runtime and package metadata pin the supported Node 24 line", () => {
  assert.equal(repositoryPackage.engines.node, ">=24.18.0 <25");
  assert.equal(
    readFileSync(new URL("../../.node-version", import.meta.url), "utf8").trim(),
    "24.18.0"
  );
});

test("every GitHub workflow uses the exact supported Node runtime", () => {
  const workflowsDirectory = new URL("../../.github/workflows/", import.meta.url);
  const workflowFiles = readdirSync(workflowsDirectory)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"));
  let setupNodeCount = 0;
  for (const file of workflowFiles) {
    const source = readFileSync(new URL(file, workflowsDirectory), "utf8");
    const versions = [...source.matchAll(/node-version:\s*["']?([^\s"']+)/g)].map((match) => match[1]);
    setupNodeCount += versions.length;
    assert.deepEqual(versions, versions.map(() => "24.18.0"), `${file} has a divergent Node runtime`);
  }
  assert.ok(setupNodeCount >= 18, "expected all active setup-node jobs to be covered");
});

test("nanoid override is at or above the patched 3.3.18 release", () => {
  assert.equal(repositoryPackage.pnpm.overrides.nanoid, "3.3.18");
  const lockfile = readFileSync(new URL("../../pnpm-lock.yaml", import.meta.url), "utf8");
  assert.match(lockfile, /nanoid: 3\.3\.18/);
  assert.doesNotMatch(lockfile, /nanoid@3\.3\.17|nanoid: 3\.3\.17/);
});
