#!/usr/bin/env node
import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import pg from "pg";

// Reuse the existing strictly loopback-only fictional family fixture. No provider jobs run.
const fixturePath = process.env.PORTAL_MESSAGE_BROWSER_FIXTURE;
execFileSync(process.execPath, [new URL("./seed-portal-message-browser.mjs", import.meta.url).pathname], { stdio: "inherit", env: process.env });
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
const api = process.env.PORTAL_MESSAGE_TEST_API_URL, key = process.env.PORTAL_MESSAGE_TEST_SERVICE_KEY;
fixture.teacherEmail = `fictional-teacher-${fixture.tenant}@example.test`;
fixture.teacherPassword = randomBytes(30).toString("base64url");
const response = await fetch(`${api.replace(/\/$/, "")}/auth/v1/admin/users`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: fixture.teacherEmail, password: fixture.teacherPassword, email_confirm: true }) });
if (!response.ok) throw new Error(`Local teacher fixture failed (${response.status})`);
fixture.teacher = (await response.json()).id; fixture.group = randomUUID();
const client = new pg.Client({ connectionString: process.env.PORTAL_MESSAGE_TEST_DATABASE_URL }); await client.connect();
try {
  await client.query("begin");
  await client.query("insert into public.tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'instructor','active')", [fixture.tenant,fixture.teacher]);
  await client.query("update public.tenant_settings set instructors_can_reply_to_parents=true where tenant_id=$1", [fixture.tenant]);
  await client.query("insert into public.tenant_swim_rollouts(tenant_id,feature_key,status) values($1,'swim.portal.parent_child_split','enabled'),($1,'swim.portal.child_mode','enabled')", [fixture.tenant]);
  await client.query("update public.tenant_swim_rollouts set config_json=jsonb_build_object('absoluteTtlMinutes',60) where tenant_id=$1 and feature_key='swim.portal.child_mode'", [fixture.tenant]);
  await client.query("update public.curriculum_items set mastery_threshold=3 where id=$1", [fixture.item]);
  await client.query("select set_config('app.swim_publish_authorized',$1,true)", [fixture.version]);
  await client.query("update public.curriculum_versions set status='published',published_at=now(),published_by_user_id=$2 where id=$1", [fixture.version,fixture.teacher]);
  const assignment = await client.query("select id from public.enrollment_stage_assignments where tenant_id=$1 and enrollment_id=$2 and curriculum_stage_id=$3 and status='active'", [fixture.tenant,fixture.enrollment,fixture.stage]);
  if (assignment.rowCount !== 1) throw new Error("Canonical enrollment trigger must bind the actual first stage");
  await client.query("insert into public.groups(id,tenant_id,program_id,name,status,capacity,regular_capacity,flex_capacity,trial_capacity,hard_capacity) values($1,$2,$3,'Fictieve instructiegroep','active',8,8,0,0,8)", [fixture.group,fixture.tenant,fixture.program]);
  await client.query("insert into public.group_memberships(tenant_id,group_id,enrollment_id,participant_id,status) values($1,$2,$3,$4,'active')", [fixture.tenant,fixture.group,fixture.enrollment,fixture.child]);
  await client.query("insert into public.instructor_qualifications(tenant_id,instructor_user_id,program_id,qualification_key,name,status,valid_from,valid_until,verified_by_user_id,verified_at) values($1,$2,$3,'zwemonderwijzer','Fictieve geldige kwalificatie','active',current_date-30,current_date+365,$2,now())", [fixture.tenant,fixture.teacher,fixture.program]);
  await client.query("insert into public.group_instructor_assignments(tenant_id,group_id,instructor_user_id,role,status) values($1,$2,$3,'primary','active')", [fixture.tenant,fixture.group,fixture.teacher]);
  await client.query("commit");
  await writeFile(fixturePath, JSON.stringify(fixture), { mode: 0o600 });
  console.log("Fictional qualified instructor, published curriculum/stage, parent and child-mode test context created locally; no external delivery.");
} catch (error) { await client.query("rollback"); throw error; }
finally { await client.end(); }
