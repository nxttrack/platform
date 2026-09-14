import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

export async function testImportRecoveryContracts(client:pg.Client,databaseUrl:string,manager:string,outsider:string,referencedImport:string) {
  const id=randomUUID(), hash='b'.repeat(64);
  await client.query("reset role");await client.query("set role service_role");
  const start="select public.begin_portal_theme_import_cleanup($1,$2) as value",finish="select public.finish_portal_theme_import_cleanup($1,$2)";
  await client.query("insert into public.portal_theme_import(id,created_by_user_id,source_hash,source_name,source_object_key,byte_size,status,analysis_json) values($1,$2,$3,'fictional-rejected.zip',$4,32,'received','{\"error\":\"Original failed evidence\"}')",[id,manager,hash,`${id}/${hash}`]);
  await assert.rejects(client.query(start,[outsider,id]),/platform_theme_manager_required/);
  await assert.rejects(client.query(start,[manager,id]),/theme_import_cleanup_not_rejected/);
  await client.query("update public.portal_theme_import set status='analyzed' where id=$1",[id]);
  await assert.rejects(client.query(start,[manager,id]),/theme_import_cleanup_not_rejected/);
  await assert.rejects(client.query(finish,[manager,id]),/theme_import_cleanup_not_started/);
  await client.query("update public.portal_theme_import set status='rejected' where id=$1",[id]);
  const other=new pg.Client({connectionString:databaseUrl});await other.connect();
  try {
    await other.query("set role service_role");
    const results=await Promise.all([client.query(start,[manager,id]),other.query(start,[manager,id])]);
    assert.deepEqual(results[0].rows[0].value,results[1].rows[0].value);
    assert.equal(results[0].rows[0].value.sourceObjectKey,`${id}/${hash}`);
    // Process stops after acquiring cleanup; a new connection can resume it without a repair.
    assert.equal((await other.query(start,[manager,id])).rows[0].value.cleaned,false);
    await Promise.all([client.query(finish,[manager,id]),other.query(finish,[manager,id])]);
  } finally {await other.end();}
  assert.equal((await client.query(start,[manager,id])).rows[0].value.cleaned,true);
  const record=(await client.query("select status,source_hash,analysis_json,cleaned_at from public.portal_theme_import where id=$1",[id])).rows[0];
  assert.equal(record.status,'cleaned');assert.equal(record.source_hash,hash);assert.equal(record.analysis_json.error,'Original failed evidence');assert.ok(record.cleaned_at);
  assert.deepEqual((await client.query("select action,count(*)::int as count from app_private.portal_theme_import_recovery_event where import_id=$1 group by action order by action",[id])).rows,[{action:'cleanup_finished',count:1},{action:'cleanup_started',count:1}]);
  // Even incorrectly labelled rejected evidence stays protected by a real release and revision reference.
  await client.query("update public.portal_theme_import set status='rejected' where id=$1",[referencedImport]);
  await assert.rejects(client.query(start,[manager,referencedImport]),/theme_import_source_referenced/);
  await client.query("update public.portal_theme_import set status='draft' where id=$1",[referencedImport]);
  await client.query("reset role");await client.query("set role authenticated");
  await assert.rejects(client.query(start,[manager,id]),/permission denied/);
  await assert.rejects(client.query(finish,[manager,id]),/permission denied/);
  await client.query("reset role");await client.query("set role service_role");
  console.log('PASS import recovery: authorized terminal state, exact quarantine key, concurrent begin/finish once, restart after interrupted cleanup, original evidence retained, published/revision source references protected, direct authenticated denial');
}
