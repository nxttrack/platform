import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { prepareDiagnostic } from '../../scripts/release/prepare-communication-login-diagnostic.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePaths = ['apps/web/tests/e2e/communication-badges.spec.ts', 'apps/web/playwright.config.ts'];
const instrumentationPaths = ['scripts/release/prepare-communication-login-diagnostic.mjs', 'scripts/release/communication-login-diagnostic.ts'];
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'communication-source-contract-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet');
  for (const relative of [...sourcePaths, ...instrumentationPaths]) {
    mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
    writeFileSync(path.join(root, relative), readFileSync(path.join(repo, relative)));
  }
  mkdirSync(path.join(root, 'apps/web/tests/e2e/helpers'), { recursive: true });
  git('add', '.');
  git('-c', 'user.name=Local fixture', '-c', 'user.email=fixture@example.test', 'commit', '--quiet', '-m', 'Immutable fixture');
  const sha = git('rev-parse', 'HEAD');
  return { root, env: { RELEASE_SHA: sha, INSTRUMENTATION_SHA: sha, PLAYWRIGHT_BASE_URL: 'https://staging.nxttrack.nl', DIAGNOSTIC_OUTPUT_DIR: path.join(root, 'safe-report') }, instrumentationDirectory: path.join(root, 'scripts/release') };
}

test('clone preserves all four original tests and exact original assertion; source stays unchanged', () => {
  const options = fixture();
  try {
    const before = sourcePaths.map((relative) => readFileSync(path.join(options.root, relative), 'utf8'));
    const report = prepareDiagnostic(options);
    const clone = readFileSync(path.join(options.root, 'apps/web/tests/e2e/communication-badges-diagnostic.spec.ts'), 'utf8');
    const originalPrefix = before[0].split('async function signIn(')[0];
    assert.ok(clone.includes(originalPrefix));
    assert.equal((clone.match(/  test\("/g) ?? []).length, 4);
    const assertion = before[0].split('\n').find((line) => line.includes('await expect(page).toHaveURL('));
    assert.ok(clone.includes(assertion));
    assert.equal(report.originalAssertionTimeoutMs, 5000);
    assert.equal(report.passiveFailureObservationLimitMs, 15000);
    assert.deepEqual(sourcePaths.map((relative) => readFileSync(path.join(options.root, relative), 'utf8')), before);
    assert.throws(() => prepareDiagnostic(options), /EEXIST/);
  } finally { rmSync(options.root, { recursive: true, force: true }); }
});

for (const mismatch of ['release-sha', 'production-origin', 'modified-test', 'modified-helper']) {
  test(`rejects ${mismatch} before creating a clone`, () => {
    const options = fixture();
    try {
      if (mismatch === 'release-sha') options.env.RELEASE_SHA = 'f'.repeat(40);
      if (mismatch === 'production-origin') options.env.PLAYWRIGHT_BASE_URL = 'https://nxttrack.nl';
      if (mismatch === 'modified-test') writeFileSync(path.join(options.root, sourcePaths[0]), 'modified');
      if (mismatch === 'modified-helper') writeFileSync(path.join(options.instrumentationDirectory, 'communication-login-diagnostic.ts'), 'modified');
      assert.throws(() => prepareDiagnostic(options));
      assert.throws(() => readFileSync(path.join(options.root, 'apps/web/tests/e2e/communication-badges-diagnostic.spec.ts')), /ENOENT/);
    } finally { rmSync(options.root, { recursive: true, force: true }); }
  });
}
