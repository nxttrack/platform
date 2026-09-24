import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { childPortalCapabilities, parseChildPortalSessionContext } from "../../apps/web/lib/auth/portal-session-contract";

/** Called after a real local import/review/publication; no fabricated theme row. */
export async function testCollectionContracts(client: pg.Client, databaseUrl: string, manager: string, theme: string, release: string, world: string) {
  const [tenant,parent,viewer,stranger,participant,sibling,program,version,stage,enrollment,parentSession,viewerSession,legacyChildSession,childSession,strangerSession] = Array.from({length:15},()=>randomUUID());
  await client.query("reset role");
  for(const user of [parent,viewer,stranger]) await client.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'{}','{}')",[user,`${user}@example.test`]);
  for(const [id,user] of [[parentSession,parent],[viewerSession,viewer],[legacyChildSession,parent],[childSession,parent],[strangerSession,stranger]]) await client.query("insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())",[id,user]);
  await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictional collection school')",[tenant,`collection-${tenant}`]);
  await client.query("insert into public.tenant_settings(tenant_id) values($1)",[tenant]);
  for(const user of [parent,viewer,stranger]) await client.query("insert into public.tenant_memberships(tenant_id,user_id,role) values($1,$2,'parent')",[tenant,user]);
  await client.query("insert into public.participants(id,tenant_id,guardian_user_id,display_name) values($1,$2,$3,'Fictional collector'),($4,$2,$3,'Fictional sibling')",[participant,tenant,parent,sibling]);
  await client.query("insert into public.participant_guardians(tenant_id,participant_id,guardian_user_id,relationship,access_level,status) values($1,$2,$3,'other','view_only','active')",[tenant,participant,viewer]);
  await client.query("insert into public.programs(id,tenant_id,name,status) values($1,$2,'Fictional curriculum','active')",[program,tenant]);
  await client.query("insert into public.curriculum_versions(id,tenant_id,program_id,version_number,name) values($1,$2,$3,1,'Fictional published curriculum')",[version,tenant,program]);
  await client.query("insert into public.curriculum_stages(id,tenant_id,curriculum_version_id,stable_key,name) values($1,$2,$3,'unrelated-stage','Stage has no collectible identity')",[stage,tenant,version]);
  await client.query("select set_config('app.swim_publish_authorized',$1,false)",[version]);
  await client.query("update public.curriculum_versions set status='published',published_at=now(),published_by_user_id=$2 where id=$1",[version,manager]);
  await client.query("insert into public.enrollments(id,tenant_id,participant_id,program_id,curriculum_version_id,status) values($1,$2,$3,$4,$5,'active')",[enrollment,tenant,participant,program,version]);
  await client.query("insert into public.tenant_swim_rollouts(tenant_id,feature_key,status,config_json) values($1,'swim.portal.parent_child_split','enabled','{}'),($1,'swim.portal.child_mode','enabled','{\"absoluteTtlMinutes\":60}')",[tenant]);
  await client.query("set role service_role");
  for(const [session,user] of [[parentSession,parent],[viewerSession,viewer],[legacyChildSession,parent],[childSession,parent],[strangerSession,stranger]]) await client.query("select public.initialize_parent_portal_session_for_service($1,$2,$3)",[session,user,tenant]);
  await client.query("select public.set_portal_theme_management_mode($1,$2,'platform','Explicit fixture opt-in')",[manager,tenant]);
  const binding=(await client.query("select public.bind_portal_theme_world($1,$2,$3,$4,$5,$6,$7,$8,'{}',null,'Fictional collection world',null) as id",[manager,tenant,program,version,stage,theme,release,world])).rows[0].id;
  const legacy=(await client.query("select public.start_child_portal_session_for_service($1,$2,$3,$4,1) as value",[legacyChildSession,parent,tenant,participant])).rows[0].value;
  const child=(await client.query("select public.start_child_portal_presentation_session_for_service($1,$2,$3,$4,1) as value",[childSession,parent,tenant,participant])).rows[0].value;
  assert.deepEqual(legacy.capabilities,childPortalCapabilities);assert.deepEqual(child.capabilities,childPortalCapabilities);
  assert.ok(parseChildPortalSessionContext(legacy));assert.ok(parseChildPortalSessionContext(child));
  const read="select public.read_portal_collection_for_service($1,$2,$3,$4,null,now()) as value";
  const discover="select public.discover_portal_collection_for_service($1,$2,$3,$4,$5,$6,$7) as value";
  const save="select public.save_portal_collection_for_service($1,$2,$3,$4,$5,$6) as value";
  const base=[childSession,parent,tenant,participant], request=randomUUID(), discoverArgs=[...base,theme,release,request];
  const before = await businessSnapshot(client,tenant);
  assert.equal((await client.query(read,[legacyChildSession,parent,tenant,participant])).rows[0].value.canWrite,false);
  assert.equal((await client.query(read,base)).rows[0].value.canWrite,true);
  await assert.rejects(client.query(discover,[legacyChildSession,parent,tenant,participant,theme,release,randomUUID()]),/collection_child_capability_required/);
  await assert.rejects(client.query(discover,[viewerSession,viewer,tenant,participant,theme,release,randomUUID()]),/collection_access_denied/);
  await assert.rejects(client.query(read,[strangerSession,stranger,tenant,participant]),/collection_access_denied/);
  await assert.rejects(client.query(read,[childSession,parent,tenant,sibling]),/collection_child_capability_required/);
  await assert.rejects(client.query(discover,[...base,theme,"999999.0.0",randomUUID()]),/collection_theme_context_changed/);

  const other=new pg.Client({connectionString:databaseUrl});await other.connect();
  let offer:Record<string,unknown>;
  try {
    await other.query("set role service_role");
    const offered=await Promise.all([client.query(discover,discoverArgs),other.query(discover,discoverArgs)]);
    offer=offered[0].rows[0].value;assert.deepEqual(offered[1].rows[0].value,offer,"Same request is a single random draw");
    assert.equal((await client.query(read,base)).rows[0].value.items.length,0,"Finding is not yet saving");
    await assert.rejects(client.query(save,[...base,offer.id,false]),/collection_confirmation_required/);
    await assert.rejects(client.query(save,[viewerSession,viewer,tenant,participant,offer.id,true]),/collection_access_denied/);
    await client.query("reset role");
    const trigger=`collection_test_${tenant.replaceAll("-","")}`;
    await client.query("create function pg_temp.reject_collection_save() returns trigger language plpgsql as $$ begin raise exception 'fictional_collection_storage_failure'; end $$");
    await client.query(`create trigger ${trigger} before update on app_private.portal_collection_offers for each row when (new.id = '${offer.id}'::uuid) execute function pg_temp.reject_collection_save()`);
    try {
      await client.query("set role service_role");
      await assert.rejects(client.query(save,[...base,offer.id,true]),/fictional_collection_storage_failure/);
      assert.equal((await client.query(read,base)).rows[0].value.items.length,0,"Failure after item insert rolls the whole save back");
      assert.equal((await client.query(discover,discoverArgs)).rows[0].value.saved_item_id,null);
    } finally { await client.query("reset role");await client.query(`drop trigger ${trigger} on app_private.portal_collection_offers`);await client.query("set role service_role"); }
    const saved=await Promise.all([client.query(save,[...base,offer.id,true]),other.query(save,[...base,offer.id,true])]);
    assert.equal(saved[0].rows[0].value.item.id,saved[1].rows[0].value.item.id);
    assert.equal(saved.filter(row=>row.rows[0].value.replayed).length,1);
  } finally {await other.end();}
  const first=(await client.query(read,base)).rows[0].value.items[0];
  assert.equal(first.title,offer!.title);assert.deepEqual(first.asset_snapshot_json,offer!.asset_snapshot_json);
  assert.equal((await client.query(read,[viewerSession,viewer,tenant,participant])).rows[0].value.items.length,1);
  assert.equal((await client.query(read,[viewerSession,viewer,tenant,participant])).rows[0].value.canWrite,false);
  const next=(await client.query(discover,[...base,theme,release,randomUUID()])).rows[0].value;
  assert.notEqual(next.item_key,offer!.item_key,"Another location/request draws from the same pool, excluding the previous draw");
  await client.query(save,[...base,next.id,true]);
  const duplicate=(await client.query(discover,[...base,theme,release,randomUUID()])).rows[0].value;
  const duplicateSaved=(await client.query(save,[...base,duplicate.id,true])).rows[0].value;
  assert.equal(duplicateSaved.duplicate,true);
  assert.equal((await client.query(read,base)).rows[0].value.items.length,2);
  await assert.rejects(client.query("update app_private.portal_collection_items set title='Changed' where id=$1",[first.id]),/collection_item_immutable/);
  const expiringRequest=randomUUID();
  const expiring=(await client.query(discover,[...base,theme,release,expiringRequest])).rows[0].value;
  await client.query("update app_private.portal_collection_offers set expires_at=now()-interval '1 second' where id=$1",[expiring.id]);
  await assert.rejects(client.query(save,[...base,expiring.id,true]),/collection_offer_expired/);
  await assert.rejects(client.query(discover,[...base,theme,release,expiringRequest]),/collection_offer_expired/);
  await client.query("update public.participant_guardians set access_level='secondary' where tenant_id=$1 and guardian_user_id=$2",[tenant,viewer]);
  await assert.rejects(client.query(save,[viewerSession,viewer,tenant,participant,expiring.id,true]),/collection_offer_unavailable/);
  await client.query("update public.participant_guardians set status='revoked' where tenant_id=$1 and guardian_user_id=$2",[tenant,viewer]);
  await assert.rejects(client.query(read,[viewerSession,viewer,tenant,participant]),/collection_access_denied/);
  // A second tenant exists: changing only the submitted scope must not grant access.
  const foreignTenant=randomUUID();
  await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictional unrelated collection school')",[foreignTenant,`foreign-collection-${foreignTenant}`]);
  await assert.rejects(client.query(read,[parentSession,parent,foreignTenant,participant]),/collection_access_denied/);
  await client.query("reset role");
  await client.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[legacyChildSession]);
  await client.query("set role service_role");
  await assert.rejects(client.query(read,[legacyChildSession,parent,tenant,participant]),/collection_access_denied/);
  const unsaved=(await client.query(discover,[...base,theme,release,randomUUID()])).rows[0].value;
  await client.query("select public.remove_portal_theme_world_binding($1,$2,'Fixture world rollback')",[manager,binding]);
  await assert.rejects(client.query(save,[...base,unsaved.id,true]),/collection_theme_context_changed/);
  assert.equal((await client.query(read,base)).rows[0].value.items.length,2,"World rollback never removes stored discoveries");
  assert.deepEqual(await businessSnapshot(client,tenant),before,"Discovery/save/duplicate/rollback cannot affect curriculum or business records");
  await client.query("reset role"); await client.query("set role authenticated");
  await client.query("select set_config('request.jwt.claim.sub',$1,false)",[parent]);
  await assert.rejects(client.query(read,base),/permission denied/);
  await assert.rejects(client.query(discover,discoverArgs),/permission denied/);
  await assert.rejects(client.query("select * from app_private.portal_collection_items where tenant_id=$1",[tenant]),/permission denied/);
  await client.query("reset role");await client.query("set role service_role");
  await client.query("update app_private.portal_session_contexts set locked_at=now(),lock_reason='Fictional session lock' where session_id=$1",[childSession]);
  await assert.rejects(client.query(read,base),/collection_child_capability_required/);
  console.log("PASS collection service-only access, exact v1 native context, separate child write capability, scoped random/replay, explicit save, fault rollback and concurrent deduplication, immutable art/title, expired/revoked/foreign-tenant/other-actor denial, rollback preservation and zero business mutations");
}

async function businessSnapshot(client:pg.Client,tenant:string) {
  const result:Record<string,unknown>={};
  for(const table of ["enrollments","swim_assessment_observations","swim_progress_projections","participant_badge_awards","domain_outbox_events","tenant_notifications"])
    result[table]=(await client.query(`select coalesce(jsonb_agg(to_jsonb(row) order by row.id),'[]') as data from public.${table} row where row.tenant_id=$1`,[tenant])).rows[0].data;
  return result;
}
