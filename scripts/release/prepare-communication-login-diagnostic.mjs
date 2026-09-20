import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const canonicalSpecPath = 'apps/web/tests/e2e/communication-badges.spec.ts';
const canonicalConfigPath = 'apps/web/playwright.config.ts';
const helperName = 'communication-login-diagnostic.ts';
const ownName = 'prepare-communication-login-diagnostic.mjs';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function prepareDiagnostic({ root = process.cwd(), env = process.env, instrumentationDirectory = path.dirname(fileURLToPath(import.meta.url)) } = {}) {
  const { RELEASE_SHA: releaseSha, INSTRUMENTATION_SHA: instrumentationSha, DIAGNOSTIC_OUTPUT_DIR: output } = env;
  check(/^[0-9a-f]{40}$/.test(releaseSha ?? ''), 'Exact canonical release SHA required');
  check(/^[0-9a-f]{40}$/.test(instrumentationSha ?? ''), 'Exact instrumentation SHA required');
  check(output && path.isAbsolute(output), 'Absolute diagnostic output directory required');
  check(env.PLAYWRIGHT_BASE_URL === 'https://staging.nxttrack.nl', 'Diagnostic is staging-only');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  check(git('rev-parse', 'HEAD').trim() === releaseSha, 'Canonical checkout SHA mismatch');
  const source = readFileSync(path.join(root, canonicalSpecPath), 'utf8');
  const config = readFileSync(path.join(root, canonicalConfigPath), 'utf8');
  check(source === git('show', `${releaseSha}:${canonicalSpecPath}`), 'Canonical test was modified');
  check(config === git('show', `${releaseSha}:${canonicalConfigPath}`), 'Canonical config was modified');
  check(sha256(source) === '03491084c7351e220b8fef1ba8b542baf6075f6eeb7fa8a9cfa21d118b0051e0', 'Unsupported canonical test contract');
  check(sha256(config) === '7ec99e6d95eb50507fd117c05e3d9fd8b167616ce840277629ab6d6681e0a9a2', 'Unsupported canonical 5-second configuration');
  const helper = readFileSync(path.join(instrumentationDirectory, helperName), 'utf8');
  const driver = readFileSync(path.join(instrumentationDirectory, ownName), 'utf8');
  check(helper === git('show', `${instrumentationSha}:scripts/release/${helperName}`), 'Instrumentation helper SHA mismatch');
  check(driver === git('show', `${instrumentationSha}:scripts/release/${ownName}`), 'Instrumentation driver SHA mismatch');

  const start = source.indexOf('async function signIn(');
  const end = source.indexOf('\nfunction collectRuntimeFailures(', start);
  check(start > 0 && end > start, 'Original signIn boundary missing');
  const original = source.slice(start, end);
  const lines = original.trimEnd().split('\n');
  check(lines.length === 8, 'Original signIn contract changed');
  const beforeClick = lines.findIndex((line) => line.includes('.getByRole("button"'));
  const assertion = lines.findIndex((line) => line.includes('await expect(page).toHaveURL('));
  check(beforeClick === 4 && assertion === 6, 'Original submission/assertion contract changed');
  const body = lines.slice(1, -1).flatMap((line, index) => {
    if (index + 1 === beforeClick) return ['    await diagnostic.beforeClick(email, password);', `  ${line}`];
    if (index + 1 === assertion) return ['    await diagnostic.originalAssertion(async () => {', `    ${line}`, '    });'];
    return [`  ${line}`];
  });
  const wrapped = [lines[0], '  await diagnoseCommunicationLogin(page, nextPath, async (diagnostic) => {', ...body, '  });', '}', ''].join('\n');
  const clone = `import { diagnoseCommunicationLogin } from "./helpers/communication-login-diagnostic";\n${source.slice(0, start)}${wrapped}${source.slice(end)}`;
  const diagnosticConfig = `import canonical from "./playwright.config";\nimport { defineConfig } from "@playwright/test";\nexport default defineConfig({ ...canonical, reporter: [["./tests/e2e/helpers/communication-login-diagnostic.ts"]], use: { ...canonical.use, trace: "off", video: "off", screenshot: "off" } });\n`;
  // Exclusive creation: never overwrite a canonical file or a prior diagnostic run.
  for (const [relative, bytes] of [
    ['apps/web/tests/e2e/communication-badges-diagnostic.spec.ts', clone],
    ['apps/web/tests/e2e/helpers/communication-login-diagnostic.ts', helper],
    ['apps/web/playwright.communication-diagnostic.config.ts', diagnosticConfig]
  ]) writeFileSync(path.join(root, relative), bytes, { flag: 'wx', mode: 0o600 });
  const provenance = {
    schemaVersion: 1, diagnosticOnly: true, canonicalReleaseSha: releaseSha, instrumentationSha,
    capturedAt: new Date().toISOString(), originalTestSha256: sha256(source), originalConfigSha256: sha256(config),
    instrumentationHelperSha256: sha256(helper), instrumentationDriverSha256: sha256(driver),
    generatedTestSha256: sha256(clone), generatedConfigSha256: sha256(diagnosticConfig),
    originalAssertionTimeoutMs: 5000, passiveFailureObservationLimitMs: 15000,
    originalTestsPreserved: 4, originalFailureRethrown: true, screenshots: false, video: false, trace: false
  };
  mkdirSync(output, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(output, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return provenance;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { prepareDiagnostic(); process.stdout.write('Prepared four original communication tests with sanitized login observation.\n'); }
  catch { process.stderr.write('Communication diagnostic preparation failed validation.\n'); process.exitCode = 1; }
}
