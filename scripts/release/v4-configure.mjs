import assert from 'node:assert/strict';
import { createCipheriv,createDecipheriv,createHash,randomBytes } from 'node:crypto';
import { copyFileSync,readFileSync,writeFileSync,renameSync,chmodSync } from 'node:fs';
import { execFileSync,spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import pg from 'pg';

const target = process.env.TARGET;
assert.ok(['staging','production'].includes(target));
const base = `/var/www/nxttrack/${target}/shared`;
const envPath = `${base}/.env`;
const original = readFileSync(envPath,'utf8');
const env = parseEnv(original);
assert.equal(env.RELEASE_COMMIT_SHA,process.env.RELEASE_SHA);
assert.equal(env.APP_ENV,target);
const health = await (await fetch(`${env.APP_URL}/api/health`)).json();
assert.equal(health.ok,true); assert.equal(health.commitSha,process.env.RELEASE_SHA);
const db = new pg.Client({connectionString:env.DATABASE_URL});
await db.connect();
try {
  const {rows:[settings]} = await db.query('select * from public.platform_email_settings where id=true');
  assert.ok(settings?.enabled && settings.from_email,'Existing sender configuration required');
  const key = createHash('sha256').update(env.EMAIL_SETTINGS_SECRET || env.SESSION_SECRET || env.JWT_SECRET).digest();
  const decrypt = encrypted => {
    const [prefix,iv,tag,ciphertext] = encrypted.split(':'); assert.equal(prefix,'v1');
    const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(iv,'base64url'));
    decipher.setAuthTag(Buffer.from(tag,'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64url')),decipher.final()]).toString();
  };
  if (settings.provider === 'sendgrid_api') {
    let apiKey;
    let repair = false;
    try { apiKey = decrypt(settings.sendgrid_api_key_encrypted); }
    catch { apiKey = env.SENDGRID_API_KEY; repair = true; }
    assert.ok(apiKey?.startsWith('SG.'),'Usable configured SendGrid secret required');
    const response = await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({personalizations:[{to:[{email:settings.from_email}]}],from:{email:settings.from_email},subject:'NXTTRACK V4 configuration validation',content:[{type:'text/plain',value:'Sandbox validation only.'}],mail_settings:{sandbox_mode:{enable:true}}})});
    assert.ok(response.status===200 || response.status===202,`SendGrid sandbox validation returned ${response.status}`);
    if (repair) {
      const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
      const bytes=Buffer.concat([cipher.update(apiKey),cipher.final()]);
      const encrypted=['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join(':');
      await db.query('update public.platform_email_settings set sendgrid_api_key_encrypted=$1,updated_at=now() where id=true',[encrypted]);
      console.log('[v4-configure] Rebound existing SendGrid credential to the deployed encryption key.');
    }
  } else {
    assert.equal(settings.provider,'smtp');
    assert.ok(settings.smtp_host && settings.smtp_user && decrypt(settings.smtp_password_encrypted));
  }
  const tenants = await db.query("select t.id, (select user_id from public.tenant_memberships m where m.tenant_id=t.id and m.status='active' and m.role in ('tenant_owner','tenant_admin') order by created_at limit 1) actor from public.tenants t where status='active' and slug <> 'sprint4-isolation'");
  for (const tenant of tenants.rows) {
    assert.ok(tenant.actor,'Tenant must have an existing authorized manager');
    await db.query("select public.configure_child_portal_rollout_for_service($1,$2,'enabled',240,true,true)",[tenant.id,tenant.actor]);
  }
  const pending = await db.query("select count(*)::int n from public.email_outbox where status in ('queued','retry','processing')");
  assert.equal(pending.rows[0].n,0,'Review queued messages before enabling the worker');
  console.log(`[v4-configure] PASS sender configuration, empty mail queue, ${tenants.rowCount} enabled tenants.`);
} finally { await db.end(); }
copyFileSync(envPath,`${base}/.env.before-v4-enablement-${process.env.GITHUB_RUN_ID}`);
const changes = {EMAIL_SENDING_ENABLED:'true',INTERNAL_JOBS_ENABLED:'true',MAINTENANCE_NO_WRITE:'false',NEWSLETTER_DELIVERY_ENABLED:'false'};
const lines = original.split(/\r?\n/).filter(line=>!Object.keys(changes).some(key=>line.startsWith(`${key}=`)));
const temporary=`${envPath}.v4-tmp`;
writeFileSync(temporary,`${lines.filter(Boolean).join('\n')}\n${Object.entries(changes).map(([key,value])=>`${key}=${value}`).join('\n')}\n`,{mode:0o640});
execFileSync('chgrp',['nxttrack-deploy',temporary]); renameSync(temporary,envPath);
const worker = `${base}/v4-recurring-jobs.mjs`;
copyFileSync(new URL('./v4-recurring-jobs.mjs',import.meta.url),worker); chmodSync(worker,0o600);
const old = spawnSync('crontab',['-l'],{encoding:'utf8'});
if (old.status !== 0 && !old.stderr.includes('no crontab')) throw new Error('Could not read existing crontab');
const tag=`# nxttrack-v4-${target}`;
const existing=(old.stdout || '').split('\n').filter(line=>line && !line.endsWith(tag));
const entry=`* * * * * /usr/bin/flock -n ${base}/v4-recurring-jobs.lock ${process.execPath} ${worker} ${target} >> ${base}/v4-recurring-jobs.log 2>&1 ${tag}`;
const installed=spawnSync('crontab',['-'],{input:[...existing,entry,''].join('\n'),encoding:'utf8'});
assert.equal(installed.status,0,'Could not install V4 recurring jobs');
assert.ok(execFileSync('crontab',['-l'],{encoding:'utf8'}).includes(entry));
console.log('[v4-configure] PASS runtime switches and one-minute recurring jobs installed.');
