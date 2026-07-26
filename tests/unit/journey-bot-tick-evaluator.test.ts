import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const evaluator = join(process.cwd(), "scripts/staging/assert-journey-bot-tick.mjs");

test("tick evaluator accepteert gezonde runs en verwachte blockers", async () => {
  const result = await evaluate({
    accepted: true,
    environment: "staging",
    processed: 1,
    summary: {
      criticalIssues: 0,
      degradedJourneys: 0,
      failedRuns: 0,
      healthyRuns: 1,
      technicalFailures: 0,
      unexpectedIssues: 0
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /healthy=1/);
});

test("tick evaluator blokkeert verborgen technische child-fouten", async () => {
  const result = await evaluate({
    accepted: true,
    environment: "staging",
    processed: 1,
    summary: {
      criticalIssues: 0,
      degradedJourneys: 0,
      failedRuns: 1,
      healthyRuns: 0,
      technicalFailures: 1,
      unexpectedIssues: 1
    }
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release-blocking technical failures/);
});

test("tick evaluator weigert onvolledige of niet-staging responses", async () => {
  const result = await evaluate({ accepted: true, environment: "production", processed: 0, summary: {} });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not safely accepted/);
});

async function evaluate(payload: unknown) {
  const directory = await mkdtemp(join(tmpdir(), "nxttrack-journey-tick-"));
  const responsePath = join(directory, "response.json");
  await writeFile(responsePath, JSON.stringify(payload), "utf8");
  try {
    return spawnSync(process.execPath, [evaluator, responsePath], { encoding: "utf8" });
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}
