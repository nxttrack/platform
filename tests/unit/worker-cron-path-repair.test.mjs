import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {cronEntries} from '../../scripts/operations/runtime-operations-contract.mjs';
import {operationsFiles,repairCrontabContents,applyCrontabRepair,restoreOwnedEntries,allowedWorkerEvents} from '../../scripts/operations/repair-worker-cron-paths.mjs';

const target='staging',shared='/var/www/nxttrack/staging/shared',node='/opt/node/bin/node';
const version=`${shared}/operations-v4/versions/${'c'.repeat(64)}`;
const original=['MAILTO=existing@example.test','# operator-managed comment',...cronEntries('production',node),
  ...cronEntries(target,node),'17 * * * * /opt/other-job # unrelated','',''].join('\n');
const requested=repairCrontabContents(original,target,node,shared,version);

test('replaces exactly the two script prefixes and preserves every unrelated byte and schedule',()=>{
  assert.equal(requested,original.replaceAll(`${shared}/operations-v4/current/`,`${version}/`));
  assert.equal(repairCrontabContents(requested,target,node,shared,version),requested);
  assert.ok(requested.includes(cronEntries('production',node).join('\n')));
});

test('unknown, duplicate, redirected or malformed owned commands fail closed',()=>{
  for(const malformed of [original+cronEntries(target,node)[0]+'\n',
    original.replace(cronEntries(target,node)[1],''),
    original.replaceAll('run-scheduled-jobs.mjs','unknown.mjs'),
    original.replaceAll('* * * * * /usr/bin/flock','*/2 * * * * /usr/bin/flock'),
    original.replaceAll('\n','\r\n')]) {
    assert.throws(()=>repairCrontabContents(malformed,target,node,shared,version),/validation failed/);
  }
  assert.throws(()=>repairCrontabContents(original,target,"/node'; echo secret",shared,version),/validation failed/);
});

test('rechecks before writing and safely treats an already pinned crontab as idempotent',()=>{
  let calls=0;
  assert.throws(()=>applyCrontabRepair({target,original,requested,read:()=>original+'# concurrent\n',write:()=>calls++}),/validation failed/);
  assert.equal(calls,0);
  assert.deepEqual(applyCrontabRepair({target,original:requested,requested,read:()=>requested,write:()=>calls++}),{changed:false});
  assert.equal(calls,0);
});

test('post-write drift restores only owned entries and preserves a concurrent unrelated edit',()=>{
  let current=original,writes=0;
  assert.throws(()=>applyCrontabRepair({target,original,requested,read:()=>current,write:value=>{
    writes++;current=writes===1?value+'# added by another operator\n':value;
  }}),/original owned entries were restored/);
  assert.equal(current,original+'# added by another operator\n');
  assert.equal(writes,2);
});

test('failure after publication also restores only owned entries; conflicting owned edits are retained',()=>{
  let current=requested+'# concurrent unrelated entry\n';
  restoreOwnedEntries({target,original,requested,read:()=>current,write:value=>current=value});
  assert.equal(current,original+'# concurrent unrelated entry\n');
  current=requested.replaceAll('run-scheduled-jobs.mjs','operator-replacement.mjs');let writes=0;
  assert.throws(()=>restoreOwnedEntries({target,original,requested,read:()=>current,write:()=>writes++}),/validation failed/);
  assert.equal(writes,0);
});

test('a failed crontab write retains the old configuration without claiming success',()=>{
  let current=original,writes=0;
  assert.throws(()=>applyCrontabRepair({target,original,requested,read:()=>current,write:value=>{
    writes++;if(writes===1)throw Error('write failed');current=value;
  }}),/original owned entries were restored/);
  assert.equal(current,original);
});

test('natural-tick evidence rejects old/wrong-target/raw lines and exposes only allowlisted fields',()=>{
  const now=Date.now(),route='/api/internal/offerings/expire';
  const event={at:new Date(now).toISOString(),target,route,status:'pass',secret:'NEVER_PUBLISH',body:{credential:'NEVER_PUBLISH'}};
  const text=[JSON.stringify(event),'raw stderr NEVER_PUBLISH',JSON.stringify({...event,route:'/unknown'}),
    JSON.stringify({...event,target:'production'}),JSON.stringify({...event,at:new Date(now-10000).toISOString()})].join('\n');
  assert.deepEqual(allowedWorkerEvents(text,target,[route],now-1000,now),[
    {at:event.at,target,route,status:'pass'}]);
  assert.deepEqual(allowedWorkerEvents(text+'\n'+JSON.stringify({...event,status:'fail'}),target,[route],now-1000,now),[
    {at:event.at,target,route,status:'fail'}]);
});

test('actual installed scripts enter their CLI through the real path while the original symlink path silently skips',()=>{
  const root=mkdtempSync(join(tmpdir(),'nxttrack-cron-entry-'));
  try {
    const versionRoot=join(root,'versions','digest');
    for(const file of operationsFiles){const path=join(versionRoot,file);mkdirSync(dirname(path),{recursive:true});
      writeFileSync(path,execFileSync('git',['show',`1a72606d5fd7bf72c382fcc5215c3419dfb689e1:${file}`],{stdio:['ignore','pipe','pipe']}));}
    symlinkSync(versionRoot,join(root,'current'));
    for(const file of ['run-scheduled-jobs.mjs','backup-storage-daily.mjs']) {
      const suffix=join('scripts','operations',file);
      const skipped=spawnSync(process.execPath,[join(root,'current',suffix),'unsupported-test-target'],{encoding:'utf8'});
      assert.equal(skipped.status,0);assert.equal(skipped.stdout,'');assert.equal(skipped.stderr,'');
      const entered=spawnSync(process.execPath,[join(versionRoot,suffix),'unsupported-test-target'],{encoding:'utf8'});
      assert.equal(entered.status,1);assert.match(entered.stderr,/An explicit staging or production target is required/);
    }
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('the repair job is isolated, serialized, bounded and retains only its sanitized JSON',()=>{
  const workflow=readFileSync('.github/workflows/production-migration-recovery.yml','utf8');
  const block=workflow.split('  repair-v4-worker-cron-paths:')[1].split('  backup-current-v4-database:')[0];
  assert.match(block,/if: inputs.confirmation == 'REPAIR_V4_WORKER_CRON_PATHS'/);
  assert.match(block,/max-parallel: 1/);assert.match(block,/timeout-minutes: 7/);
  assert.match(block,/group: nxttrack-\$\{\{ matrix.target \}\}/);
  assert.match(block,/node scripts\/operations\/repair-worker-cron-paths.mjs "\$TARGET"/);
  assert.match(block,/path: \$\{\{ runner.temp \}\}\/worker-cron-path-repair-.*\.json/);
  assert.doesNotMatch(block,/secrets\.|systemctl restart|db:migrate/);
});
