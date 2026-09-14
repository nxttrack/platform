import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import pg from "pg";

const databaseUrl=process.env.INSTRUCTOR_REVIEW_TEST_DATABASE_URL;
if (!databaseUrl || !["localhost","127.0.0.1","[::1]"].includes(new URL(databaseUrl).hostname)) throw new Error("Explicit isolated loopback DB required");
async function authenticate(client:pg.Client,user:string) {await client.query("reset role");await client.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await client.query("set role authenticated");}

test("assessment drafts stay private until reviewed; finalization rejects a newer observation and preserves both editors",async()=>{
  const client=new pg.Client({connectionString:databaseUrl});await client.connect();
  const tenant=randomUUID(),teacher=randomUUID(),otherTeacher=randomUUID(),parent=randomUUID(),child=randomUUID(),program=randomUUID(),version=randomUUID(),stage=randomUUID(),identity=randomUUID(),item=randomUUID(),enrollment=randomUUID(),group=randomUUID();
  const read="select public.read_instructor_assessment_draft($1,$2,$3,$4,null) as view";
  const save="select public.save_instructor_assessment_draft($1,$2,$3,$4,null,$5,'parent_visible',$6,$7,$8) as draft";
  const finalize="select public.finalize_instructor_assessment_draft($1,$2,$3,$4,$5,$6,$7,$8) as result";
  const context=[tenant,child,enrollment,item];
  try {
    for(const user of [teacher,otherTeacher,parent]) await client.query("insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values($1,'authenticated','authenticated',$2,'{}','{}')",[user,`${user}@example.test`]);
    await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictional assessment review')",[tenant,`assessment-${tenant}`]);
    await client.query("insert into public.tenant_settings(tenant_id) values($1)",[tenant]);
    await client.query("insert into public.tenant_memberships(tenant_id,user_id,role) values($1,$2,'instructor'),($1,$3,'instructor'),($1,$4,'parent')",[tenant,teacher,otherTeacher,parent]);
    await client.query("insert into public.programs(id,tenant_id,name,status) values($1,$2,'Fictional program','active')",[program,tenant]);
    await client.query("insert into public.curriculum_versions(id,tenant_id,program_id,version_number,name) values($1,$2,$3,1,'Fictional curriculum')",[version,tenant,program]);
    await client.query("insert into public.curriculum_stages(id,tenant_id,curriculum_version_id,stable_key,name) values($1,$2,$3,'fictional','Fictional stage')",[stage,tenant,version]);
    await client.query("insert into public.curriculum_item_identities(id,tenant_id,program_id,stable_key) values($1,$2,$3,'fictional-breathing')",[identity,tenant,program]);
    await client.query("insert into public.curriculum_items(id,tenant_id,curriculum_version_id,curriculum_stage_id,identity_id,name,mastery_threshold) values($1,$2,$3,$4,$5,'Fictional breathing',3)",[item,tenant,version,stage,identity]);
    await client.query("select set_config('app.swim_publish_authorized',$1,false)",[version]);
    await client.query("update public.curriculum_versions set status='published',published_at=now(),published_by_user_id=$2 where id=$1",[version,teacher]);
    await client.query("insert into public.participants(id,tenant_id,guardian_user_id,display_name) values($1,$2,$3,'Fictional learner')",[child,tenant,parent]);
    await client.query("insert into public.enrollments(id,tenant_id,participant_id,program_id,curriculum_version_id,status) values($1,$2,$3,$4,$5,'active')",[enrollment,tenant,child,program,version]);
    await client.query("insert into public.groups(id,tenant_id,program_id,name,status,capacity,regular_capacity,flex_capacity,trial_capacity,hard_capacity) values($1,$2,$3,'Fictional group','active',8,8,0,0,8)",[group,tenant,program]);
    await client.query("insert into public.group_memberships(tenant_id,group_id,enrollment_id,participant_id,status) values($1,$2,$3,$4,'active')",[tenant,group,enrollment,child]);
    for (const user of [teacher,otherTeacher]) await client.query("insert into public.instructor_qualifications(tenant_id,instructor_user_id,program_id,qualification_key,name,status,valid_from,valid_until,verified_by_user_id,verified_at) values($1,$2,$3,'zwemonderwijzer','Fictional verified qualification','active',current_date-30,current_date+365,$2,now())",[tenant,user,program]);
    await client.query("insert into public.group_instructor_assignments(tenant_id,group_id,instructor_user_id,role,status) values($1,$2,$3,'primary','active'),($1,$2,$4,'support','active')",[tenant,group,teacher,otherTeacher]);
    await authenticate(client,teacher);
    const view=(await client.query(read,context)).rows[0].view;assert.equal(view.current,null);assert.equal(view.item.masteryThreshold,3);
    const draft=(await client.query(save,[...context,2,null,null,0])).rows[0].draft;
    assert.equal(draft.draft_revision,1);assert.equal(draft.saved_by_user_id,teacher);
    await authenticate(client,parent);
    assert.equal((await client.query("select * from public.swim_assessment_drafts where tenant_id=$1",[tenant])).rowCount,0);
    await assert.rejects(client.query(read,context),/assessment_review_access_denied/);
    await client.query("reset role");assert.equal((await client.query("select count(*) from public.swim_assessment_observations where tenant_id=$1",[tenant])).rows[0].count,"0");
    assert.equal((await client.query("select count(*) from public.tenant_notifications where tenant_id=$1",[tenant])).rows[0].count,"0");
    await authenticate(client,otherTeacher);
    const other=(await client.query(save,[...context,4,null,null,0])).rows[0].draft;
    await authenticate(client,teacher);
    await assert.rejects(client.query(finalize,[...context,draft.id,draft.draft_revision,draft.client_operation_id,false]),/assessment_review_confirmation_required/);
    const saved=(await client.query(finalize,[...context,draft.id,draft.draft_revision,draft.client_operation_id,true])).rows[0].result;
    assert.equal(saved.replayed,false);
    const retry=(await client.query(finalize,[...context,draft.id,draft.draft_revision,draft.client_operation_id,true])).rows[0].result;
    assert.equal(retry.observationId,saved.observationId);assert.equal(retry.replayed,true);
    await authenticate(client,otherTeacher);
    await assert.rejects(client.query(finalize,[...context,other.id,other.draft_revision,other.client_operation_id,true]),/assessment_observation_conflict/);
    assert.equal((await client.query(read,context)).rows[0].view.draft.rating,4,"Conflicted draft must remain available");
    const correction=(await client.query(save,[...context,4,saved.observationId,"Explicit fictional correction",other.draft_revision])).rows[0].draft;
    const corrected=(await client.query(finalize,[...context,correction.id,correction.draft_revision,correction.client_operation_id,true])).rows[0].result;
    await client.query("reset role");
    const rows=(await client.query("select id,rating,corrects_observation_id,context_json,note from public.swim_assessment_observations where tenant_id=$1 order by finalized_at",[tenant])).rows;
    assert.equal(rows.length,2);assert.equal(rows[1].id,corrected.observationId);assert.equal(rows[1].corrects_observation_id,rows[0].id);
    assert.ok(rows.every(row=>row.context_json.childVisible===false && row.note===null),"Score finalization cannot implicitly publish a child compliment or private note");
    assert.equal((await client.query("select count(*) from public.tenant_notifications where tenant_id=$1",[tenant])).rows[0].count,"0");
    const publish="select public.publish_swim_child_compliment($1,$2,$3,$4,$5) as id",operation=randomUUID();
    const complimentArgs=[tenant,corrected.observationId,"Fictief compliment: je oefende heel rustig!",operation,true];
    await authenticate(client,parent);await assert.rejects(client.query(publish,complimentArgs),/assessment_review_access_denied/);
    await authenticate(client,otherTeacher);
    await assert.rejects(client.query(publish,[...complimentArgs.slice(0,4),false]),/child_compliment_confirmation_required/);
    await assert.rejects(client.query(publish,[tenant,saved.observationId,"Old assessment must not publish",randomUUID(),true]),/child_compliment_observation_changed/);
    const compliment=(await client.query(publish,complimentArgs)).rows[0].id;
    assert.equal((await client.query(publish,complimentArgs)).rows[0].id,compliment);
    await assert.rejects(client.query(publish,[tenant,corrected.observationId,"Different publication",randomUUID(),true]),/child_compliment_already_published/);
    const reviewed=(await client.query(read,context)).rows[0].view;
    assert.equal(reviewed.compliment.message,complimentArgs[2]);assert.equal(reviewed.current.rating,4);
    await client.query("reset role");
    assert.deepEqual((await client.query("select id,rating,corrects_observation_id,context_json,note from public.swim_assessment_observations where tenant_id=$1 order by finalized_at",[tenant])).rows,rows,"Compliment publication cannot alter any original observation");
    await assert.rejects(client.query("update public.swim_child_compliments set message='Overwrite' where id=$1",[compliment]),/child_compliment_immutable/);
    assert.equal((await client.query("select count(*) from public.tenant_notifications where tenant_id=$1",[tenant])).rows[0].count,"0");
    console.log("PASS separate explicit child compliment, parent denial, stale-observation refusal, immutable text, replay once, no score/note/notification mutation");
    // Two actual connections compete for the same canonical enrollment lock.
    const second = new pg.Client({connectionString:databaseUrl}); await second.connect();
    try {
      await authenticate(client,teacher); await authenticate(second,otherTeacher);
      const firstDraft=(await client.query(save,[...context,3,corrected.observationId,"First competing correction",0])).rows[0].draft;
      const secondDraft=(await second.query(save,[...context,2,corrected.observationId,"Second competing correction",0])).rows[0].draft;
      const racing=await Promise.allSettled([
        client.query(finalize,[...context,firstDraft.id,firstDraft.draft_revision,firstDraft.client_operation_id,true]),
        second.query(finalize,[...context,secondDraft.id,secondDraft.draft_revision,secondDraft.client_operation_id,true])
      ]);
      assert.equal(racing.filter(row=>row.status==="fulfilled").length,1);
      const refused=racing.find(row=>row.status==="rejected") as PromiseRejectedResult;
      assert.match(String(refused.reason),/assessment_observation_conflict/);
      const loser = racing[0].status === "rejected" ? client : second;
      assert.ok((await loser.query(read,context)).rows[0].view.draft,"Losing editor retains their private draft");
      console.log("PASS simultaneous competing finalizations: one commit, one stale-observation refusal, losing draft retained");
    } finally {await second.end();}

    await client.query("reset role");
    await client.query("delete from public.swim_assessment_drafts where tenant_id=$1",[tenant]);
    await authenticate(client,teacher);
    const current=(await client.query(read,context)).rows[0].view.current;
    const failureDraft=(await client.query(save,[...context,4,current.id,"Retry after a storage failure",0])).rows[0].draft;
    await client.query("reset role");
    const beforeFault=(await client.query("select count(*) from public.swim_assessment_observations where tenant_id=$1",[tenant])).rows[0].count;
    const trigger=`assessment_test_${tenant.replaceAll("-","")}`;
    // Test-only failure injected at the real immutable observation insert boundary.
    await client.query(`create function public.${trigger}() returns trigger language plpgsql as $$ begin if new.tenant_id = '${tenant}'::uuid then raise exception 'fictional_assessment_storage_failure'; end if; return new; end; $$`);
    await client.query(`create trigger ${trigger} before insert on public.swim_assessment_observations for each row execute function public.${trigger}()`);
    try {
      await authenticate(client,teacher);
      await assert.rejects(client.query(finalize,[...context,failureDraft.id,failureDraft.draft_revision,failureDraft.client_operation_id,true]),/fictional_assessment_storage_failure/);
      assert.equal((await client.query(read,context)).rows[0].view.draft.id,failureDraft.id);
      await client.query("reset role");
      assert.equal((await client.query("select count(*) from public.swim_assessment_observations where tenant_id=$1",[tenant])).rows[0].count,beforeFault);
    } finally {
      await client.query("reset role");await client.query(`drop trigger ${trigger} on public.swim_assessment_observations`);await client.query(`drop function public.${trigger}()`);
    }
    await authenticate(client,teacher);
    const afterFault=(await client.query(finalize,[...context,failureDraft.id,failureDraft.draft_revision,failureDraft.client_operation_id,true])).rows[0].result;
    assert.equal(afterFault.replayed,false);
    assert.equal((await client.query(finalize,[...context,failureDraft.id,failureDraft.draft_revision,failureDraft.client_operation_id,true])).rows[0].result.replayed,true);
    await client.query("reset role");
    assert.equal(Number((await client.query("select count(*) from public.swim_assessment_observations where tenant_id=$1",[tenant])).rows[0].count),Number(beforeFault)+1);
    console.log("PASS failed canonical insert rolls back finalization, preserves draft and retries exactly once");

    await authenticate(client,teacher);
    const retained=(await client.query(save,[...context,3,afterFault.observationId,"Revoked assignment must not publish",0])).rows[0].draft;
    await client.query("reset role");
    await client.query("update public.group_instructor_assignments set status='inactive' where tenant_id=$1 and instructor_user_id=$2",[tenant,teacher]);
    await authenticate(client,teacher);
    await assert.rejects(client.query(read,context),/assessment_review_access_denied/);
    await assert.rejects(client.query(finalize,[...context,retained.id,retained.draft_revision,retained.client_operation_id,true]),/assessment_review_access_denied/);
    await client.query("reset role");
    assert.equal((await client.query("select id from public.swim_assessment_drafts where id=$1",[retained.id])).rowCount,1);
    await client.query("update public.group_instructor_assignments set status='active' where tenant_id=$1 and instructor_user_id=$2",[tenant,teacher]);
    await client.query("update public.swim_assessment_drafts set review_owned=false where id=$1",[retained.id]);
    await authenticate(client,teacher);
    await assert.rejects(client.query(read,context),/assessment_draft_other_client/);
    await assert.rejects(client.query(save,[...context,3,afterFault.observationId,"Must not take over native draft",retained.draft_revision]),/assessment_draft_other_client/);
    console.log("PASS revoked assignment denied and foreign-client draft cannot be silently adopted");
    console.log("PASS existing private drafts, no early observation/notification, explicit review, canonical immutable finalization, response replay, concurrent-editor conflict, retained draft and reviewed correction");
  } finally {await client.end();}
});
