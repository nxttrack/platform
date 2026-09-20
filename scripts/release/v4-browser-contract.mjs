import assert from 'node:assert/strict';

export function verificationConfig(env) {
  assert.ok(['staging', 'production'].includes(env.TARGET), 'TARGET must explicitly be staging or production');
  assert.match(env.RELEASE_SHA ?? '', /^[a-f0-9]{40}$/, 'RELEASE_SHA must be a full immutable commit SHA');
  assert.match(env.VERIFIER_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/, 'VERIFIER_SOURCE_SHA must identify the verification source');
  const origin = env.TARGET === 'production' ? 'https://nxttrack.nl' : 'https://staging.nxttrack.nl';
  return {
    target: env.TARGET,
    releaseSha: env.RELEASE_SHA,
    verifierSourceSha: env.VERIFIER_SOURCE_SHA,
    origin,
    adminOrigin: env.TARGET === 'production' ? 'https://admin.nxttrack.nl' : origin,
    tenantOrigin: 'https://aquaswim-demo.staging.nxttrack.nl'
  };
}

export function assertReleaseHealth(status, health, config) {
  assert.equal(status, 200, 'Health endpoint must return HTTP 200');
  assert.equal(health?.ok, true, 'Runtime health must pass');
  assert.equal(health?.env, config.target, 'Runtime must match the selected environment');
  assert.equal(health?.commitSha, config.releaseSha, 'Runtime must match the requested application SHA');
  assert.equal(health?.checks?.database?.status, 'pass', 'Database health must pass');
  assert.equal(health?.checks?.schemaCompatibility?.status, 'pass', 'Schema compatibility must pass');
}
