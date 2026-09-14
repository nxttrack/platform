import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

const databaseUrl = process.env.PORTAL_MESSAGE_TEST_DATABASE_URL;
if (!databaseUrl || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)) throw new Error("Explicit isolated loopback database required for message composer tests");

async function authenticate(client: pg.Client, user: string) {
  await client.query("reset role");
  await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await client.query("set role authenticated");
}

test("private composer drafts persist per actor/context, reject cross-context access and serialize concurrent edits", async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  const tenant = randomUUID(), otherTenant = randomUUID(), parent = randomUUID(), otherParent = randomUUID(), admin = randomUUID(), instructor = randomUUID();
  const child = randomUUID(), otherChild = randomUUID(), thread = randomUUID(), unassigned = randomUUID();
  const save = "select public.save_message_composer_draft($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as draft";
  const args = (revision: number, text = "Fictional unsent question") => [tenant, thread, child, null, null, "Fictional subject", text, "public_to_thread", "general", revision];
  try {
    for (const user of [parent, otherParent, admin, instructor]) await client.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'{}','{}')", [user, `${user}@example.test`]);
    await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictional composer tenant'),($3,$4,'Other fictional composer tenant')", [tenant, `composer-${tenant}`, otherTenant, `composer-${otherTenant}`]);
    await client.query("insert into public.tenant_settings(tenant_id) values($1),($2)", [tenant, otherTenant]);
    await client.query("insert into public.tenant_memberships(tenant_id,user_id,role) values($1,$2,'parent'),($1,$3,'parent'),($1,$4,'tenant_admin')", [tenant, parent, otherParent, admin]);
    await client.query("insert into public.participants(id,tenant_id,guardian_user_id,display_name) values($1,$2,$3,'Fictional child'),($4,$2,$5,'Other fictional child')", [child, tenant, parent, otherChild, otherParent]);
    await client.query("insert into public.message_threads(id,tenant_id,subject,guardian_user_id,participant_id,created_by_user_id) values($1,$2,'Fictional conversation',$3,$4,$5),($6,$2,'Unassigned conversation',null,null,$5)", [thread, tenant, parent, child, admin, unassigned]);
    await client.query("insert into public.tenant_memberships(tenant_id,user_id,role) values($1,$2,'instructor')", [tenant, instructor]);
    const before = (await client.query("select (select count(*) from public.messages where tenant_id=$1) messages,(select count(*) from public.domain_outbox_events where tenant_id=$1) outbox", [tenant])).rows[0];
    await authenticate(client, parent);
    const first = (await client.query(save, args(0))).rows[0].draft;
    assert.equal(first.revision, 1); assert.equal(first.author_user_id, parent);
    assert.ok(Date.parse(first.expires_at) > Date.now() + 29 * 86400_000);
    await assert.rejects(client.query(save, args(0)), /message_draft_revision_conflict/);
    const unchanged = (await client.query(save, args(1))).rows[0].draft;
    assert.equal(unchanged.revision, 1); assert.equal(unchanged.operation_id, first.operation_id);
    const edited = (await client.query(save, args(1, "Fictional updated draft"))).rows[0].draft;
    assert.equal(edited.revision, 2); assert.notEqual(edited.operation_id, first.operation_id);
    const loaded = (await client.query("select public.read_message_composer_draft($1,$2,$3,null,null,'public_to_thread') as view", [tenant, thread, child])).rows[0].view;
    assert.equal(loaded.draft.id, first.id); assert.equal(loaded.draft.plain_text, "Fictional updated draft");
    assert.equal(loaded.participantLabel, "Fictional child"); assert.equal(loaded.recipient.kind, "school");
    await client.query("reset role");
    assert.deepEqual((await client.query("select (select count(*) from public.messages where tenant_id=$1) messages,(select count(*) from public.domain_outbox_events where tenant_id=$1) outbox", [tenant])).rows[0], before);
    for (const user of [otherParent, admin]) {
      await authenticate(client, user);
      assert.equal((await client.query("select * from public.message_composer_drafts where id=$1", [first.id])).rowCount, 0, "Even a tenant admin must not read another author's unsent text");
    }
    await authenticate(client, otherParent);
    await assert.rejects(client.query(save, args(0)), /message_thread_access_denied/);
    const noGuardian = args(0); noGuardian[1] = unassigned; noGuardian[2] = null;
    await assert.rejects(client.query(save, noGuardian), /message_thread_access_denied/);
    await assert.rejects(client.query("select public.reply_native_message_thread($1,$2,'Must not send','personal','[]',true,$3)", [tenant, unassigned, randomUUID()]), /message_thread_access_denied/, "Direct native command must also reject nullable guardian/assignee bypass");
    const crossTenant = args(0); crossTenant[0] = otherTenant;
    await assert.rejects(client.query(save, crossTenant), /message_composer_access_denied/);
    const unrelated = args(0); unrelated[1] = null;
    await assert.rejects(client.query(save, unrelated), /message_participant_read_only/);
    await authenticate(client, parent);
    const mismatchedChild = args(2); mismatchedChild[2] = otherChild;
    await assert.rejects(client.query(save, mismatchedChild), /message_thread_context_unavailable/);
    const internal = args(2); internal[7] = "internal_note";
    await assert.rejects(client.query(save, internal), /message_parent_visibility_invalid/);
    const forgedReference = args(2); forgedReference[3] = randomUUID();
    await assert.rejects(client.query(save, forgedReference), /message_curriculum_reference_denied/);

    const second = new pg.Client({ connectionString: databaseUrl }); await second.connect();
    try {
      await authenticate(second, parent);
      assert.equal((await second.query("select plain_text from public.message_composer_drafts where id=$1", [first.id])).rows[0].plain_text, "Fictional updated draft", "New connection must read durable text");
      const results = await Promise.allSettled([client.query(save, args(2, "First concurrent editor")), second.query(save, args(2, "Second concurrent editor"))]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected" && /message_draft_revision_conflict/.test(String(result.reason))).length, 1);
      assert.equal((await second.query("select revision from public.message_composer_drafts where id=$1", [first.id])).rows[0].revision, 3);
    } finally { await second.end(); }
    await assert.rejects(client.query("select public.discard_message_composer_draft($1,$2,2)", [tenant, first.id]), /message_draft_revision_conflict/);
    await client.query("reset role"); await client.query("update public.message_composer_drafts set expires_at=now()-interval '1 second' where id=$1", [first.id]);
    await authenticate(client, parent);
    assert.equal((await client.query("select * from public.message_composer_drafts where id=$1", [first.id])).rowCount, 0);
    const fresh = (await client.query(save, args(0))).rows[0].draft;
    assert.notEqual(fresh.id, first.id); assert.equal(fresh.revision, 1);
    await client.query("select public.discard_message_composer_draft($1,$2,1)", [tenant, fresh.id]);
    assert.equal((await client.query("select * from public.message_composer_drafts where id=$1", [fresh.id])).rowCount, 0);
    const send = "select public.send_message_composer_draft($1,$2,$3,$4,$5,'personal','[]'::jsonb) as result";
    const newThreadArgs = args(0, "Controlled local send failure"); newThreadArgs[1] = null;
    const newDraft = (await client.query(save, newThreadArgs)).rows[0].draft;
    const sendArgs = [tenant, newDraft.id, newDraft.revision, newDraft.operation_id, true];
    await assert.rejects(client.query(send, [...sendArgs.slice(0, 4), false]), /message_send_confirmation_required/);
    await assert.rejects(client.query(send, [tenant, newDraft.id, 99, newDraft.operation_id, true]), /message_draft_revision_conflict/);
    await client.query("reset role");
    const threadCount = (await client.query("select count(*) from public.message_threads where tenant_id=$1", [tenant])).rows[0].count;
    const triggerName = `composer_fail_${tenant.replaceAll("-", "")}`;
    await client.query("create function pg_temp.reject_composer_test() returns trigger language plpgsql as $$ begin raise exception 'controlled_message_storage_failure'; end $$");
    await client.query(`create trigger ${triggerName} before insert on public.messages for each row when (new.tenant_id = '${tenant}'::uuid and new.plain_text = 'Controlled local send failure') execute function pg_temp.reject_composer_test()`);
    try {
      await authenticate(client, parent);
      await assert.rejects(client.query(send, sendArgs), /controlled_message_storage_failure/);
      assert.equal((await client.query("select plain_text from public.message_composer_drafts where id=$1", [newDraft.id])).rows[0].plain_text, "Controlled local send failure");
      await client.query("reset role");
      assert.equal((await client.query("select count(*) from public.message_threads where tenant_id=$1", [tenant])).rows[0].count, threadCount, "Failed first send must roll back the newly created thread");
      assert.deepEqual((await client.query("select (select count(*) from public.messages where tenant_id=$1) messages,(select count(*) from public.domain_outbox_events where tenant_id=$1) outbox", [tenant])).rows[0], before);
    } finally { await client.query("reset role"); await client.query(`drop trigger ${triggerName} on public.messages`); }
    await authenticate(client, parent);
    const sent = (await client.query(send, sendArgs)).rows[0].result;
    assert.equal(sent.status, "sent"); assert.equal(sent.createdThread, true); assert.equal(sent.replayed, false);
    assert.equal((await client.query("select * from public.message_composer_drafts where id=$1", [newDraft.id])).rowCount, 0);
    const replay = (await client.query(send, sendArgs)).rows[0].result;
    assert.equal(replay.messageId, sent.messageId); assert.equal(replay.replayed, true);
    await authenticate(client, otherParent);
    await assert.rejects(client.query(send, sendArgs), /message_composer_access_denied/);
    await client.query("reset role");
    assert.equal((await client.query("select count(*) from public.messages where tenant_id=$1", [tenant])).rows[0].count, "1");
    assert.equal((await client.query("select count(*) from public.domain_outbox_events where tenant_id=$1 and event_type='communication.thread_replied'", [tenant])).rows[0].count, "1");
    await authenticate(client, parent);
    const replyDraftArgs = args(0, "Fictional follow-up"); replyDraftArgs[1] = sent.threadId;
    const replyDraft = (await client.query(save, replyDraftArgs)).rows[0].draft;
    const replied = (await client.query(send, [tenant, replyDraft.id, replyDraft.revision, replyDraft.operation_id, true])).rows[0].result;
    assert.equal(replied.threadId, sent.threadId); assert.equal(replied.createdThread, false);
    assert.notEqual(replied.messageId, sent.messageId);
    await client.query("reset role");
    await client.query("update public.message_threads set assigned_instructor_user_id=$2 where id=$1", [thread, instructor]);
    await authenticate(client, instructor);
    await assert.rejects(client.query(save,args(0)), /message_instructor_replies_disabled/);
    const noteArgs=args(0,"Fictional internal note");noteArgs[7]="internal_note";
    const note=(await client.query(save,noteArgs)).rows[0].draft;
    assert.equal((await client.query("select public.read_message_composer_draft($1,$2,$3,null,null,'internal_note') as view",[tenant,thread,child])).rows[0].view.draft.id,note.id);
    const noted=(await client.query(send,[tenant,note.id,note.revision,note.operation_id,true])).rows[0].result;
    await client.query("reset role");
    assert.equal((await client.query("select count(*) from public.domain_outbox_events where aggregate_id=$1",[noted.messageId])).rows[0].count,"0");
    assert.equal((await client.query("select count(*) from public.tenant_notifications where tenant_id=$1",[tenant])).rows[0].count,"0");
    await client.query("update public.tenant_settings set instructors_can_reply_to_parents=true where tenant_id=$1",[tenant]);
    await authenticate(client,instructor);
    const recipient=(await client.query("select public.read_message_composer_draft($1,$2,$3,null,null,'public_to_thread') as view",[tenant,thread,child])).rows[0].view.recipient;
    assert.equal(recipient.id,parent,"A bound guardian remains the recipient when an optional profile row is missing");
    assert.equal(recipient.kind,"guardian");assert.ok(recipient.label);
    const publicDraft=(await client.query(save,args(0,"Fictional reply by instructor"))).rows[0].draft;
    const guardedSend="select public.send_message_composer_draft($1,$2,$3,$4,true,'personal','[]',$5) as result";
    await assert.rejects(client.query(guardedSend,[tenant,publicDraft.id,publicDraft.revision,publicDraft.operation_id,otherParent]),/message_recipient_changed/);
    const same=[tenant,publicDraft.id,publicDraft.revision,publicDraft.operation_id,parent];
    const concurrent=new pg.Client({connectionString:databaseUrl});await concurrent.connect();
    try {
      await authenticate(concurrent,instructor);
      const outcomes=await Promise.all([client.query(guardedSend,same),concurrent.query(guardedSend,same)]);
      assert.equal(outcomes[0].rows[0].result.messageId,outcomes[1].rows[0].result.messageId);
      assert.equal(outcomes.filter(outcome=>outcome.rows[0].result.replayed).length,1);
    } finally {await concurrent.end();}
    await client.query("reset role");
    const notifications=(await client.query("select recipient_user_id,delivery_status from public.tenant_notifications where tenant_id=$1",[tenant])).rows;
    assert.deepEqual(notifications,[{recipient_user_id:parent,delivery_status:"skipped"}],"One in-app notification on concurrent replay; no email dispatch");
    await client.query("insert into public.participant_guardians(tenant_id,participant_id,guardian_user_id,relationship,access_level,status) values($1,$2,$3,'other','view_only','active')",[tenant,otherChild,parent]);
    const readOnly=args(0);readOnly[1]=null;readOnly[2]=otherChild;
    await authenticate(client,parent);await assert.rejects(client.query(save,readOnly),/message_participant_read_only/);
    await authenticate(client,parent);
    const threadBeforeArchive=(await client.query("select status from public.message_threads where id=$1",[thread])).rows[0].status;
    await client.query("select public.set_message_thread_personal_archive($1,$2,true)",[tenant,thread]);
    await client.query("reset role");
    assert.ok((await client.query("select archived_at from public.message_thread_participants where thread_id=$1 and user_id=$2",[thread,parent])).rows[0].archived_at);
    assert.equal((await client.query("select status from public.message_threads where id=$1",[thread])).rows[0].status,threadBeforeArchive);
    await authenticate(client,otherParent);await assert.rejects(client.query("select public.set_message_thread_personal_archive($1,$2,true)",[tenant,thread]),/message_composer_access_denied/);
    await authenticate(client,parent);await client.query("select public.set_message_thread_personal_archive($1,$2,false)",[tenant,thread]);
    await client.query("reset role");
    assert.equal((await client.query("select archived_at from public.message_thread_participants where thread_id=$1 and user_id=$2",[thread,parent])).rows[0].archived_at,null);
    const childSession=randomUUID();
    await client.query(`insert into app_private.portal_session_contexts(session_id,auth_user_id,tenant_id,participant_id,capabilities,expires_at)
      values($1,$2,$3,$4,array['today.read','journey.read_child_safe','badges.read_child_safe','schedule.read_child_safe','achievements.read_child_safe','approved_media.read_child_safe','child_preferences.write_safe','parent_request.create_safe'],now()+interval '1 hour')`,[childSession,parent,tenant,child]);
    await client.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:parent,session_id:childSession})]);
    await authenticate(client,parent);
    await assert.rejects(client.query(save,args(0)),/message_composer_access_denied/);
    await assert.rejects(client.query("select public.set_message_thread_personal_archive($1,$2,true)",[tenant,thread]),/message_composer_access_denied/);
    await assert.rejects(client.query("select public.reply_native_message_thread($1,$2,'Must not send','personal','[]',true,$3)",[tenant,thread,randomUUID()]),/message_composer_access_denied/);
    assert.equal((await client.query("select * from public.message_composer_drafts where tenant_id=$1",[tenant])).rowCount,0);
    await client.query("reset role");await client.query("select set_config('request.jwt.claims','{}',false)");
    console.log("PASS assigned instructor internal/public separation, current recipient confirmation, concurrent send exactly once, in-app notification atomicity, delegated view-only and restricted child session, direct native null-safe boundary");
    console.log("PASS atomic new thread and reply via canonical command, explicit confirmation, ordinary failure rollback with draft retained, retry exactly once and no real delivery");
    console.log("PASS durable private composer, no autosave delivery, actor/tenant/child/thread isolation, null guardian denial, public/internal enforcement, optimistic edits, reconnect, expiry and revision-bound discard");
  } finally { await client.end(); }
});

test("references bind the exact child curriculum and local-date lesson membership and survive a sent message", async () => {
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  const tenant=randomUUID(), parent=randomUUID(), child=randomUUID(), otherChild=randomUUID(), program=randomUUID(), version=randomUUID(), stage=randomUUID(), item=randomUUID(), identity=randomUUID(), enrollment=randomUUID(), group=randomUUID(), resource=randomUUID(), session=randomUUID();
  try {
    await client.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'{}','{}')",[parent,`${parent}@example.test`]);
    await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictional reference tenant')",[tenant,`reference-${tenant}`]);
    await client.query("insert into public.tenant_settings(tenant_id,timezone) values($1,'Europe/Amsterdam')",[tenant]);
    await client.query("insert into public.tenant_memberships(tenant_id,user_id,role) values($1,$2,'parent')",[tenant,parent]);
    await client.query("insert into public.participants(id,tenant_id,guardian_user_id,display_name) values($1,$2,$3,'Fictional learner'),($4,$2,$3,'Fictional sibling')",[child,tenant,parent,otherChild]);
    await client.query("insert into public.programs(id,tenant_id,name,status) values($1,$2,'Fictional reference curriculum','active')",[program,tenant]);
    await client.query("insert into public.curriculum_versions(id,tenant_id,program_id,version_number,name) values($1,$2,$3,1,'Fictional version')",[version,tenant,program]);
    await client.query("insert into public.curriculum_stages(id,tenant_id,curriculum_version_id,stable_key,name) values($1,$2,$3,'fictional','Fictional stage')",[stage,tenant,version]);
    await client.query("insert into public.curriculum_item_identities(id,tenant_id,program_id,stable_key) values($1,$2,$3,'fictional-breathing')",[identity,tenant,program]);
    await client.query("insert into public.curriculum_items(id,tenant_id,curriculum_version_id,curriculum_stage_id,identity_id,name) values($1,$2,$3,$4,$5,'Fictional breathing')",[item,tenant,version,stage,identity]);
    await client.query("insert into public.enrollments(id,tenant_id,participant_id,program_id,curriculum_version_id,status) values($1,$2,$3,$4,$5,'active')",[enrollment,tenant,child,program,version]);
    await client.query("insert into public.resources(id,tenant_id,kind,name,capacity,safety_capacity,status) values($1,$2,'pool','Fictional pool',8,8,'active')",[resource,tenant]);
    await client.query("insert into public.groups(id,tenant_id,program_id,default_resource_id,name,status,capacity,regular_capacity,flex_capacity,trial_capacity,hard_capacity) values($1,$2,$3,$4,'Fictional group','active',8,8,0,0,8)",[group,tenant,program,resource]);
    // UTC previous day, local Jan 2: authorization uses the tenant's calendar date.
    await client.query("insert into public.sessions(id,tenant_id,group_id,resource_id,starts_at,ends_at,status) values($1,$2,$3,$4,'2050-01-01T23:30:00Z','2050-01-02T00:30:00Z','scheduled')",[session,tenant,group,resource]);
    await client.query("insert into public.group_memberships(tenant_id,group_id,enrollment_id,participant_id,status,starts_on,ends_on) values($1,$2,$3,$4,'active','2050-01-02','2050-01-02')",[tenant,group,enrollment,child]);
    await authenticate(client,parent);
    const save="select public.save_message_composer_draft($1,null,$2,$3,$4,'Fictional question','Fictional context text','public_to_thread','planning',$5) as draft";
    const draft=(await client.query(save,[tenant,child,item,null,0])).rows[0].draft;
    await assert.rejects(client.query(save,[tenant,otherChild,item,null,0]),/message_curriculum_reference_denied/);
    await assert.rejects(client.query(save,[tenant,otherChild,null,session,0]),/message_lesson_reference_denied/);
    const resumed=(await client.query("select public.read_message_composer_draft($1,null,$2,null,$3,'public_to_thread') as view",[tenant,child,session])).rows[0].view;
    assert.equal(resumed.reference.kind,"curriculum_item");assert.equal(resumed.reference.id,item,"A lesson URL cannot relabel an existing item draft");
    await client.query("select public.discard_message_composer_draft($1,$2,$3)",[tenant,draft.id,draft.revision]);
    const lesson=(await client.query(save,[tenant,child,null,session,0])).rows[0].draft;
    const loaded=(await client.query("select public.read_message_composer_draft($1,null,$2,null,$3,'public_to_thread') as view",[tenant,child,session])).rows[0].view;
    assert.equal(loaded.reference.timeZone,"Europe/Amsterdam");assert.equal(loaded.reference.participantId,child);
    const result=(await client.query("select public.send_message_composer_draft($1,$2,$3,$4,true,'personal','[]') as result",[tenant,lesson.id,lesson.revision,lesson.operation_id])).rows[0].result;
    await client.query("reset role");
    assert.deepEqual((await client.query("select reference_json from public.messages where id=$1",[result.messageId])).rows[0].reference_json,loaded.reference);
    await client.query("update public.group_memberships set starts_on='2050-01-03',ends_on=null where enrollment_id=$1",[enrollment]);
    await authenticate(client,parent);await assert.rejects(client.query(save,[tenant,child,null,session,0]),/message_lesson_reference_denied/);
    console.log("PASS valid curriculum and lesson reference snapshots, sibling denial, draft reference restoration and tenant-timezone membership boundary");
  } finally {await client.end();}
});
