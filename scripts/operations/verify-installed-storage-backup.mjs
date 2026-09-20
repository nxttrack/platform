#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {closeSync,existsSync,lstatSync,mkdirSync,mkdtempSync,openSync,readFileSync,readdirSync,readlinkSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {readRuntimeEnvironment,runtimeTarget} from './runtime-operations-contract.mjs';
import {requiredStorageBucketNames,storageBucketContractVersion} from '../storage/storage-bucket-contract.mjs';
import {storageProjectFingerprint} from '../storage/storage-restore-contract.mjs';

const requireCheck=value=>assert.ok(value,'Installed backup verification failed.');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=Object.freeze(['scripts/operations/runtime-operations-contract.mjs','scripts/operations/run-scheduled-jobs.mjs',
  'scripts/operations/backup-storage-daily.mjs','scripts/storage/object-backup.mjs',
  'scripts/storage/storage-bucket-contract.mjs','scripts/storage/storage-restore-contract.mjs']);
const summaryPattern=/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.summary\.json$/;
const tempPattern=/^\.v4-storage-backup-[A-Za-z0-9]{6}$/;
const partialPattern=/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.tar\.gz\.gpg\.partial$/;
const list=directory=>existsSync(directory)?readdirSync(directory):[];
const fresh=(value,since,now)=>typeof value==='string' && Number.isFinite(Date.parse(value))
  && new Date(Date.parse(value)).toISOString()===value && Date.parse(value)>=since && Date.parse(value)<=now+1000;

export function parseBackupCliResult(stdout,target,since,now=Date.now()) {
  requireCheck(typeof stdout==='string' && stdout.length<=8*1024*1024);
  let result;try{result=JSON.parse(stdout.trim().split(/\r?\n/).at(-1));}catch{requireCheck(false);}
  requireCheck(result && JSON.stringify(Object.keys(result).sort())===JSON.stringify(['at','encrypted','retentionDays','status','target']));
  requireCheck(result.target===target && result.status==='pass' && result.encrypted===true && result.retentionDays===14 && fresh(result.at,since,now));
  return {at:result.at,target,status:'pass',encrypted:true,retentionDays:14};
}

function privateFile(path,maxBytes=1024*1024) {
  const stat=lstatSync(path);
  requireCheck(stat.isFile() && !stat.isSymbolicLink() && (stat.mode&0o077)===0 && stat.size<=maxBytes);
  return {bytes:readFileSync(path),stat};
}

export function inspectFreshBackup(directory,previousNames,target,projectUrl,since,now=Date.now()) {
  const added=list(directory).filter(name=>!previousNames.includes(name));
  const summaries=added.filter(name=>summaryPattern.test(name));
  requireCheck(added.length===2 && summaries.length===1);
  const archiveName=summaries[0].replace(/\.summary\.json$/,'.tar.gz.gpg');
  requireCheck(added.includes(archiveName));
  const summary=JSON.parse(privateFile(join(directory,summaries[0]),65536).bytes);
  requireCheck(summary.version===3 && summary.bucketContractVersion===storageBucketContractVersion
    && summary.environment===target && summary.sourceProjectFingerprint===storageProjectFingerprint(projectUrl)
    && summary.prefix===null && Array.isArray(summary.missingBuckets) && summary.missingBuckets.length===0
    && Array.isArray(summary.buckets) && summary.buckets.length===requiredStorageBucketNames.length
    && requiredStorageBucketNames.every(bucket=>summary.buckets.includes(bucket))
    && Number.isSafeInteger(summary.objectCount) && summary.objectCount>=0
    && Number.isSafeInteger(summary.totalBytes) && summary.totalBytes>=0 && fresh(summary.createdAt,since,now));
  const archive=lstatSync(join(directory,archiveName));
  requireCheck(archive.isFile() && !archive.isSymbolicLink() && (archive.mode&0o077)===0 && archive.size>0 && archive.mtimeMs>=since);
  return {createdAt:summary.createdAt,bucketCount:summary.buckets.length,objectCount:summary.objectCount,
    totalBytes:summary.totalBytes,encryptedArchiveBytes:archive.size,retentionDays:14};
}

export function backupScratch(shared) {
  return [...list(shared).filter(name=>tempPattern.test(name)).map(name=>join(shared,name)),
    ...list(join(shared,'storage-backups-v4')).filter(name=>partialPattern.test(name)).map(name=>join(shared,'storage-backups-v4',name))];
}

/** Raw output is private, never inherited or included in an Error; terminate the whole child group on timeout. */
export async function runPrivateBackupCli(script,target,directory,timeoutMs=480000) {
  requireCheck(Number.isInteger(timeoutMs) && timeoutMs>0 && timeoutMs<=480000);
  const stdout=join(directory,'stdout.private'),stderr=join(directory,'stderr.private');
  const descriptors=[openSync(stdout,'wx',0o600),openSync(stderr,'wx',0o600)];
  try {
    const result=await new Promise(resolveResult=>{
      let timedOut=false,timer;
      const child=spawn(process.execPath,[script,target],{detached:true,stdio:['ignore',...descriptors]});
      const finish=(code)=>{clearTimeout(timer);resolveResult({code,timedOut});};
      child.once('error',()=>finish(null));child.once('close',finish);
      timer=setTimeout(()=>{timedOut=true;try{process.kill(-child.pid,'SIGKILL');}catch{/* Already exited. */}},timeoutMs);
    });
    requireCheck(result.code===0 && !result.timedOut);
    return privateFile(stdout,8*1024*1024).bytes.toString('utf8');
  } finally {for(const descriptor of descriptors)closeSync(descriptor);}
}

function fileState(path) {
  const {bytes,stat}=privateFile(path);
  return {hash:hash(bytes),mode:stat.mode,uid:stat.uid,gid:stat.gid};
}

export function runtimeEnvironmentState(current,shared) {
  const file=join(shared,'.env'),link=join(current,'.env'),stat=lstatSync(file),linkStat=lstatSync(link);
  requireCheck(stat.isFile() && !stat.isSymbolicLink() && [0o600,0o640].includes(stat.mode&0o777) && stat.size<=1024*1024);
  requireCheck(linkStat.isSymbolicLink() && realpathSync(link)===file);
  return {hash:hash(readFileSync(file)),mode:stat.mode,uid:stat.uid,gid:stat.gid,
    releaseLink:readlinkSync(link),releaseLinkUid:linkStat.uid,releaseLinkGid:linkStat.gid};
}

function state(config,releaseSha) {
  const current=realpathSync(join(config.base,'current'));
  requireCheck(dirname(current)===join(config.base,'releases'));
  const identity=JSON.parse(readFileSync(join(current,'artifacts/exact-source-sha.json'),'utf8'));
  requireCheck(identity.schemaVersion===1 && identity.purpose==='nxttrack-exact-source-sha'
    && identity.repository==='nxttrack/platform' && identity.commitSha===releaseSha);
  const installed=realpathSync(join(config.shared,'operations-v4/current'));
  const manifest=JSON.parse(privateFile(join(installed,'manifest.json'),65536).bytes);
  requireCheck(/^[a-f0-9]{64}$/.test(manifest.digest??'')
    && installed===join(config.shared,'operations-v4/versions',manifest.digest)
    && JSON.stringify(manifest.files)===JSON.stringify(files));
  const digest=createHash('sha256');
  for(const file of files) {
    const bytes=privateFile(join(installed,file)).bytes;
    requireCheck(bytes.equals(readFileSync(join(current,file))));
    digest.update(file).update('\0').update(bytes);
  }
  requireCheck(digest.digest('hex')===manifest.digest);
  const pid=execFileSync('systemctl',['show','--property=MainPID','--value',`nxttrack-${config.target}`],
    {encoding:'utf8',timeout:5000,maxBuffer:1024,stdio:['ignore','pipe','ignore']}).trim();
  requireCheck(/^[1-9][0-9]*$/.test(pid));
  const key=privateFile(join(config.shared,'operations-v4/backup-passphrase'));
  requireCheck(key.bytes.length>=32);
  return {current,installed,pid,manifestDigest:manifest.digest,key:fileState(join(config.shared,'operations-v4/backup-passphrase')),
    environment:runtimeEnvironmentState(current,config.shared),
    identity:hash(readFileSync(join(current,'artifacts/exact-source-sha.json')))};
}

async function health(config,releaseSha) {
  const response=await fetch(`${config.url}/api/health`,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  requireCheck(response.status===200 && response.body);const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;requireCheck(size<=65536);chunks.push(chunk);}
  const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  requireCheck(body.app==='nxttrack-platform' && body.ok===true && body.env===config.target && body.commitSha===releaseSha
    && body.checks?.database?.status==='pass' && body.checks?.schemaCompatibility?.status==='pass');
}

async function verify(target) {
  const releaseSha=process.env.RELEASE_SHA,sourceSha=process.env.GITHUB_SHA,output=process.env.INSTALLED_BACKUP_OUTPUT;
  requireCheck(/^[a-f0-9]{40}$/.test(releaseSha??'') && /^[a-f0-9]{40}$/.test(sourceSha??''));
  requireCheck(typeof output==='string' && output.startsWith('/') && output.length<4096 && !/[\r\n\0]/.test(output));
  const config=runtimeTarget(target),backupDirectory=join(config.shared,'storage-backups-v4');
  const report={target,releaseSha,operationSourceSha:sourceSha,startedAt:new Date().toISOString(),status:'failed'};
  let before,privateDirectory,cliStarted=false;
  try {
    before=state(config,releaseSha);await health(config,releaseSha);
    const {environment}=readRuntimeEnvironment(target);requireCheck(environment.RELEASE_COMMIT_SHA===releaseSha);
    requireCheck(backupScratch(config.shared).length===0);
    const previousNames=list(backupDirectory),since=Date.now();
    privateDirectory=mkdtempSync(join(config.shared,'.v4-installed-backup-probe-'));
    cliStarted=true;
    const stdout=await runPrivateBackupCli(join(config.shared,'operations-v4/current/scripts/operations/backup-storage-daily.mjs'),target,privateDirectory);
    report.installedCli=parseBackupCliResult(stdout,target,since);
    report.backup=inspectFreshBackup(backupDirectory,previousNames,target,environment.NEXT_PUBLIC_SUPABASE_URL||environment.SUPABASE_URL,since);
    requireCheck(backupScratch(config.shared).length===0);
    report.plaintextAndPartialCleanup='passed';
    await health(config,releaseSha);
    requireCheck(JSON.stringify(state(config,releaseSha))===JSON.stringify(before));
    report.healthBeforeAndAfter='passed';report.keyEnvironmentIdentityOperationsAndPidUnchanged=true;
    report.installedVersionDigest=before.manifestDigest;report.invokedThroughInstalledCurrentSymlink=true;
    report.status='passed';
  } catch {
    report.failure='installed-backup-cli-or-encrypted-proof-verification-failed';
  } finally {
    try {
      // The same backup flock excludes other writers; preflight required no pre-existing backup scratch.
      if(cliStarted)for(const file of backupScratch(config.shared))rmSync(file,{recursive:true,force:true});
      if(privateDirectory)rmSync(privateDirectory,{recursive:true,force:true});
      report.privateCommandOutputRemoved=true;
      if(cliStarted)requireCheck(backupScratch(config.shared).length===0);
      if(before)report.keyEnvironmentIdentityOperationsAndPidUnchanged=JSON.stringify(state(config,releaseSha))===JSON.stringify(before);
      if(before)requireCheck(report.keyEnvironmentIdentityOperationsAndPidUnchanged);
    } catch {report.status='failed';report.failure='installed-backup-cleanup-or-unchanged-state-verification-failed';}
    report.finishedAt=new Date().toISOString();
    mkdirSync(dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify(report));if(report.status!=='passed')process.exitCode=1;
  }
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const target=process.argv[2],config=runtimeTarget(target);
    if(process.argv[3]==='--locked') {requireCheck(process.argv.length===4);await verify(target);}
    else {
      requireCheck(process.argv.length===3);
      const result=spawnSync('flock',['--exclusive','--timeout','120',join(config.shared,'v4-storage-backup.lock'),
        process.execPath,fileURLToPath(import.meta.url),target,'--locked'],{stdio:'inherit',timeout:660000});
      if(result.status!==0)process.exitCode=1;
    }
  } catch {console.error('[installed-backup] Verification failed; private command output is not logged.');process.exitCode=1;}
}
