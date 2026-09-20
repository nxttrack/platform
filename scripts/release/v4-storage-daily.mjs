import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync,mkdirSync,mkdtempSync,rmSync,writeFileSync,readdirSync,statSync } from 'node:fs';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const target=process.argv[2];
assert.ok(['staging','production'].includes(target));
const base=`/var/www/nxttrack/${target}/shared`;
const operations=dirname(fileURLToPath(import.meta.url));
const environment=parseEnv(readFileSync(`${base}/.env`,'utf8'));
assert.equal(environment.APP_ENV,target);
const temp=mkdtempSync(`${base}/.v4-storage-backup-`);
const destination=`${base}/storage-backups-v4`;
mkdirSync(destination,{recursive:true,mode:0o700});
const timestamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
const encrypted=join(destination,`${timestamp}.tar.gz.gpg`);
const script=join(operations,'scripts/storage/object-backup.mjs');
const options={env:{...process.env,...environment,STORAGE_BACKUP_DIR:join(temp,'objects'),STORAGE_BACKUP_ALLOW_EMPTY_FIRST_INSTALL:'false'},stdio:'inherit'};
try {
  execFileSync(process.execPath,[script,'export'],options);
  execFileSync(process.execPath,[script,'verify-local'],options);
  const summary=execFileSync(process.execPath,[script,'summary'],{...options,stdio:'pipe',encoding:'utf8'});
  execFileSync('tar',['-C',join(temp,'objects'),'-czf',join(temp,'backup.tar.gz'),'.']);
  const encryption=['--batch','--yes','--pinentry-mode','loopback','--passphrase-file',join(operations,'backup-passphrase')];
  execFileSync('gpg',[...encryption,'--symmetric','--cipher-algo','AES256','--output',encrypted,join(temp,'backup.tar.gz')]);
  execFileSync('gpg',[...encryption,'--decrypt','--output',join(temp,'verified.tar.gz'),encrypted]);
  execFileSync('cmp',[join(temp,'backup.tar.gz'),join(temp,'verified.tar.gz')]);
  writeFileSync(join(destination,`${timestamp}.summary.json`),summary,{mode:0o600});
  for(const file of readdirSync(destination)) {
    if(!/^\d{4}-.*\.(?:tar\.gz\.gpg|summary\.json)$/.test(file)) continue;
    const path=join(destination,file);
    if(statSync(path).mtimeMs<Date.now()-14*86400000) rmSync(path);
  }
  console.log(JSON.stringify({at:new Date().toISOString(),target,status:'pass',encrypted:true,retentionDays:14}));
} finally {rmSync(temp,{recursive:true,force:true});}
