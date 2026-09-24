import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

const database=process.env.THEME_LIBRARY_TEST_DATABASE_URL,api=process.env.THEME_LIBRARY_TEST_API_URL,key=process.env.THEME_LIBRARY_TEST_SERVICE_KEY;
const email=process.env.THEME_LIBRARY_TEST_EMAIL,file=process.env.THEME_IMPORT_RECOVERY_BROWSER_FIXTURE;
for(const value of [database,api]) if(!value || !['localhost','127.0.0.1','[::1]'].includes(new URL(value).hostname)) throw new Error('Explicit isolated loopback endpoints required');
if(!key || !email?.endsWith('@example.test') || !file) throw new Error('Explicit fictional manager and private fixture file required');
const client=new pg.Client({connectionString:database});await client.connect();
try {
  const actor=(await client.query("select u.id from auth.users u join public.platform_memberships m on m.user_id=u.id where u.email=$1 and m.role in ('platform_owner','platform_admin') and m.status='active'",[email])).rows[0]?.id;
  if(!actor) throw new Error('Fictional platform manager unavailable');
  const bytes=await readFile(new URL('../../tests/fixtures/portal-v42/NXTTRACK-De-Parelroute-Wereld-1-Referentiepakket-1.0.0.zip',import.meta.url)),hash=createHash('sha256').update(bytes).digest('hex');
  const result={retryId:randomUUID(),cleanupId:randomUUID(),missingId:randomUUID(),release:`97.0.${Math.floor(Date.now()/1000)}`};
  for(const [name,id] of Object.entries(result).filter(([name])=>name.endsWith('Id'))) {
    const objectKey=`${id}/${hash}`;
    if(name!=='missingId') {
      const response=await fetch(`${api}/storage/v1/object/portal-theme-imports/${objectKey}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/octet-stream','x-upsert':'false'},body:bytes});
      if(!response.ok) throw new Error(`Owned local quarantine seed failed (${response.status})`);
    }
    await client.query("insert into public.portal_theme_import(id,created_by_user_id,source_hash,source_name,source_object_key,byte_size,status,analysis_json,requested_runtime_release) values($1,$2,$3,$4,$5,$6,'rejected',$7::jsonb,$8)",[id,actor,hash,`fictional-${name}.zip`,objectKey,bytes.length,JSON.stringify({error:'Fictional interrupted analysis fixture'}),result.release]);
  }
  await writeFile(file,JSON.stringify(result),{mode:0o600,flag:'wx'});
  console.log('Three fictional rejected import states created in owned local quarantine; no runtime release changed.');
} finally {await client.end();}
