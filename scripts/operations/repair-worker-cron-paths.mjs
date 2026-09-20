#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {closeSync,lstatSync,mkdirSync,openSync,readFileSync,readSync,realpathSync,statSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cronEntries,runtimeTarget,scheduledJobs,readRuntimeEnvironment} from './runtime-operations-contract.mjs';

const expectedSha='1a72606d5fd7bf72c382fcc5215c3419dfb689e1';
const expectedDigest='c98d9d7611e04ba1f9b1de84fc4ad67bf284266bedc3971a1a2ef3129ee6462d';
export const operationsFiles=Object.freeze([
  'scripts/operations/runtime-operations-contract.mjs','scripts/operations/run-scheduled-jobs.mjs','scripts/operations/backup-storage-daily.mjs',
  'scripts/storage/object-backup.mjs','scripts/storage/storage-bucket-contract.mjs','scripts/storage/storage-restore-contract.mjs'
]);
function operationsDigest(root) {
  const hash=createHash('sha256');
  for(const file of operationsFiles)hash.update(file).update('\0').update(readFileSync(join(root,file)));
  return hash.digest('hex');
}
function readCrontab() {
  const result=spawnSync('crontab',['-l'],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  requireCheck(result.status===0);return result.stdout;
}
const requireCheck=(value)=>assert.ok(value,'Temporary worker path repair validation failed.');
const tags=(target)=>[`# nxttrack-v4-${target}`,`# nxttrack-v4-storage-${target}`];
const ownLine=(line,target)=>tags(target).some(tag=>line.trimEnd().endsWith(tag));
const ownEntries=(text,target)=>text.split('\n').filter(line=>ownLine(line,target));

export function repairCrontabContents(text,target,nodePath,shared,version) {
  runtimeTarget(target);
  requireCheck(typeof text==='string' && text.length<=1024*1024 && !text.includes('\r'));
  requireCheck(/^\/[A-Za-z0-9/_.-]+$/.test(nodePath));
  const original=cronEntries(target,nodePath,shared);
  const repaired=original.map(line=>line.replace(`${shared}/operations-v4/current/`,`${version}/`));
  requireCheck(ownEntries(text,target).length===2);
  for(let index=0;index<2;index++) {
    const matching=text.split('\n').filter(line=>line.trimEnd().endsWith(tags(target)[index]));
    requireCheck(matching.length===1 && [original[index],repaired[index]].includes(matching[0]));
  }
  return text.split('\n').map(line=>{
    const index=tags(target).findIndex(tag=>line.trimEnd().endsWith(tag));
    return index<0?line:repaired[index];
  }).join('\n');
}

// Read/modify/write runs under the same runner-wide lock as the canonical installer.
// A writer outside that lock must not have its unrelated entries overwritten.
export function applyCrontabRepair({target,original,requested,read,write}) {
  requireCheck(read()===original);
  if(requested===original)return {changed:false};
  let attempted=false;
  try {
    attempted=true;write(requested);requireCheck(read()===requested);
  } catch {
    if(attempted)restoreOwnedEntries({target,original,requested,read,write});
    throw new Error('Temporary worker path repair did not verify; original owned entries were restored.');
  }
  return {changed:true};
}

export function restoreOwnedEntries({target,original,requested,read,write}) {
  const latest=read(),currentOwn=ownEntries(latest,target);
  requireCheck(JSON.stringify(currentOwn)===JSON.stringify(ownEntries(requested,target))
    || JSON.stringify(currentOwn)===JSON.stringify(ownEntries(original,target)));
  const previous=ownEntries(original,target);let index=0;
  const restored=latest.split('\n').map(line=>ownLine(line,target)?previous[index++]:line).join('\n');
  requireCheck(index===2);requireCheck(read()===latest);write(restored);requireCheck(read()===restored);
}

function writeCrontab(value) {
  const result=spawnSync('crontab',['-'],{input:value,encoding:'utf8',timeout:5000,maxBuffer:1024*1024});
  requireCheck(result.status===0);
}
function privateFileState(path) {
  const stat=lstatSync(path);requireCheck(stat.isFile() && !stat.isSymbolicLink());
  return {hash:createHash('sha256').update(readFileSync(path)).digest('hex'),mode:stat.mode,uid:stat.uid,gid:stat.gid};
}
function unchangedState(config) {
  const current=realpathSync(join(config.base,'current'));
  requireCheck(dirname(current)===join(config.base,'releases'));
  return {current,environment:privateFileState(join(config.shared,'.env')),
    key:privateFileState(join(config.shared,'operations-v4/backup-passphrase')),
    identity:privateFileState(join(current,'artifacts/exact-source-sha.json')),
    evidence:privateFileState(join(current,'artifacts/release-evidence.json')),
    operationsCurrent:realpathSync(join(config.shared,'operations-v4/current')),
    pid:execFileSync('systemctl',['show','--property=MainPID','--value',`nxttrack-${config.target}`],
      {encoding:'utf8',timeout:5000,maxBuffer:1024,stdio:['ignore','pipe','ignore']}).trim()};
}
async function health(config) {
  const response=await fetch(`${config.url}/api/health`,{redirect:'error',signal:AbortSignal.timeout(15000)});
  requireCheck(response.status===200 && response.body);const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;requireCheck(size<=65536);chunks.push(chunk);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  requireCheck(body.ok===true && body.app==='nxttrack-platform' && body.env===config.target
    && body.commitSha===expectedSha && body.checks?.database?.status==='pass' && body.checks?.schemaCompatibility?.status==='pass');
}
function tail(path) {
  const size=statSync(path).size, length=Math.min(size,64*1024), buffer=Buffer.alloc(length), file=openSync(path,'r');
  try {readSync(file,buffer,0,length,size-length);} finally {closeSync(file);}
  return buffer.toString('utf8');
}
export function allowedWorkerEvents(text,target,routes,since,now=Date.now()) {
  const events=new Map();
  for(const line of text.split(/\r?\n/)) {
    let event;try{event=JSON.parse(line);}catch{continue;}
    const at=Date.parse(event?.at);
    if(event?.target===target && routes.includes(event.route) && ['pass','fail'].includes(event.status)
      && Number.isFinite(at) && at>=since && at<=now+1000) {
      events.set(event.route,{at:event.at,target,route:event.route,status:event.status});
    }
  }
  return [...events.values()];
}

async function repair(target) {
  requireCheck(process.env.RELEASE_SHA===expectedSha);
  const config=runtimeTarget(target),output=process.env.REPAIR_OUTPUT;
  requireCheck(typeof output==='string' && output.length>0 && output.length<4096 && !/[\r\n\0]/.test(output));
  const report={target,releaseSha:expectedSha,operationSourceSha:process.env.GITHUB_SHA,
    expectedOperationsDigest:expectedDigest,startedAt:new Date().toISOString(),status:'failed',appRestarted:false,manualJobsRun:false};
  let before,original,requested,changed=false;
  try {
    before=unchangedState(config);
    const identity=JSON.parse(readFileSync(join(before.current,'artifacts/exact-source-sha.json'),'utf8'));
    requireCheck(identity.repository==='nxttrack/platform' && identity.commitSha===expectedSha);
    requireCheck(/^[1-9][0-9]*$/.test(before.pid));await health(config);
    const version=join(config.shared,'operations-v4/versions',expectedDigest);
    requireCheck(realpathSync(version)===version && before.operationsCurrent===version);
    const manifest=JSON.parse(readFileSync(join(version,'manifest.json'),'utf8'));
    requireCheck(manifest.digest===expectedDigest && JSON.stringify(manifest.files)===JSON.stringify(operationsFiles));
    requireCheck(operationsDigest(version)===expectedDigest && operationsDigest(before.current)===expectedDigest);
    const {environment}=readRuntimeEnvironment(target),routes=scheduledJobs(environment).map(job=>job.route);
    requireCheck(routes.length===3);
    original=readCrontab();const entries=ownEntries(original,target);
    requireCheck(entries.length===2);
    const prefix=`* * * * * /usr/bin/flock -n '${config.shared}/v4-recurring-jobs.lock' '`;
    const worker=entries.find(line=>line.endsWith(tags(target)[0]));
    requireCheck(worker?.startsWith(prefix));const nodePath=worker.slice(prefix.length).split("'")[0];
    requireCheck(/^\/[A-Za-z0-9/_.-]+$/.test(nodePath) && statSync(nodePath).isFile());
    requireCheck(execFileSync(nodePath,['--version'],{encoding:'utf8',timeout:5000,stdio:['ignore','pipe','ignore']}).trim()==='v24.18.0');
    for(const file of ['run-scheduled-jobs.mjs','backup-storage-daily.mjs']) {
      const path=join(version,'scripts/operations',file);requireCheck(realpathSync(path)===path && statSync(path).isFile());
    }
    requested=repairCrontabContents(original,target,nodePath,config.shared,version);
    const result=applyCrontabRepair({target,original,requested,read:readCrontab,write:writeCrontab});
    changed=result.changed;
    report.cronPathsRepaired=true;report.cronChanged=result.changed;report.nodeVersion='v24.18.0';
    report.versionDirectory=version;report.unrelatedCronEntriesUnchanged=true;
    const since=Date.now();report.naturalTickRequiredAfter=new Date(since).toISOString();
    const deadline=since+150000;
    while(Date.now()<deadline) {
      const events=allowedWorkerEvents(tail(join(config.shared,'v4-recurring-jobs.log')),target,routes,since);
      report.workerEvents=events;
      if(events.length===routes.length && events.every(event=>event.status==='pass'))break;
      await new Promise(resolve=>setTimeout(resolve,2000));
    }
    requireCheck(report.workerEvents?.length===3 && report.workerEvents.every(event=>event.status==='pass'));
    requireCheck(readCrontab()===requested);await health(config);
    requireCheck(JSON.stringify(unchangedState(config))===JSON.stringify(before));
    report.runtimeConfigurationKeysIdentityAndPidUnchanged=true;report.healthBeforeAndAfter='passed';
    report.status='passed';
  } catch {
    report.failure='temporary-cron-path-repair-or-natural-worker-verification-failed';
    if(changed) {
      try{restoreOwnedEntries({target,original,requested,read:readCrontab,write:writeCrontab});report.originalCronPathsRestored=true;}
      catch{report.originalCronPathsRestored=false;report.failure='temporary-cron-path-repair-failed-and-cron-restoration-did-not-verify';}
    }
    if(before) {
      try{report.runtimeConfigurationKeysIdentityAndPidUnchanged=JSON.stringify(unchangedState(config))===JSON.stringify(before);}catch{report.runtimeConfigurationKeysIdentityAndPidUnchanged=false;}
    }
  } finally {
    report.finishedAt=new Date().toISOString();
    mkdirSync(dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const target=process.argv[2];runtimeTarget(target);
  if(process.argv[3]==='--locked') {
    requireCheck(process.argv.length===4);await repair(target);
  } else {
    requireCheck(process.argv.length===3);
    const directory=join(homedir(),'.nxttrack-runner');mkdirSync(directory,{recursive:true,mode:0o700});
    const result=spawnSync('flock',['--exclusive','--timeout','55',join(directory,'runtime-operations-install.lock'),
      process.execPath,fileURLToPath(import.meta.url),target,'--locked'],{stdio:'inherit'});
    if(result.status!==0)process.exitCode=1;
  }
}
