import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReleaseHealth, verificationConfig } from '../../scripts/release/v4-browser-contract.mjs';

const applicationSha = '4'.repeat(40);
const verifierSha = 'a'.repeat(40);
const config = verificationConfig({ TARGET: 'production', RELEASE_SHA: applicationSha, VERIFIER_SOURCE_SHA: verifierSha });
const health = () => ({ ok: true, env: 'production', commitSha: applicationSha, checks: { database: { status: 'pass' }, schemaCompatibility: { status: 'pass' } } });

test('verification pins the deployed application separately from its verification source', () => {
  assert.equal(config.releaseSha, applicationSha);
  assert.equal(config.verifierSourceSha, verifierSha);
  assert.equal(config.origin, 'https://nxttrack.nl');
  assert.equal(config.adminOrigin, 'https://admin.nxttrack.nl');
  assert.doesNotThrow(() => assertReleaseHealth(200, health(), config));
  assert.throws(() => assertReleaseHealth(200, { ...health(), commitSha: verifierSha }, config), /application SHA/);
});

test('verification rejects implicit environments and mutable or shortened release identities', () => {
  for (const TARGET of [undefined, '', 'prod', 'development']) {
    assert.throws(() => verificationConfig({ TARGET, RELEASE_SHA: applicationSha, VERIFIER_SOURCE_SHA: verifierSha }), /TARGET/);
  }
  for (const RELEASE_SHA of [undefined, 'main', '4248c35', applicationSha + '\n']) {
    assert.throws(() => verificationConfig({ TARGET: 'staging', RELEASE_SHA, VERIFIER_SOURCE_SHA: verifierSha }), /RELEASE_SHA/);
  }
  assert.throws(() => verificationConfig({ TARGET: 'staging', RELEASE_SHA: applicationSha }), /VERIFIER_SOURCE_SHA/);
});

test('a green health payload cannot conceal wrong environment, unavailable database, or incompatible schema', () => {
  assert.throws(() => assertReleaseHealth(503, health(), config), /HTTP 200/);
  assert.throws(() => assertReleaseHealth(200, { ...health(), env: 'staging' }, config), /environment/);
  assert.throws(() => assertReleaseHealth(200, { ...health(), ok: false }, config), /health must pass/);
  const noDatabase = health();
  noDatabase.checks.database.status = 'fail';
  assert.throws(() => assertReleaseHealth(200, noDatabase, config), /Database/);
  const incompatible = health();
  incompatible.checks.schemaCompatibility.status = 'fail';
  assert.throws(() => assertReleaseHealth(200, incompatible, config), /Schema/);
  assert.throws(() => assertReleaseHealth(200, undefined, config), /health/);
});
