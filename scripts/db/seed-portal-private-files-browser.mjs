#!/usr/bin/env node
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
// The shared seed verifies DB/Auth URLs are loopback before creating fictional people.
execFileSync(process.execPath,[new URL('./seed-portal-assessment-browser.mjs',import.meta.url).pathname],{stdio:'inherit',env:process.env});
const file=process.env.PORTAL_MESSAGE_BROWSER_FIXTURE,f=JSON.parse(await readFile(file,'utf8'));
const api=process.env.PORTAL_MESSAGE_TEST_API_URL,key=process.env.PORTAL_MESSAGE_TEST_SERVICE_KEY;
const pdf=Buffer.from('%PDF-1.4\n% FICTIONAL LOCAL FILE CONTRACT ONLY\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
f.fileHash=hash(pdf);f.mediaHash=hash(png);
Object.assign(f,Object.fromEntries(['document','unscannedDocument','certificate','revokedCertificate','media','blockedMedia','expiredMedia','unapprovedMedia','siblingMedia','invoiceDraft','payment','legacyStage','plan','subscription'].map(k=>[k,randomUUID()])));
async function upload(bucket,path,bytes,mime){
 const r=await fetch(`${api}/storage/v1/object/${bucket}/${path}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':mime,'x-upsert':'false'},body:bytes});
 if(!r.ok)throw new Error(`Owned fictional file upload failed: ${r.status}`);
}
const db=new pg.Client({connectionString:process.env.PORTAL_MESSAGE_TEST_DATABASE_URL});await db.connect();
try{
 await db.query('begin');
 await db.query("insert into public.program_stages(id,tenant_id,program_id,name,code,status) values($1,$2,$3,'Fictief certificaatniveau','fictional-files','active')",[f.legacyStage,f.tenant,f.program]);
 await db.query("insert into public.profiles(id,full_name) values($1,'Fictieve bestandsouder') on conflict(id) do nothing",[f.user]);
 for(const [id,scan] of [[f.document,'clean'],[f.unscannedDocument,'pending']]){
  const path=`${f.tenant}/documents/${id}/fictional.pdf`;await upload('tenant-documents',path,pdf,'application/pdf');
  await db.query("insert into public.tenant_documents(id,tenant_id,title,audience,visibility,file_path,file_name,mime_type,storage_status,malware_scan_status) values($1,$2,'Fictief lokaal document','parents','portal',$3,'fictional.pdf','application/pdf','stored',$4)",[id,f.tenant,path,scan]);
 }
 for(const [id,status] of [[f.certificate,'issued'],[f.revokedCertificate,'revoked']]){
  const path=`${f.tenant}/certificates/${id}/fictional.pdf`;await upload('diploma-vault',path,pdf,'application/pdf');
  await db.query("insert into public.certificate_records(id,tenant_id,participant_id,enrollment_id,program_id,stage_id,title,status,file_path,file_name,mime_type,storage_status,malware_scan_status,is_test) values($1,$2,$3,$4,$5,$6,'Fictieve bestandsfixture — geen diploma-uitgifte',$7,$8,'fictional.pdf','application/pdf','stored','clean',true)",[id,f.tenant,f.child,f.enrollment,f.program,f.legacyStage,status,path]);
 }
 await db.query("insert into public.media_consents(tenant_id,participant_id,guardian_user_id,purpose,status,granted_at) values($1,$2,$3,'private_progress_media','granted',now()),($1,$4,$3,'private_progress_media','withdrawn',null)",[f.tenant,f.child,f.user,f.otherChild]);
 for(const [id,status,child,expired] of [[f.media,'published',f.child,false],[f.blockedMedia,'consent_blocked',f.child,false],[f.expiredMedia,'published',f.child,true],[f.unapprovedMedia,'published',f.child,false],[f.siblingMedia,'published',f.otherChild,false]]){
  const path=`${f.tenant}/participants/${child}/${id}.png`;await upload('participant-media',path,png,'image/png');
  await db.query("insert into public.participant_media(id,tenant_id,participant_id,storage_path,file_name,mime_type,size_bytes,file_sha256,malware_scan_engine,malware_scan_status,malware_scanned_at,status,published_by,published_at,consent_checked_at,created_at,expires_at) values($1,$2,$3,$4,'fictional.png','image/png',$5,$6,'fictional-local-prevalidated','clean',now(),$7,$8,now(),now(),now()-interval '40 days',case when $9 then now()-interval '1 day' else now()+interval '30 days' end)",[id,f.tenant,child,path,png.length,f.mediaHash,status,f.teacher,expired]);
  if(id!==f.unapprovedMedia)await db.query("insert into public.portal_child_media_approvals(tenant_id,participant_id,media_id,approved_by_guardian_user_id) values($1,$2,$3,$4)",[f.tenant,child,id,f.user]);
 }
 await db.query("insert into public.billing_invoices(id,tenant_id,participant_id,guardian_user_id) values($1,$2,$3,$4)",[f.invoiceDraft,f.tenant,f.child,f.user]);
 await db.query("insert into public.tenant_memberships(tenant_id,user_id,role,status) values($1,$2,'tenant_admin','active')",[f.tenant,f.teacher]);
 await db.query("insert into public.tenant_billing_profiles(tenant_id,legal_name,address_line_1,postal_code,city,billing_email) values($1,'Fictieve bestandschool','Fictief 1','1234 AB','Fictief','finance@example.test') on conflict(tenant_id) do update set address_line_1=excluded.address_line_1,postal_code=excluded.postal_code,city=excluded.city,billing_email=excluded.billing_email",[f.tenant]);
 await db.query("insert into public.payment_plans(id,tenant_id,program_id,code,name,amount_cents,billing_interval,status) values($1,$2,$3,'fictional-files','Fictieve factuurcontrole',10000,'monthly','active')",[f.plan,f.tenant,f.program]);
 await db.query("insert into public.subscriptions(id,tenant_id,participant_id,enrollment_id,guardian_user_id,payment_plan_id,status,starts_on,next_due_on,amount_cents,currency,billing_interval) values($1,$2,$3,$4,$5,$6,'active',current_date,current_date,10000,'EUR','monthly')",[f.subscription,f.tenant,f.child,f.enrollment,f.user,f.plan]);
 await db.query("insert into public.manual_payments(id,tenant_id,subscription_id,participant_id,enrollment_id,guardian_user_id,amount_cents,currency,due_on,status,reference) values($1,$2,$3,$4,$5,$6,10000,'EUR',current_date+14,'due','Fictieve lokale factuur')",[f.payment,f.tenant,f.subscription,f.child,f.enrollment,f.user]);
 await db.query('set local role service_role');
 await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.jwt.claim.role','service_role',true)",[JSON.stringify({sub:f.teacher,role:'service_role'})]);
 f.invoice=(await db.query("select public.issue_invoice_for_payment($1,$2,'Fictieve lokale factuur',null,$3,$4) as id",[f.tenant,f.payment,f.teacher,`fictional-files-${randomUUID()}`])).rows[0].id;
 await db.query('commit');await writeFile(file,JSON.stringify(f),{mode:0o600});
 console.log('Fictional private files, consent/expiry boundaries and canonical invoice seeded on loopback only; no payment, provider or real certificate issuance.');
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
