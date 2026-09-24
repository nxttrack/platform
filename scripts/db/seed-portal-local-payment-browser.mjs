#!/usr/bin/env node
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
// Shared seed validates loopback DB/Auth addresses and makes a fresh fictional family.
execFileSync(process.execPath,[new URL('./seed-portal-private-files-browser.mjs',import.meta.url).pathname],{stdio:'inherit',env:process.env});
const file=process.env.PORTAL_MESSAGE_BROWSER_FIXTURE,f=JSON.parse(await readFile(file,'utf8'));
const db=new pg.Client({connectionString:process.env.PORTAL_MESSAGE_TEST_DATABASE_URL});await db.connect();
f.provider=randomUUID();f.payments=[];
try{
 await db.query('begin');
 await db.query("insert into public.billing_provider_configs(id,tenant_id,provider,mode,status,display_name,secret_reference) values($1,$2,'mollie','test','active','Fictional loopback only','ENV:MOLLIE_LOCAL_FIXTURE_KEY')",[f.provider,f.tenant]);
 for(const outcome of ['paid','failed','mismatch']){
  const payment=randomUUID(),session=randomUUID(),providerId=`tr_${randomBytes(6).toString('hex')}`;
  await db.query("insert into public.manual_payments(id,tenant_id,subscription_id,participant_id,enrollment_id,guardian_user_id,amount_cents,currency,due_on,status,reference) values($1,$2,$3,$4,$5,$6,10000,'EUR',current_date+14,'due',$7)",[payment,f.tenant,f.subscription,f.child,f.enrollment,f.user,`Fictional ${outcome}`]);
  await db.query("insert into public.payment_sessions(id,tenant_id,provider_config_id,subscription_id,manual_payment_id,participant_id,guardian_user_id,provider,provider_session_id,amount_cents,currency,status,expires_at,checkout_url) values($1,$2,$3,$4,$5,$6,$7,'mollie',$8,10000,'EUR','pending',now()+interval '1 day',$9)",[session,f.tenant,f.provider,f.subscription,payment,f.child,f.user,providerId,`https://www.mollie.com/checkout/${providerId}`]);
  f.payments.push({payment,session,providerId,outcome,snapshot:{id:providerId,mode:'test',status:outcome==='mismatch'?'paid':outcome,amount:{value:outcome==='mismatch'?'99.00':'100.00',currency:'EUR'},paidAt:new Date().toISOString(),metadata:{tenantId:f.tenant,manualPaymentId:payment,paymentSessionId:session},sequenceType:'oneoff'}});
 }
 await db.query('commit');await writeFile(file,JSON.stringify(f),{mode:0o600});console.log('Three fictional pending payment sessions created on loopback; no request to a provider.');
}catch(e){await db.query('rollback');throw e;}finally{await db.end();}
