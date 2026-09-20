#!/usr/bin/env node

import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

// This observation performs only unauthenticated GET requests to fixed health endpoints.
const releaseSha = process.env.RELEASE_SHA ?? '';
assert.ok(process.argv.length === 2, 'This script accepts environment settings only; no command-line arguments.');
assert.ok(releaseSha.length === 40 && /^[a-f0-9]{40}$/.test(releaseSha), 'RELEASE_SHA must be a full lowercase immutable commit SHA.');
const timeoutInput = process.env.OBSERVATION_TIMEOUT_MS ?? '15000';
assert.ok(/^\d{1,5}$/.test(timeoutInput), 'OBSERVATION_TIMEOUT_MS must be an integer from 1000 through 20000.');
const timeoutMs = Number(timeoutInput);
assert.ok(timeoutMs >= 1000 && timeoutMs <= 20000, 'OBSERVATION_TIMEOUT_MS must be an integer from 1000 through 20000.');
const startedAt = new Date().toISOString();
const directoryInput = process.env.OBSERVATION_OUTPUT_DIR ?? `artifacts/v4-observation/${startedAt.replaceAll(':', '-')}-${releaseSha.slice(0, 7)}-${process.pid}`;
assert.ok(directoryInput.trim() && directoryInput.length <= 4096 && !/[\0\r\n]/.test(directoryInput), 'OBSERVATION_OUTPUT_DIR must be a valid nonempty local path.');
const directory = resolve(directoryInput);
const samplesPath = resolve(directory, 'health-samples.jsonl');
const summaryPath = resolve(directory, 'summary.json');
const intervalMs = 60_000;
const durationMs = 30 * intervalMs;
const expectedSamples = 31; // Immediate sample, then one at each minute through minute 30.
const targets = [
  { environment: 'staging', url: 'https://staging.nxttrack.nl/api/health' },
  { environment: 'production', url: 'https://nxttrack.nl/api/health' }
];
const stop = new AbortController();
let interruptedBy = null;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interruptedBy = signal;
  stop.abort();
});
mkdirSync(directory, { recursive: true });
writeFileSync(samplesPath, '', { flag: 'wx' });
const startMonotonic = performance.now();
const elapsed = () => Math.round(performance.now() - startMonotonic);
const record = (value) => appendFileSync(samplesPath, `${JSON.stringify(value)}\n`);
record({ type: 'start', startedAt, releaseSha, durationMs, intervalMs, timeoutMs, expectedSamples, targets });
console.log(`[v4-observation] START ${startedAt} sha=${releaseSha} evidence=${directory}`);
let completedSamples = 0;
const failedSamples = [];
let fatalError = null;
try {
  for (let index = 0; index < expectedSamples && !stop.signal.aborted; index += 1) {
    const dueMs = index * intervalMs;
    const waitMs = dueMs - (performance.now() - startMonotonic);
    if (waitMs > 0) await sleep(waitMs, undefined, { signal: stop.signal });
    const sampleStartedAt = new Date().toISOString();
    const elapsedMs = elapsed();
    const lateByMs = Math.max(0, elapsedMs - dueMs);
    const results = await Promise.all(targets.map(checkHealth));
    const failures = results.flatMap((result) => result.failures.map((check) => `${result.environment}:${check}`));
    // A long scheduling gap must not be hidden by later successful catch-up samples.
    if (lateByMs > 30_000) failures.push('observation:sample-more-than-30-seconds-late');
    const sample = { type: 'sample', index, at: sampleStartedAt, elapsedMs, dueMs, lateByMs, finishedAt: new Date().toISOString(), results, failures, status: failures.length ? 'failed' : 'passed' };
    record(sample);
    completedSamples += 1;
    if (failures.length) failedSamples.push({ index, at: sampleStartedAt, elapsedMs, failures });
    console.log(`[v4-observation] ${sample.status.toUpperCase()} sample=${index} elapsedMs=${elapsedMs} failures=${failures.length}`);
  }
} catch (error) {
  if (!stop.signal.aborted) fatalError = error instanceof Error ? error.message : 'Unexpected observation error';
} finally {
  const elapsedMs = elapsed();
  const complete = completedSamples === expectedSamples && elapsedMs >= durationMs;
  const summary = {
    type: 'summary', releaseSha, startedAt, finishedAt: new Date().toISOString(), elapsedMs,
    durationMs, intervalMs, expectedSamples, completedSamples, failedSampleCount: failedSamples.length, failedSamples,
    interruptedBy, fatalError, complete,
    status: complete && failedSamples.length === 0 && !interruptedBy && !fatalError ? 'passed' : 'failed'
  };
  record(summary);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(summary));
  if (summary.status !== 'passed') process.exitCode = 1;
}

async function checkHealth(target) {
  const before = performance.now();
  const result = { environment: target.environment, url: target.url, at: new Date().toISOString(), elapsedMs: elapsed(), failures: [] };
  try {
    const response = await fetch(target.url, {
      method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store', redirect: 'error',
      signal: AbortSignal.any([stop.signal, AbortSignal.timeout(timeoutMs)])
    });
    result.httpStatus = response.status;
    if (response.status !== 200) {
      result.failures.push('http-status');
      await response.body?.cancel();
    } else {
      const body = await boundedJson(response);
      const checks = {
        ok: body?.ok === true,
        environment: body?.env === target.environment,
        'release-sha': body?.commitSha === releaseSha,
        database: body?.checks?.database?.status === 'pass',
        'schema-compatibility': body?.checks?.schemaCompatibility?.status === 'pass'
      };
      result.failures.push(...Object.keys(checks).filter((name) => !checks[name]));
      result.checks = checks;
      result.observedReleaseSha = typeof body?.commitSha === 'string' && /^[a-f0-9]{40}$/.test(body.commitSha) ? body.commitSha : null;
    }
  } catch {
    result.failures.push(stop.signal.aborted ? 'interrupted' : 'request-timeout-network-or-invalid-json');
  }
  result.durationMs = Math.round(performance.now() - before);
  return result;
}

async function boundedJson(response) {
  assert.ok(response.body, 'Missing health response body.');
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 64 * 1024) {
      await reader.cancel();
      throw new Error('Health response exceeds 64 KiB.');
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
