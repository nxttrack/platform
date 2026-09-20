import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = fileURLToPath(new URL("../..", import.meta.url));
const missingEnvironment = `
  import fs from "node:fs";
  import { syncBuiltinESMExports } from "node:module";
  const read = fs.readFileSync;
  fs.readFileSync = function (path, ...options) {
    if (path === "/var/www/nxttrack/staging/shared/.env") {
      throw Object.assign(new Error("OPERATIONS_TEST_ENV_MISSING"), { code: "ENOENT" });
    }
    return read.call(this, path, ...options);
  };
  syncBuiltinESMExports();
  globalThis.fetch = () => { throw new Error("Unexpected network request in CLI test"); };
`;

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "nxttrack-operations-cli-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const current = join(directory, "current");
  symlinkSync(sourceRoot, current, "dir");
  return { directory, current };
}

function run(script, args = []) {
  return spawnSync(process.execPath, [
    "--import", `data:text/javascript,${encodeURIComponent(missingEnvironment)}`, script, ...args
  ], { encoding: "utf8", env: {}, timeout: 5_000, maxBuffer: 64 * 1024 });
}

for (const [script, exportName] of [
  ["run-scheduled-jobs.mjs", "runScheduledJobs"],
  ["backup-storage-daily.mjs", "createDailyBackup"]
]) {
  for (const linked of [false, true]) {
    test(`${script} executes through ${linked ? "the installed directory symlink" : "a direct path"} and fails on missing runtime environment`, (t) => {
      const { current } = fixture(t);
      const result = run(join(linked ? current : sourceRoot, "scripts/operations", script), ["staging"]);
      assert.ifError(result.error);
      assert.equal(result.status, 1, "The CLI must fail, not silently exit successfully without running.");
      assert.match(result.stderr, /Error: OPERATIONS_TEST_ENV_MISSING/);
      assert.equal(result.stdout, "");
    });
  }

  test(`${script} remains side-effect free when imported through the installed directory symlink`, (t) => {
    const { directory, current } = fixture(t);
    const wrapper = join(directory, "import-only.mjs");
    const moduleUrl = pathToFileURL(join(current, "scripts/operations", script)).href;
    writeFileSync(wrapper, `import assert from "node:assert/strict";
      import { ${exportName} } from ${JSON.stringify(moduleUrl)};
      assert.equal(typeof ${exportName}, "function");
      console.log("imported without execution");
    `);
    const result = run(wrapper, ["staging"]);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "imported without execution\n");
  });
}
