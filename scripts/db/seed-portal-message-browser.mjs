#!/usr/bin/env node
import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";

// Deliberately no default target. This helper only makes fictional local fixtures.
const database = process.env.PORTAL_MESSAGE_TEST_DATABASE_URL;
const api = process.env.PORTAL_MESSAGE_TEST_API_URL;
const serviceKey = process.env.PORTAL_MESSAGE_TEST_SERVICE_KEY;
const output = process.env.PORTAL_MESSAGE_BROWSER_FIXTURE;
if (!database || !api || !serviceKey || !output) throw new Error("Explicit local DB/API/key and private fixture output path required");
for (const address of [database, api]) if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(address).hostname)) throw new Error("Only isolated loopback fixtures are allowed");
const fixture = Object.fromEntries(["tenant", "child", "otherChild", "item", "program", "version", "stage", "identity", "enrollment"].map((name) => [name, randomUUID()]));
fixture.password = randomBytes(30).toString("base64url"); fixture.email = `fictional-composer-${fixture.tenant}@example.test`;
const response = await fetch(`${api.replace(/\/$/, "")}/auth/v1/admin/users`, { method: "POST", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: fixture.email, password: fixture.password, email_confirm: true }) });
if (!response.ok) throw new Error(`Local Auth fixture failed (${response.status})`);
fixture.user = (await response.json()).id;
const client = new pg.Client({ connectionString: database }); await client.connect();
try {
  await client.query("begin");
  await client.query("insert into public.tenants(id,slug,name) values($1,$2,'Fictieve berichtenschool')", [fixture.tenant, `message-browser-${fixture.tenant}`]);
  await client.query("insert into public.tenant_settings(tenant_id) values($1)", [fixture.tenant]);
  await client.query("insert into public.tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'parent','active')", [fixture.tenant, fixture.user]);
  await client.query("insert into public.participants(id,tenant_id,guardian_user_id,display_name) values($1,$2,$3,'Fictieve Lotte'),($4,$2,$3,'Fictieve Sam')", [fixture.child, fixture.tenant, fixture.user, fixture.otherChild]);
  await client.query("insert into public.programs(id,tenant_id,name,status) values($1,$2,'Fictieve zwemopleiding','active')", [fixture.program, fixture.tenant]);
  await client.query("insert into public.curriculum_versions(id,tenant_id,program_id,version_number,name) values($1,$2,$3,1,'Fictief leerplan')", [fixture.version, fixture.tenant, fixture.program]);
  await client.query("insert into public.curriculum_stages(id,tenant_id,curriculum_version_id,stable_key,name) values($1,$2,$3,'fictional','Fictieve start')", [fixture.stage, fixture.tenant, fixture.version]);
  await client.query("insert into public.curriculum_item_identities(id,tenant_id,program_id,stable_key) values($1,$2,$3,'fictional-breathing')", [fixture.identity, fixture.tenant, fixture.program]);
  await client.query("insert into public.curriculum_items(id,tenant_id,curriculum_version_id,curriculum_stage_id,identity_id,name) values($1,$2,$3,$4,$5,'Fictief rustig ademen')", [fixture.item, fixture.tenant, fixture.version, fixture.stage, fixture.identity]);
  await client.query("insert into public.enrollments(id,tenant_id,participant_id,program_id,curriculum_version_id,status) values($1,$2,$3,$4,$5,'active')", [fixture.enrollment, fixture.tenant, fixture.child, fixture.program, fixture.version]);
  await client.query("commit");
  await writeFile(output, JSON.stringify(fixture), { mode: 0o600, flag: "wx" });
  console.log("Fictional local parent, two children and authorized curriculum reference created; private fixture file written; no email/provider delivery.");
} catch (error) { await client.query("rollback"); throw error; }
finally { await client.end(); }
