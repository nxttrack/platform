import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

/** Real commands in the same isolated database as the publication test. */
export async function testWorldBindingContracts(client: pg.Client, databaseUrl: string, manager: string, tenantAdmin: string, theme: string, release: string, world: string) {
  const tenant = randomUUID(), otherTenant = randomUUID(), program = randomUUID(), version = randomUUID(), stage = randomUUID(), otherStage = randomUUID(), participant = randomUUID(), session = randomUUID();
  await client.query("reset role");
  await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictional visual tenant'),($3,$4,'Other fictional tenant')", [tenant, `theme-${tenant}`, otherTenant, `theme-${otherTenant}`]);
  await client.query("insert into public.tenant_settings(tenant_id) values($1),($2)", [tenant, otherTenant]);
  await client.query("insert into public.tenant_memberships(tenant_id,user_id,role) values($1,$2,'tenant_admin')", [tenant, tenantAdmin]);
  await client.query("insert into public.programs(id,tenant_id,name,status) values($1,$2,'Unrelated curriculum names','active')", [program, tenant]);
  await client.query("insert into public.curriculum_versions(id,tenant_id,program_id,version_number,name) values($1,$2,$3,1,'Canonical test curriculum')", [version, tenant, program]);
  await client.query("insert into public.curriculum_stages(id,tenant_id,curriculum_version_id,stable_key,name) values($1,$2,$3,'stage-x','Deliberately not a world name'),($4,$2,$3,'stage-y','Other stage')", [stage, tenant, version, otherStage]);
  await client.query("select set_config('app.swim_publish_authorized',$1,false)", [version]);
  await client.query("update public.curriculum_versions set status='published',published_at=now(),published_by_user_id=$2 where id=$1", [version, manager]);
  const beforeCurriculum = (await client.query("select to_jsonb(v) data from public.curriculum_versions v where v.id=$1", [version])).rows[0].data;
  await client.query("insert into public.participants(id,tenant_id,guardian_user_id,display_name) values($1,$2,$3,'Fictional learner')", [participant, tenant, tenantAdmin]);
  await client.query(`insert into app_private.portal_session_contexts(session_id,auth_user_id,tenant_id,participant_id,capabilities,expires_at)
    values($1,$2,$3,$4,array['today.read','journey.read_child_safe','badges.read_child_safe','schedule.read_child_safe','achievements.read_child_safe','approved_media.read_child_safe','child_preferences.write_safe','parent_request.create_safe'],now()+interval '1 hour')`, [session, tenantAdmin, tenant, participant]);
  await client.query("set role service_role");
  await client.query("select public.set_tenant_portal_theme_availability($1,$2,$3,true,$4,'Fictional selection test')", [tenant, theme, release, manager]);
  const selectTheme = "select public.select_available_tenant_portal_theme($1,$2,$3,$4,'Explicit tenant choice')";
  await client.query(selectTheme, [tenant, theme, release, tenantAdmin]);
  const prefs = "select public.save_child_portal_preferences_for_service($1,$2,$3,$4,true,false,false,false,$5,$6)";
  await client.query(prefs, [session, tenantAdmin, tenant, participant, theme, release]);
  const bind = "select public.bind_portal_theme_world($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'Explicit world choice',$11) as id";
  const args = (expected: string | null, restored: string | null = null) => [manager, tenant, program, version, stage, theme, release, world, "{}", expected, restored];
  await assert.rejects(client.query(bind, args(null)), /platform_managed_target_required/);
  await assert.rejects(client.query("select public.set_portal_theme_management_mode($1,$2,'platform','Explicit opt in')", [tenantAdmin, tenant]), /platform_theme_manager_required/);
  await client.query("select public.set_portal_theme_management_mode($1,$2,'platform','Explicit opt in')", [manager, tenant]);
  const draftVersion=randomUUID(),draftStage=randomUUID();
  await client.query("insert into public.curriculum_versions(id,tenant_id,program_id,version_number,name) values($1,$2,$3,2,'Unpublished cannot bind')",[draftVersion,tenant,program]);
  await client.query("insert into public.curriculum_stages(id,tenant_id,curriculum_version_id,stable_key,name) values($1,$2,$3,'draft-stage','Not published')",[draftStage,tenant,draftVersion]);
  const draftArgs=args(null);draftArgs[3]=draftVersion;draftArgs[4]=draftStage;
  await assert.rejects(client.query(bind,draftArgs),/published_curriculum_required/);
  // Must reject even selecting the already active release: the historical early-return cannot bypass policy.
  await assert.rejects(client.query(selectTheme, [tenant, theme, release, tenantAdmin]), /theme_is_platform_managed/);
  await assert.rejects(client.query(prefs, [session, tenantAdmin, tenant, participant, theme, release]), /theme_is_platform_managed/);
  await client.query(prefs, [session, tenantAdmin, tenant, participant, null, null]);
  const wrong = args(null); wrong[2] = randomUUID();
  await assert.rejects(client.query(bind, wrong), /curriculum_binding_mismatch/);
  const noWorld = args(null); noWorld[7] = "invented-world";
  await assert.rejects(client.query(bind, noWorld), /published_world_required/);
  const neutral = args(null); neutral[8] = '{"invented-criterion":"invented-asset"}';
  await assert.rejects(client.query(bind, neutral), /neutral_pearl_policy|criterion_identity_mismatch/);
  const first = (await client.query(bind, args(null))).rows[0].id as string;
  const other = new pg.Client({ connectionString: databaseUrl }); await other.connect();
  let second: string;
  try {
    await other.query("set role service_role");
    const results = await Promise.allSettled([client.query(bind, args(first)), other.query(bind, args(first))]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected" && /binding_revision_conflict/.test(String(r.reason))).length, 1);
    const success = results.find((r) => r.status === "fulfilled"); if (success?.status !== "fulfilled") throw new Error("No binding winner");
    second = success.value.rows[0].id;
  } finally { await other.end(); }
  const rolledBack = (await client.query(bind, args(second, first))).rows[0].id;
  assert.deepEqual((await client.query("select theme_key,theme_release,world_id,criterion_artwork_json from public.portal_theme_world_binding where id=$1", [rolledBack])).rows[0], { theme_key: theme, theme_release: release, world_id: world, criterion_artwork_json: {} });
  await assert.rejects(client.query("update public.portal_theme_world_binding set world_id='tampered' where id=$1", [first]), /binding_history_immutable/);
  await assert.rejects(client.query("select public.set_portal_theme_management_mode($1,$2,'legacy','Return to legacy')", [manager, tenant]), /remove_world_bindings/);
  assert.equal((await client.query("select count(*) from public.portal_theme_world_binding where tenant_id=$1 or curriculum_stage_id=$2", [otherTenant, otherStage])).rows[0].count, "0");
  assert.deepEqual((await client.query("select to_jsonb(v) data from public.curriculum_versions v where v.id=$1", [version])).rows[0].data, beforeCurriculum);
  // Tenant settings remain read-only through authenticated RLS: a direct API update affects no row.
  await client.query("reset role"); await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [tenantAdmin]);
  const deniedUpdate = await client.query("update public.tenant_settings set portal_theme_management_mode='legacy' where tenant_id=$1", [tenant]).catch((error: { code: string }) => {
    assert.equal(error.code, "42501"); return { rowCount: 0 };
  });
  assert.equal(deniedUpdate.rowCount, 0);
  assert.equal((await client.query("select count(*) from public.portal_theme_world_binding where tenant_id=$1", [tenant])).rows[0].count, "0");
  await assert.rejects(client.query(bind, args(rolledBack)), /permission denied/);
  await client.query("reset role"); await client.query("set role service_role");
  assert.equal((await client.query("select portal_theme_management_mode from public.tenant_settings where tenant_id=$1", [tenant])).rows[0].portal_theme_management_mode, "platform");
  // A reconnect reads the current binding; nothing lives only in browser state.
  const restarted = new pg.Client({ connectionString: databaseUrl }); await restarted.connect();
  try { assert.equal((await restarted.query("select id from public.portal_theme_world_binding where tenant_id=$1 and deactivated_at is null", [tenant])).rows[0].id, rolledBack); } finally { await restarted.end(); }
  await client.query("select public.remove_portal_theme_world_binding($1,$2,'Explicit unbind')", [manager, rolledBack]);
  await client.query("select public.set_portal_theme_management_mode($1,$2,'legacy','Return to legacy')", [manager, tenant]);
  await client.query(selectTheme, [tenant, theme, release, tenantAdmin]);
  assert.equal((await client.query("select count(*) from public.portal_theme_world_binding where tenant_id=$1", [tenant])).rows[0].count, "3");
  console.log("PASS world binding identities, tenant isolation, concurrent edits, complete rollback, immutable history, reconnect, curriculum unchanged, legacy opt-in and child/tenant/direct API enforcement");
}
