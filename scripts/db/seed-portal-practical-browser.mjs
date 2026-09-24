#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
// The reused seed validates all DB/Auth URLs as loopback before any write.
execFileSync(process.execPath,[new URL('./seed-portal-assessment-browser.mjs',import.meta.url).pathname],{stdio:'inherit',env:process.env});
const path=process.env.PORTAL_MESSAGE_BROWSER_FIXTURE, f=JSON.parse(await readFile(path,'utf8'));
const db=new pg.Client({connectionString:process.env.PORTAL_MESSAGE_TEST_DATABASE_URL});await db.connect();
Object.assign(f,Object.fromEntries(['resource','lesson','graduation','invite','campaign','feedback'].map(key=>[key,randomUUID()])));
try {
 await db.query('begin');
 await db.query("insert into public.resources(id,tenant_id,kind,name,capacity,safety_capacity,status) values($1,$2,'pool','Fictief instructiebad',8,8,'active')",[f.resource,f.tenant]);
 await db.query("update public.groups set default_resource_id=$1 where id=$2",[f.resource,f.group]);
 await db.query("insert into public.sessions(id,tenant_id,group_id,starts_at,ends_at,status) values($1,$2,$3,now()+interval '3 days',now()+interval '3 days 30 minutes','scheduled')",[f.lesson,f.tenant,f.group]);
 await db.query("insert into public.graduation_events(id,tenant_id,program_id,title,status,starts_at,ends_at) values($1,$2,$3,'Fictief afzwemmoment','published',now()+interval '7 days',now()+interval '7 days 1 hour')",[f.graduation,f.tenant,f.program]);
 await db.query("insert into public.graduation_event_participants(id,tenant_id,event_id,participant_id,enrollment_id,invite_status,status) values($1,$2,$3,$4,$5,'sent','invited')",[f.invite,f.tenant,f.graduation,f.child,f.enrollment]);
 await db.query("insert into public.tenant_feedback_campaigns(id,tenant_id,name,prompt,trigger_type,status) values($1,$2,'Fictieve evaluatie','Hoe ging deze fictieve les?','manual','active')",[f.campaign,f.tenant]);
 await db.query("insert into public.feedback_survey_requests(id,tenant_id,campaign_id,participant_id,guardian_user_id,expires_at) values($1,$2,$3,$4,$5,now()+interval '30 days')",[f.feedback,f.tenant,f.campaign,f.child,f.user]);
 await db.query('commit');await writeFile(path,JSON.stringify(f),{mode:0o600});
 console.log('Fictional local lesson, invitation and private feedback request created; no delivery, provider or certificate issuance.');
} catch(error){await db.query('rollback');throw error;} finally{await db.end();}
