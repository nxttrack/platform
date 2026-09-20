#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const targets = Object.freeze({
  staging: { base: '/var/www/nxttrack/staging', service: 'nxttrack-staging', url: 'https://staging.nxttrack.nl/api/health' },
  production: { base: '/var/www/nxttrack/production', service: 'nxttrack-production', url: 'https://nxttrack.nl/api/health' }
});
const properties = ['ActiveState', 'SubState', 'MainPID', 'NRestarts', 'ActiveEnterTimestamp'];
const requireCheck = (condition) => assert.ok(condition, 'Host stability snapshot validation failed.');

export function parseServiceStatus(text) {
  requireCheck(typeof text === 'string' && text.length <= 8192);
  const values = {};
  for (const line of text.trim().split('\n')) {
    const separator = line.indexOf('=');
    const name = line.slice(0, separator);
    requireCheck(separator > 0 && properties.includes(name) && !Object.hasOwn(values, name));
    values[name] = line.slice(separator + 1).trim();
  }
  requireCheck(properties.every((name) => Object.hasOwn(values, name)));
  requireCheck(/^[a-z-]{1,32}$/.test(values.ActiveState) && /^[a-z-]{1,32}$/.test(values.SubState));
  for (const name of ['MainPID', 'NRestarts']) {
    requireCheck(/^\d{1,15}$/.test(values[name]) && Number.isSafeInteger(Number(values[name])));
    values[name] = Number(values[name]);
  }
  requireCheck(values.ActiveEnterTimestamp.length <= 80 && /^[A-Za-z0-9 :+.-]+$/.test(values.ActiveEnterTimestamp)
    && Number.isFinite(Date.parse(values.ActiveEnterTimestamp)));
  return values;
}

export function assertHealth(body, target, releaseSha) {
  requireCheck(body?.app === 'nxttrack-platform' && body?.ok === true && body?.env === target && body?.commitSha === releaseSha
    && body?.checks?.database?.status === 'pass' && body?.checks?.schemaCompatibility?.status === 'pass');
}

function activeIdentity(config, releaseSha) {
  const directory = realpathSync(join(config.base, 'current'));
  requireCheck(dirname(directory) === join(config.base, 'releases'));
  const file = join(directory, 'artifacts/exact-source-sha.json');
  requireCheck(statSync(file).size <= 65536);
  const bytes = readFileSync(file, 'utf8');
  const identity = JSON.parse(bytes);
  requireCheck(identity?.schemaVersion === 1 && identity?.purpose === 'nxttrack-exact-source-sha'
    && identity?.repository === 'nxttrack/platform' && identity?.commitSha === releaseSha);
  return { directory, bytes };
}

async function checkPublicHealth(config, target, releaseSha) {
  const response = await fetch(config.url, {
    method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', cache: 'no-store',
    signal: AbortSignal.timeout(15000)
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    requireCheck(false);
  }
  requireCheck(response.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    requireCheck(size <= 65536);
    chunks.push(chunk);
  }
  assertHealth(JSON.parse(Buffer.concat(chunks).toString('utf8')), target, releaseSha);
}

export async function main() {
  const target = process.env.TARGET;
  const releaseSha = process.env.RELEASE_SHA ?? '';
  const output = process.env.HOST_STABILITY_OUTPUT ?? '';
  requireCheck(process.argv.length === 2 && Object.hasOwn(targets, target));
  requireCheck(releaseSha.length === 40 && /^[a-f0-9]{40}$/.test(releaseSha));
  requireCheck(output.length > 0 && output.length <= 4096 && !/[\0\r\n]/.test(output));
  const config = targets[target];
  const report = { target, releaseSha, startedAt: new Date().toISOString(), status: 'failed', services: {} };
  try {
    const before = activeIdentity(config, releaseSha);
    await checkPublicHealth(config, target, releaseSha);
    report.health = 'passed';
    for (const service of [config.service, 'caddy']) {
      // Fixed services and five allowlisted properties; no shell, journal, config or credentials.
      const text = execFileSync('systemctl', ['show', service, `--property=${properties.join(',')}`], {
        encoding: 'utf8', timeout: 5000, maxBuffer: 8192, stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, TZ: 'UTC', SYSTEMD_COLORS: '0', SYSTEMD_PAGER: '' }
      });
      const state = parseServiceStatus(text);
      report.services[service] = { observedAt: new Date().toISOString(), ...state };
      requireCheck(state.ActiveState === 'active' && state.SubState === 'running' && state.MainPID > 0);
    }
    const after = activeIdentity(config, releaseSha);
    requireCheck(before.directory === after.directory && before.bytes === after.bytes);
    report.immutableIdentity = 'passed-and-unchanged';
    report.status = 'passed';
  } catch {
    report.failure = 'identity-health-or-service-validation-failed';
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify(report));
    if (report.status !== 'passed') process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('[v4-host-stability] Snapshot failed; no raw command output or configuration is logged.');
    process.exitCode = 1;
  });
}
