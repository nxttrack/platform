import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePlan, safeSqlError, inspectParentRls } from '../../scripts/release/inspect-parent-rls-timeout.mjs';

test('plan output retains useful structure and helper names without expressions or identities', () => {
  const secret = 'private@example.com';
  const uuid = '10000000-0000-4000-8000-000000000001';
  const plan = summarizePlan([{ Plan: { 'Node Type': 'Index Scan', 'Index Name': 'participant_progress_scores_participant_idx', 'Plan Rows': 12,
    'Index Cond': `tenant_id = '${uuid}'`, Filter: `is_portal_session_restricted() AND request.jwt.claims = '${secret}'`,
    Output: [secret], 'Alias': uuid, unknown: { token: secret } } }]);
  assert.equal(plan.Plan['Node Type'], 'Index Scan');
  assert.equal(plan.Plan['Plan Rows'], 12);
  assert.deepEqual(plan.Plan.referencedHelpers, ['is_portal_session_restricted']);
  assert.ok(!JSON.stringify(plan).includes(secret));
  assert.ok(!JSON.stringify(plan).includes(uuid));
});

test('plan tree and arbitrary database error messages are bounded and redacted', () => {
  let value = { 'Node Type': 'Result' };
  for (let i = 0; i < 30; i++) value = { 'Node Type': 'Nested Loop', Plans: [value] };
  assert.match(JSON.stringify(summarizePlan({ Plan: value })), /truncated/);
  assert.deepEqual(safeSqlError({ code: '57014', message: 'secret@example.com', detail: 'jwt secret' }), { status: 'timeout', sqlState: '57014' });
  assert.deepEqual(safeSqlError({ code: 'secret@example.com' }), { status: 'error', sqlState: null });
});

test('non-staging and shortened release identities fail before loading credentials or connecting', async () => {
  await assert.rejects(inspectParentRls({ TARGET: 'production' }), /limited to staging/);
  await assert.rejects(inspectParentRls({ TARGET: 'staging', RELEASE_SHA: '30af2d9' }), /full release SHA/);
});
