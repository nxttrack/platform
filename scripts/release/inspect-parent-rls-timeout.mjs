import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const helperNames = ['current_user_can_instruct_participant', 'current_user_can_view_participant', 'is_portal_session_restricted'];
const numberFields = ['Startup Cost', 'Total Cost', 'Plan Rows', 'Plan Width', 'Actual Rows', 'Actual Loops', 'Planning Time', 'Execution Time'];
const nameFields = ['Node Type', 'Relation Name', 'Index Name', 'Join Type', 'Parent Relationship', 'Strategy'];

// Expression text can contain inlined user/session UUIDs or claims. Never retain it.
export function summarizePlan(value) {
  let nodes = 0;
  function visit(input, depth = 0) {
    if (!input || typeof input !== 'object' || depth > 12 || nodes++ >= 120) return { truncated: true };
    const output = {};
    for (const key of numberFields) if (Number.isFinite(input[key])) output[key] = input[key];
    for (const key of nameFields) if (typeof input[key] === 'string' && /^[a-zA-Z_][a-zA-Z0-9_ ]{0,127}$/.test(input[key])) output[key] = input[key];
    const expressions = ['Filter', 'Index Cond', 'Join Filter', 'Hash Cond', 'Recheck Cond'].filter((key) => typeof input[key] === 'string');
    if (expressions.length) {
      output.expressionKinds = expressions;
      output.referencedHelpers = helperNames.filter((name) => expressions.some((key) => input[key].includes(name)));
    }
    if (input.Plan) output.Plan = visit(input.Plan, depth + 1);
    if (Array.isArray(input.Plans)) output.Plans = input.Plans.slice(0, 24).map((plan) => visit(plan, depth + 1));
    return output;
  }
  return visit(Array.isArray(value) ? value[0] : value);
}

export function safeSqlError(error) {
  return { status: error?.code === '57014' ? 'timeout' : 'error', sqlState: /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : null };
}

export async function inspectParentRls(env = process.env) {
  assert.equal(env.TARGET, 'staging', 'Diagnostic is limited to staging.');
  assert.ok(/^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? ''), 'A full release SHA is required.');
  assert.ok(env.DATABASE_URL, 'Staging DATABASE_URL is required.');
  const result = { diagnosticOnly: true, target: 'staging', requestedReleaseSha: env.RELEASE_SHA, verifierSourceSha: env.GITHUB_SHA ?? null, startedAt: new Date().toISOString(), statementTimeoutMs: 2000, observations: [] };
  let client, stage = 'fixture-identity';
  try {
    // Existing synthetic Phase 16 identity, bound below to the staging demo tenant.
    // It is a selection constant only and is never included in diagnostic output.
    const email = 'phase16-parent@nxttrack.nl';
    const { default: pg } = await import('pg');
    client = new pg.Client({ connectionString: env.DATABASE_URL, application_name: 'nxttrack-parent-rls-read-only-diagnostic', connectionTimeoutMillis: 5000, statement_timeout: 2000, query_timeout: 5000 });
    await client.connect();
    await client.query('begin read only');
    // Transaction poolers need an explicit transaction-local server limit;
    // client startup parameters alone do not prove the server applied it.
    await client.query("set local statement_timeout = '2s'");
    await client.query("set local lock_timeout = '500ms'");
    await client.query("set local idle_in_transaction_session_timeout = '15s'");
    stage = 'existing-parent-session';
    const identity = (await client.query(`
      select pc.auth_user_id, pc.tenant_id, pc.session_id
      from app_private.portal_parent_session_contexts pc
      join auth.users u on u.id = pc.auth_user_id
      join auth.sessions s on s.id = pc.session_id and s.user_id = pc.auth_user_id
      join public.tenants t on t.id = pc.tenant_id and t.slug = 'aquaswim-demo' and t.status = 'active'
      where lower(u.email) = lower($1) and pc.context_version = 1
        and pc.last_verified_at > now() - interval '6 hours'
        and (s.not_after is null or s.not_after > now())
        and not exists (select 1 from app_private.portal_session_contexts c where c.session_id = pc.session_id)
        and exists (select 1 from public.tenant_memberships m where m.tenant_id = pc.tenant_id and m.user_id = pc.auth_user_id and m.role = 'parent' and m.status = 'active')
        and not exists (select 1 from public.platform_memberships m where m.user_id = pc.auth_user_id and m.status = 'active')
      order by pc.last_verified_at desc limit 1`, [email])).rows[0];
    assert.ok(identity, 'No recent existing unrestricted parent context is available; nothing will be initialized.');
    const ownParticipants = (await client.query(`select p.id from public.participants p
      where p.tenant_id=$1 and p.status='active' and (p.guardian_user_id=$2 or exists
        (select 1 from public.participant_guardians g where g.tenant_id=p.tenant_id and g.participant_id=p.id and g.guardian_user_id=$2 and g.status='active'))
      order by p.id limit 101`, [identity.tenant_id, identity.auth_user_id])).rows.map((row) => row.id);
    assert.ok(ownParticipants.length > 0 && ownParticipants.length <= 100, 'Expected a bounded set of existing linked fixture participants.');
    result.session = { existingContext: true, recentWithinHours: 6, notExpired: true, childContextAbsent: true, linkedParticipants: ownParticipants.length };

    async function observation(label, sql, parameters = [], transform = (rows) => rows) {
      const before = performance.now();
      await client.query('savepoint diagnostic_query');
      try {
        const query = await client.query(sql, parameters);
        const entry = { label, status: 'completed', durationMs: Math.round(performance.now() - before), data: transform(query.rows) };
        result.observations.push(entry);
      } catch (error) {
        await client.query('rollback to savepoint diagnostic_query');
        result.observations.push({ label, ...safeSqlError(error), durationMs: Math.round(performance.now() - before) });
      } finally { await client.query('release savepoint diagnostic_query'); }
    }

    stage = 'aggregate-inventory';
    await observation('privileged-score-inventory-by-tenant', `select tenant_id, count(*)::int as score_rows, count(distinct participant_id)::int as participant_count
      from public.participant_progress_scores group by tenant_id order by count(*) desc limit 51`, [], (rows) => ({
        truncated: rows.length > 50,
        tenants: rows.slice(0, 50).map((row, index) => ({ ordinal: index + 1, selectedTenant: row.tenant_id === identity.tenant_id, scoreRows: row.score_rows, participantCount: row.participant_count }))
      }));
    await observation('privileged-helper-metadata', `select p.proname, p.prosecdef, p.provolatile, r.rolname, r.rolbypassrls, p.proconfig
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner
      where n.nspname='app_private' and p.proname=any($1::text[]) limit 10`, [helperNames], (rows) => rows.map((row) => ({
        name: row.proname, securityDefiner: row.prosecdef, volatility: row.provolatile, owner: ['postgres', 'supabase_admin', 'service_role'].includes(row.rolname) ? row.rolname : 'other-role', ownerBypassesRls: row.rolbypassrls,
        configuration: (row.proconfig ?? []).filter((value) => /^(search_path|row_security|statement_timeout)=[a-zA-Z0-9_, ."]{0,160}$/.test(value))
      })));

    stage = 'authenticated-role-and-guard';
    await client.query("select set_config('request.jwt.claims', $1, true), set_config('request.path', '/participant_progress_scores', true), set_config('request.method', 'GET', true)", [JSON.stringify({ sub: identity.auth_user_id, role: 'authenticated', session_id: identity.session_id, aud: 'authenticated' })]);
    await client.query('set local role authenticated');
    await client.query('set local row_security = on');
    const context = (await client.query(`select current_user='authenticated' as authenticated,
      current_setting('transaction_read_only')='on' as read_only,
      current_setting('statement_timeout')='2s' as timeout_bound,
      row_security_active('public.participant_progress_scores') as rls_active,
      auth.uid()=$1::uuid as user_bound, app_private.jwt_session_id()=$2::uuid as session_bound`, [identity.auth_user_id, identity.session_id])).rows[0];
    assert.ok(Object.values(context).every((value) => value === true), 'Authenticated read-only RLS context did not verify.');
    await client.query('select app_private.enforce_portal_session_data_api()');
    result.authorization = { ...context, preRequestGuardPassed: true };

    stage = 'authenticated-diagnostics';
    const cases = [
      ['all-scores', 'select tenant_id from public.participant_progress_scores limit 50', []],
      ['own-tenant-and-participants', 'select tenant_id from public.participant_progress_scores where tenant_id=$1 and participant_id=any($2::uuid[]) limit 50', [identity.tenant_id, ownParticipants]]
    ];
    for (const [label, sql, parameters] of cases) {
      await observation(`${label}:plan`, `explain (analyze false, costs true, format json) ${sql}`, parameters, (rows) => summarizePlan(rows[0]['QUERY PLAN']));
      await observation(`${label}:bounded-visible-count`, `select count(*)::int as visible_rows_at_most_50 from (${sql}) sample`, parameters);
    }
    await observation('session-restriction-helper', 'select app_private.is_portal_session_restricted() as restricted');
    await observation('own-participant:can-instruct-helper', 'select app_private.current_user_can_instruct_participant($1::uuid) as permitted', [ownParticipants[0]]);
    await observation('own-participant:can-view-helper', 'select app_private.current_user_can_view_participant($1::uuid) as permitted', [ownParticipants[0]]);
    result.completed = true;
  } catch (error) {
    result.failure = { stage, ...safeSqlError(error) };
    result.completed = false;
  } finally {
    if (client) {
      await client.query('rollback').catch(() => undefined);
      await client.end().catch(() => undefined);
    }
    result.finishedAt = new Date().toISOString();
    result.queryErrors = result.observations.filter((item) => item.status !== 'completed').length;
    result.status = result.completed && result.queryErrors === 0 ? 'diagnostic-complete' : 'diagnostic-recorded-errors';
    if (env.PARENT_RLS_DIAGNOSTIC_OUTPUT) {
      mkdirSync(dirname(env.PARENT_RLS_DIAGNOSTIC_OUTPUT), { recursive: true });
      writeFileSync(env.PARENT_RLS_DIAGNOSTIC_OUTPUT, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await inspectParentRls();
    console.log(JSON.stringify(result, null, 2));
    if (!result.completed || result.queryErrors) process.exitCode = 1;
  } catch {
    console.error('[parent-rls-diagnostic] Invalid diagnostic input; no database action was requested.');
    process.exitCode = 1;
  }
}
