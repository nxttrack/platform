import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertHealth, parseServiceStatus } from '../../scripts/release/inspect-v4-host-stability.mjs';

const sample = 'MainPID=1234\nNRestarts=0\nActiveState=active\nSubState=running\nActiveEnterTimestamp=Sun 2026-09-20 12:00:00 UTC\n';

test('host snapshot retains only the requested non-sensitive systemd properties', () => {
  assert.deepEqual(parseServiceStatus(sample), { MainPID: 1234, NRestarts: 0, ActiveState: 'active', SubState: 'running', ActiveEnterTimestamp: 'Sun 2026-09-20 12:00:00 UTC' });
  for (const bad of [sample + 'Environment=private-value\n', sample + 'MainPID=2\n', sample.replace('NRestarts=0\n', ''), sample.replace('MainPID=1234', 'MainPID=private-value')]) {
    assert.throws(() => parseServiceStatus(bad), (error) => !error.message.includes('private-value'));
  }
});

test('host snapshot health requires exact release, environment, database and schema', () => {
  const sha = 'a'.repeat(40);
  const health = { app: 'nxttrack-platform', ok: true, env: 'production', commitSha: sha, checks: { database: { status: 'pass' }, schemaCompatibility: { status: 'pass' } } };
  assert.doesNotThrow(() => assertHealth(health, 'production', sha));
  for (const bad of [{ ...health, app: 'other-app' }, { ...health, env: 'staging' }, { ...health, commitSha: 'b'.repeat(40) }, { ...health, ok: false }, { ...health, checks: {} }]) {
    assert.throws(() => assertHealth(bad, 'production', sha));
  }
});
