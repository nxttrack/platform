import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { readReleaseCommitSha } from "../../scripts/release/assert-rollback-release.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = join(root, "scripts/release/rehearse-runtime-rollback.sh");
const originalSha = "a".repeat(40);
const candidateSha = "b".repeat(40);
const contract = "export const contract = 5;\n";

function fixture(environment = "staging") {
  const directory = mkdtempSync(join(tmpdir(), "nxttrack-rollback-rehearsal-"));
  const base = join(directory, environment);
  const original = join(base, "releases/original");
  const candidate = join(base, "releases/candidate");
  const mocks = join(directory, "bin");
  mkdirSync(join(base, "shared"), { recursive: true });
  mkdirSync(mocks);
  const appUrl = environment === "production" ? "https://nxttrack.nl" : "https://staging.nxttrack.nl";
  const originalEnv = `APP_ENV=${environment}\nAPP_URL=${appUrl}\nRELEASE_COMMIT_SHA=${originalSha}\nRELEASE_BUILD_TIME=2026-09-19T12:00:00Z\nMAINTENANCE_NO_WRITE=false\nEMAIL_SENDING_ENABLED=true\nNEWSLETTER_DELIVERY_ENABLED=false\nINTERNAL_JOBS_ENABLED=true\nUNCHANGED_FIXTURE_VALUE=keep-me\n`;
  writeFileSync(join(base, "shared/.env"), originalEnv, { mode: 0o640 });
  for (const [release, commitSha] of [[original, originalSha], [candidate, candidateSha]]) {
    mkdirSync(join(release, "apps/web/.next/standalone/apps/web"), { recursive: true });
    mkdirSync(join(release, "apps/web/lib/release"), { recursive: true });
    mkdirSync(join(release, "artifacts"));
    writeFileSync(join(release, "apps/web/.next/standalone/apps/web/server.js"), "// fixture\n");
    writeFileSync(join(release, "apps/web/lib/release/schema-compatibility.ts"), contract);
    writeFileSync(join(release, "artifacts/exact-source-sha.json"), JSON.stringify({ purpose: "nxttrack-exact-source-sha", commitSha }));
    writeFileSync(join(release, "artifacts/release-evidence.json"), JSON.stringify({ application: "nxttrack-platform", target: environment, source: { commitSha } }));
    symlinkSync(join(base, "shared/.env"), join(release, ".env"));
    symlinkSync(join(base, "shared/.env"), join(release, ".env.production"));
  }
  symlinkSync(original, join(base, "current"));
  writeFileSync(join(directory, "pid"), "100");
  writeFileSync(join(directory, "trace"), "");
  const mock = (name, source) => {
    const path = join(mocks, name);
    writeFileSync(path, `#!${process.execPath}\n${source}\n`);
    chmodSync(path, 0o755);
  };
  mock("git", `
const args = process.argv.slice(2);
if (args[0] === 'cat-file') process.exit(0);
if (args[0] === 'merge-base') process.exit(process.env.TEST_REJECT_ANCESTRY === 'true' ? 1 : 0);
if (args[0] === 'show') { console.log(${JSON.stringify(contract)}); process.exit(0); }
if (args[0] === 'rev-parse') { console.log(process.env.TEST_DIFFERENT_MIGRATIONS === 'true' && args[1].startsWith('${candidateSha}') ? 'different-tree' : 'same-tree'); process.exit(0); }
throw new Error('Unexpected git arguments: ' + args.join(' '));`);
  mock("systemctl", `
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
if (args.at(-1) !== 'nxttrack-' + process.env.TEST_ENVIRONMENT) process.exit(3);
if (args.includes('MainPID')) console.log(fs.readFileSync(path.join(process.env.TEST_DIRECTORY, 'pid'), 'utf8'));
else if (args.includes('ActiveState')) console.log('active');
else process.exit(4);`);
  mock("sudo", `
const fs = require('node:fs'); const path = require('node:path');
const args = process.argv.slice(2);
if (args.join(' ') !== 'systemctl restart nxttrack-' + process.env.TEST_ENVIRONMENT) process.exit(3);
const base = process.env.TEST_BASE; const directory = process.env.TEST_DIRECTORY;
const release = path.basename(fs.realpathSync(path.join(base, 'current')));
const runtime = fs.readFileSync(path.join(base, 'shared/.env'), 'utf8');
fs.appendFileSync(path.join(directory, 'trace'), JSON.stringify({ release, runtime, service: args.at(-1) }) + '\\n');
if (release === 'original' && process.env.TEST_RESTORE_FAILS === 'true') process.exit(1);
const pidPath = path.join(directory, 'pid'); fs.writeFileSync(pidPath, String(Number(fs.readFileSync(pidPath, 'utf8')) + 1));`);
  mock("curl", `
const fs = require('node:fs'); const path = require('node:path'); const { parseEnv } = require('node:util');
const base = process.env.TEST_BASE; const release = path.basename(fs.realpathSync(path.join(base, 'current')));
const runtime = parseEnv(fs.readFileSync(path.join(base, 'shared/.env'), 'utf8'));
console.log(JSON.stringify({ ok: true, app: 'nxttrack-platform', env: runtime.APP_ENV,
commitSha: release === 'candidate' && process.env.TEST_WRONG_HEALTH_SHA === 'true' ? '${originalSha}' : runtime.RELEASE_COMMIT_SHA,
checks: { database: { status: 'pass' }, schemaCompatibility: { status: process.env.TEST_BAD_SCHEMA_HEALTH === 'true' ? 'skipped' : 'pass' } } }));`);
  mock("sleep", "process.exit(0);");
  const env = { ...process.env, PATH: `${mocks}:${process.env.PATH}`, GITHUB_WORKSPACE: root,
    ROLLBACK_BASE_DIR: base, ROLLBACK_SERVICE_NAME: `nxttrack-${environment}`, ROLLBACK_HEALTH_URL: `${appUrl}/api/health`,
    TEST_DIRECTORY: directory, TEST_BASE: base, TEST_ENVIRONMENT: environment };
  delete env.GITHUB_STEP_SUMMARY;
  const run = (args = [environment, candidate], extra = {}) => spawnSync("bash", [script, ...args], { cwd: root, encoding: "utf8", env: { ...env, ...extra }, timeout: 20_000 });
  const trace = () => readFileSync(join(directory, "trace"), "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  const assertOriginal = () => {
    assert.equal(readlinkSync(join(base, "current")), original);
    assert.equal(readFileSync(join(base, "shared/.env"), "utf8"), originalEnv);
  };
  return { directory, base, original, candidate, originalEnv, environment, run, trace, assertOriginal, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

function withFixture(fn, environment) {
  const item = fixture(environment);
  try { fn(item); } finally { item.cleanup(); }
}

test("rollback requires explicit environment and target; production cannot fall back to staging", () => {
  withFixture(item => {
    for (const args of [[], ["production"], ["other", item.candidate], ["staging", "relative"], ["production", item.candidate]]) {
      const result = item.run(args);
      assert.notEqual(result.status, 0, result.stdout + result.stderr);
      item.assertOriginal();
      assert.deepEqual(item.trace(), []);
    }
  });
});

test("check-only validates a selected candidate without switching service, link or runtime environment", () => {
  withFixture(item => {
    const result = item.run(["staging", item.candidate, "--check-only"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Check-only complete/);
    item.assertOriginal();
    assert.deepEqual(item.trace(), []);
  });
});

test("check-only validates real certified Git ancestry and source contracts without a Git mock", () => {
  withFixture(item => {
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    const sourceSha = git("rev-parse", "HEAD");
    // Two independently built directories may legitimately have the same SHA.
    // Keep this proof valid when future migrations advance the repository.
    const previousSha = sourceSha;
    unlinkSync(join(item.directory, "bin/git"));
    for (const [release, commitSha] of [[item.original, sourceSha], [item.candidate, previousSha]]) {
      writeFileSync(join(release, "artifacts/exact-source-sha.json"), JSON.stringify({ purpose: "nxttrack-exact-source-sha", commitSha }));
      writeFileSync(join(release, "artifacts/release-evidence.json"), JSON.stringify({ application: "nxttrack-platform", target: "staging", source: { commitSha } }));
      writeFileSync(join(release, "apps/web/lib/release/schema-compatibility.ts"), git("show", `${commitSha}:apps/web/lib/release/schema-compatibility.ts`));
    }
    const environment = item.originalEnv.replace(originalSha, sourceSha);
    writeFileSync(join(item.base, "shared/.env"), environment);
    const result = item.run(["staging", item.candidate, "--check-only"]);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(item.trace(), []);
    assert.equal(readFileSync(join(item.base, "shared/.env"), "utf8"), environment);
  });
});

test("runtime environment, service and health URL cannot cross the explicitly selected deployment", () => {
  withFixture(item => {
    for (const extra of [{ ROLLBACK_SERVICE_NAME: "nxttrack-production" }, { ROLLBACK_HEALTH_URL: "https://nxttrack.nl/api/health" }]) {
      const result = item.run(undefined, extra);
      assert.notEqual(result.status, 0);
      item.assertOriginal();
      assert.deepEqual(item.trace(), []);
    }
    const wrongEnvironment = item.originalEnv.replace("APP_ENV=staging", "APP_ENV=production");
    writeFileSync(join(item.base, "shared/.env"), wrongEnvironment);
    assert.notEqual(item.run().status, 0);
    assert.deepEqual(item.trace(), []);
    assert.equal(readFileSync(join(item.base, "shared/.env"), "utf8"), wrongEnvironment);
  });
});

test("a rehearsal applies candidate identity and containment, then restores original environment bytes", () => {
  withFixture(item => {
    const result = item.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    item.assertOriginal();
    const steps = item.trace();
    assert.deepEqual(steps.map(step => step.release), ["candidate", "original"]);
    assert.match(steps[0].runtime, new RegExp(`RELEASE_COMMIT_SHA=${candidateSha}`));
    for (const line of ["MAINTENANCE_NO_WRITE=true", "EMAIL_SENDING_ENABLED=false", "INTERNAL_JOBS_ENABLED=false", "UNCHANGED_FIXTURE_VALUE=keep-me"]) assert.ok(steps[0].runtime.includes(line));
    assert.equal(steps[1].runtime, item.originalEnv);
    assert.deepEqual(readdirSync(join(item.base, "shared")).filter(name => name.startsWith(".rollback-rehearsal.")), []);
  });
});

test("production rehearsal restarts only the explicitly selected production service", () => {
  withFixture(item => {
    const result = item.run();
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.deepEqual(item.trace().map(step => step.service), ["nxttrack-production", "nxttrack-production"]);
    item.assertOriginal();
  }, "production");
});

test("wrong candidate SHA in health restores original release and environment instead of claiming success", () => {
  withFixture(item => {
    const result = item.run(undefined, { TEST_WRONG_HEALTH_SHA: "true" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Exact-SHA/);
    item.assertOriginal();
    assert.deepEqual(item.trace().map(step => step.release), ["candidate", "original"]);
  });
});

test("failed cleanup preserves the original environment snapshot for recovery", () => {
  withFixture(item => {
    const result = item.run(undefined, { TEST_WRONG_HEALTH_SHA: "true", TEST_RESTORE_FAILS: "true" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Restore failed; preserved environment snapshot/);
    const snapshots = readdirSync(join(item.base, "shared")).filter(name => name.startsWith(".rollback-rehearsal."));
    assert.equal(snapshots.length, 1);
    assert.equal(readFileSync(join(item.base, "shared", snapshots[0], "original.env"), "utf8"), item.originalEnv);
  });
});

test("incompatible migrations, uncertified ancestry and missing schema health fail before any switch", () => {
  for (const flag of ["TEST_DIFFERENT_MIGRATIONS", "TEST_REJECT_ANCESTRY", "TEST_BAD_SCHEMA_HEALTH"]) {
    withFixture(item => {
      const result = item.run(undefined, { [flag]: "true" });
      assert.notEqual(result.status, 0, `${flag}: ${result.stdout}`);
      assert.deepEqual(item.trace(), []);
      item.assertOriginal();
    });
  }
});

test("mismatched or absent immutable release evidence fails before runtime mutation", () => {
  const cases = [
    item => unlinkSync(join(item.candidate, "artifacts/exact-source-sha.json")),
    item => writeFileSync(join(item.candidate, "artifacts/exact-source-sha.json"), JSON.stringify({ purpose: "different-purpose", commitSha: candidateSha })),
    item => writeFileSync(join(item.candidate, "artifacts/release-evidence.json"), JSON.stringify({ application: "nxttrack-platform", target: "production", source: { commitSha: candidateSha } })),
    item => writeFileSync(join(item.candidate, "artifacts/release-evidence.json"), JSON.stringify({ application: "nxttrack-platform", target: "staging", source: { commitSha: originalSha } })),
    item => writeFileSync(join(item.candidate, "apps/web/lib/release/schema-compatibility.ts"), "different packaged contract"),
    item => writeFileSync(join(item.original, "artifacts/exact-source-sha.json"), JSON.stringify({ purpose: "nxttrack-exact-source-sha", commitSha: candidateSha }))
  ];
  for (const mutate of cases) {
    withFixture(item => {
      mutate(item);
      const result = item.run();
      assert.notEqual(result.status, 0, result.stdout);
      assert.deepEqual(item.trace(), []);
      item.assertOriginal();
    });
  }
});

test("shared environment exception is explicit; independent metadata mismatches remain invalid", () => {
  withFixture(item => {
    assert.throws(() => readReleaseCommitSha(item.candidate), /different commits/);
    assert.equal(readReleaseCommitSha(item.candidate, { sharedEnvironmentPath: join(item.base, "shared/.env") }), candidateSha);
    unlinkSync(join(item.candidate, ".env"));
    writeFileSync(join(item.candidate, ".env"), item.originalEnv);
    assert.throws(() => readReleaseCommitSha(item.candidate, { sharedEnvironmentPath: join(item.base, "shared/.env") }), /expected environment symlink/);
    assert.throws(() => readReleaseCommitSha(item.candidate), /different commits/);
    assert.ok(existsSync(join(item.original, ".env")));
  });
});
