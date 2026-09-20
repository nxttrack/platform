import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chmodSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {backupScratch,inspectFreshBackup,parseBackupCliResult,runPrivateBackupCli,runtimeEnvironmentState} from '../../scripts/operations/verify-installed-storage-backup.mjs';
import {requiredStorageBucketNames} from '../../scripts/storage/storage-bucket-contract.mjs';
import {storageProjectFingerprint} from '../../scripts/storage/storage-restore-contract.mjs';

const target='staging',url='https://fictional-storage.example.test',secret='NEVER_PUBLISH_PRIVATE_COMMAND_OUTPUT';
const pass=(at=new Date().toISOString())=>({at,target,status:'pass',encrypted:true,retentionDays:14});
function directory(t) {
  const root=mkdtempSync(join(tmpdir(),'installed-backup-contract-'));
  t.after(()=>rmSync(root,{recursive:true,force:true}));return root;
}

test('requires the actual final PASS record and projects only its safe fields',()=>{
  const since=Date.now()-1000,result=pass();
  assert.deepEqual(parseBackupCliResult(`${secret}\n{"objects":["${secret}"]}\n${JSON.stringify(result)}\n`,target,since),result);
  for(const stdout of ['',secret,JSON.stringify({...result,status:'fail'}),JSON.stringify({...result,target:'production'}),
    JSON.stringify({...result,encrypted:false}),JSON.stringify({...result,retentionDays:90}),
    JSON.stringify({...result,at:'2000-01-01T00:00:00.000Z'}),JSON.stringify({...result,objects:[secret]})]) {
    assert.throws(()=>parseBackupCliResult(stdout,target,since),error=>error.message==='Installed backup verification failed.');
  }
});

function freshFixture(t) {
  const root=directory(t),backups=join(root,'storage-backups-v4');mkdirSync(backups,{mode:0o700});
  const since=Date.now()-1000,timestamp=new Date().toISOString(),stem=timestamp.replaceAll(':','-').replaceAll('.','-');
  const archive=join(backups,`${stem}.tar.gz.gpg`),summaryFile=join(backups,`${stem}.summary.json`);
  const manifest={version:3,bucketContractVersion:2,createdAt:timestamp,environment:target,sourceProjectFingerprint:storageProjectFingerprint(url),
    prefix:null,missingBuckets:[],buckets:[...requiredStorageBucketNames],objectCount:1,totalBytes:19};
  writeFileSync(summaryFile,JSON.stringify(manifest),{mode:0o600});writeFileSync(archive,'encrypted-fixture',{mode:0o600});
  return {root,backups,archive,summaryFile,since,manifest};
}

test('accepts a newly encrypted real GPG archive and complete seven-bucket summary without exposing object data',t=>{
  const fixture=freshFixture(t),key=join(fixture.root,'key.private'),plain=join(fixture.root,'plain.private');
  writeFileSync(key,'synthetic-test-passphrase-longer-than-32-characters',{mode:0o600});
  writeFileSync(plain,'fictional test data',{mode:0o600});
  execFileSync('gpg',['--batch','--yes','--pinentry-mode','loopback','--passphrase-file',key,'--symmetric','--cipher-algo','AES256','--output',fixture.archive,plain],{stdio:'pipe'});
  const result=inspectFreshBackup(fixture.backups,[],target,url,fixture.since);
  assert.equal(result.bucketCount,7);assert.equal(result.objectCount,1);assert.ok(result.encryptedArchiveBytes>0);
  assert.deepEqual(Object.keys(result),['createdAt','bucketCount','objectCount','totalBytes','encryptedArchiveBytes','retentionDays']);
  assert.doesNotMatch(JSON.stringify(result),/fictional|example\.test|objects|key\.private/);
});

test('no-op execution cannot reuse an old summary/archive as fresh proof',t=>{
  const fixture=freshFixture(t),old=[fixture.archive.split('/').at(-1),fixture.summaryFile.split('/').at(-1)];
  assert.throws(()=>inspectFreshBackup(fixture.backups,old,target,url,fixture.since),/verification failed/);
});

for(const mutation of ['missing-bucket','wrong-project','wrong-environment','scoped-prefix','old-summary','empty-archive','archive-symlink','public-archive']) {
  test(`rejects ${mutation} backup proof`,t=>{
    const f=freshFixture(t);
    if(mutation==='missing-bucket')f.manifest.buckets.pop();
    if(mutation==='wrong-project')f.manifest.sourceProjectFingerprint='0'.repeat(16);
    if(mutation==='wrong-environment')f.manifest.environment='production';
    if(mutation==='scoped-prefix')f.manifest.prefix='private/object-name';
    if(mutation==='old-summary')f.manifest.createdAt='2000-01-01T00:00:00.000Z';
    writeFileSync(f.summaryFile,JSON.stringify(f.manifest));
    if(mutation==='empty-archive')writeFileSync(f.archive,'');
    if(mutation==='archive-symlink'){rmSync(f.archive);symlinkSync(f.summaryFile,f.archive);}
    if(mutation==='public-archive')chmodSync(f.archive,0o644);
    assert.throws(()=>inspectFreshBackup(f.backups,[],target,url,f.since),/verification failed/);
  });
}

test('executes the actual symlink path, keeps stdout/stderr private, and does not expose failure output',async t=>{
  const root=directory(t),version=join(root,'version');mkdirSync(version);
  const script=join(version,'cli.mjs');writeFileSync(script,`console.error(${JSON.stringify(secret)});console.log(JSON.stringify(${JSON.stringify(pass())}));`);
  const current=join(root,'current');symlinkSync(version,current,'dir');
  const success=join(root,'success');mkdirSync(success,{mode:0o700});
  const stdout=await runPrivateBackupCli(join(current,'cli.mjs'),target,success,1000);
  assert.equal(parseBackupCliResult(stdout,target,Date.now()-5000).status,'pass');
  assert.equal(readFileSync(join(success,'stderr.private'),'utf8').trim(),secret);
  writeFileSync(script,`console.error(${JSON.stringify(secret)});process.exit(7);`);
  const failure=join(root,'failure');mkdirSync(failure,{mode:0o700});
  await assert.rejects(runPrivateBackupCli(join(current,'cli.mjs'),target,failure,1000),error=>!error.message.includes(secret)&&error.message==='Installed backup verification failed.');
});

test('a stalled CLI is bounded and its entire child group stops before cleanup',async t=>{
  const root=directory(t),marker=join(root,'child-survived'),script=join(root,'hang.mjs'),logs=join(root,'logs');mkdirSync(logs);
  writeFileSync(script,`import {spawn} from 'node:child_process';spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),500)`)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
  const start=Date.now();await assert.rejects(runPrivateBackupCli(script,target,logs,150),/verification failed/);
  assert.ok(Date.now()-start<2000);await new Promise(resolve=>setTimeout(resolve,600));assert.equal(existsSync(marker),false);
});

test('scratch identification is limited to the daily backup temporary directories and partial ciphertext',t=>{
  const root=directory(t),backups=join(root,'storage-backups-v4');mkdirSync(backups);
  mkdirSync(join(root,'.v4-storage-backup-aB12xY'));mkdirSync(join(root,'unrelated-private-data'));
  const partial='2026-09-20T10-20-30-000Z.tar.gz.gpg.partial';writeFileSync(join(backups,partial),'partial');
  writeFileSync(join(backups,'2026-09-20T10-20-30-000Z.tar.gz.gpg'),'preserved');
  assert.deepEqual(backupScratch(root).sort(),[join(root,'.v4-storage-backup-aB12xY'),join(backups,partial)].sort());
});

test('preserves canonical mode640 shared env and its release symlink; rejects a different target or public env',t=>{
  const root=directory(t),current=join(root,'release'),shared=join(root,'shared');mkdirSync(current);mkdirSync(shared);
  const env=join(shared,'.env'),link=join(current,'.env');writeFileSync(env,secret,{mode:0o640});chmodSync(env,0o640);symlinkSync(env,link);
  const before=runtimeEnvironmentState(current,shared);assert.equal(before.mode&0o777,0o640);assert.equal(before.releaseLink,env);
  assert.ok(!JSON.stringify(before).includes(secret));assert.deepEqual(runtimeEnvironmentState(current,shared),before);
  chmodSync(env,0o644);assert.throws(()=>runtimeEnvironmentState(current,shared),/verification failed/);chmodSync(env,0o640);
  rmSync(link);const other=join(root,'other.env');writeFileSync(other,secret,{mode:0o600});symlinkSync(other,link);
  assert.throws(()=>runtimeEnvironmentState(current,shared),/verification failed/);
});
