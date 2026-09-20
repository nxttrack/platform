import assert from 'node:assert/strict';
import { mkdirSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import pg from 'pg';
const requireWeb=createRequire(new URL('../../apps/web/package.json',import.meta.url));
const {chromium}=requireWeb('@playwright/test');
const {createClient}=requireWeb('@supabase/supabase-js');
const {createServerClient}=requireWeb('@supabase/ssr');
const target=process.env.TARGET;
assert.ok(['staging','production'].includes(target));
const origin=target==='production'?'https://nxttrack.nl':'https://staging.nxttrack.nl';
const adminOrigin=target==='production'?'https://admin.nxttrack.nl':origin;
const tenantOrigin='https://aquaswim-demo.staging.nxttrack.nl';
const out=new URL('../../artifacts/v4-browser/',import.meta.url);
mkdirSync(out,{recursive:true});
const result={target,releaseSha:process.env.RELEASE_SHA,checks:[],startedAt:new Date().toISOString()};
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const supabaseUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin=createClient(supabaseUrl,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let browser;
let failed;
try {
  await db.connect();
  const health=await (await fetch(`${origin}/api/health`)).json();
  assert.equal(health.ok,true); assert.equal(health.env,target); assert.equal(health.commitSha,result.releaseSha);
  assert.equal(health.checks.database.status,'pass'); assert.equal(health.checks.schemaCompatibility.status,'pass');
  result.checks.push({check:'exact-source database-aware health',status:'pass'});
  const {rows:[owner]}=await db.query("select u.email from public.platform_memberships m join auth.users u on u.id=m.user_id where m.status='active' and m.role='platform_owner' order by m.created_at limit 1");
  assert.ok(owner);
  browser=await chromium.launch();
  const publicContext=await browser.newContext();
  const publicPage=await publicContext.newPage();
  for (const path of ['/','/login','/wachtwoord-vergeten']) await checkPage(publicPage,origin,path,'public');
  await publicContext.close();
  await withSession(owner.email,adminOrigin,'platform',async page=>{
    for (const path of ['/platform','/platform/onboarding','/platform/themes','/platform/themes/import','/platform/themes/bindings','/platform/instellingen','/platform/packages','/platform/audit','/platform/support']) await checkPage(page,adminOrigin,path,'platform');
    await page.goto(`${adminOrigin}/platform/themes`,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{level:1,name:'Themabibliotheek'}).waitFor({state:'visible'});
    await page.getByRole('link',{name:'Werelden aan een curriculum koppelen'}).waitFor({state:'visible'});
    await page.screenshot({path:new URL('platform-themes.png',out).pathname,fullPage:true});
  });
  if (target==='staging') {
    const roleChecks=[
      ['admin','E2E_TENANT_ADMIN_EMAIL',['/admin','/admin/leerlingen','/admin/agenda','/admin/wachtlijst']],
      ['instructor','E2E_INSTRUCTOR_EMAIL',['/instructor','/instructor/groepen']],
      ['parent','E2E_PARENT_EMAIL',['/portaal','/portaal/ontwikkeling','/portaal/planning','/portaal/inbox','/portaal/kinderen']]
    ];
    for (const [role,emailName,paths] of roleChecks) {
      let email=process.env[emailName];
      if (!email) {
        const roles=role==='admin'?['tenant_owner','tenant_admin']:role==='parent'?['parent']:['instructor'];
        const {rows}=await db.query("select u.email from public.tenant_memberships m join public.tenants t on t.id=m.tenant_id join auth.users u on u.id=m.user_id where t.slug='aquaswim-demo' and m.status='active' and m.role=any($1::text[]) order by m.created_at limit 1",[roles]);
        email=rows[0]?.email;
      }
      assert.ok(email,`Existing ${role} identity is required`);
      await withSession(email,tenantOrigin,role,async page=>{
        for (const path of paths) await checkPage(page,tenantOrigin,path,role);
        if (role==='parent') {
          await page.getByRole('button',{name:/Open kindmodus voor/}).first().click();
          await page.waitForURL(/\/kind(?:\?|$|\/)/,{timeout:30000});
          await checkPage(page,tenantOrigin,'/kind','child');
          await checkPage(page,tenantOrigin,'/kind/reis','child');
          await page.waitForFunction(()=>{
            const images=[...document.querySelectorAll('[data-rich-layer]')];
            return images.length>0 && images.every(image=>image.complete && image.naturalWidth>0);
          },undefined,{timeout:30000});
          await page.locator('[data-rich-journey][data-camera-moving="false"]').waitFor({state:'visible'});
          result.checks.push({check:'child journey artwork fully loaded',status:'pass'});
          await page.screenshot({path:new URL('child-journey.png',out).pathname,fullPage:true});
          await page.goto(`${tenantOrigin}/admin`,{waitUntil:'domcontentloaded'});
          assert.ok(new URL(page.url()).pathname.startsWith('/kind'),'Child session must remain outside administration');
          result.checks.push({check:'child-to-admin isolation',status:'pass'});
        }
      });
    }
  }
} catch(error) {
  failed=error;
  result.error=error instanceof Error?error.message:'Unknown verification failure';
} finally {
  await browser?.close(); await db.end();
  result.finishedAt=new Date().toISOString(); result.status=failed?'failed':'passed';
  writeFileSync(new URL('verification.json',out),JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify(result));
if(failed) process.exitCode=1;

async function withSession(email,base,label,task) {
  const {data:link,error:linkError}=await admin.auth.admin.generateLink({type:'magiclink',email});
  assert.ok(!linkError && link?.properties?.hashed_token,`Could not create ${label} verification session`);
  const cookies=new Map();
  const client=createServerClient(supabaseUrl,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[...cookies.values()],setAll:entries=>entries.forEach(c=>cookies.set(c.name,c))}});
  const {error}=await client.auth.verifyOtp({type:'magiclink',token_hash:link.properties.hashed_token});
  assert.ok(!error,`Could not authenticate ${label} verification session`);
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  try {
    await context.addCookies([...cookies.values()].map(c=>({name:c.name,value:c.value,domain:new URL(base).hostname,path:'/',secure:true,httpOnly:!!c.options?.httpOnly,sameSite:'Lax'})));
    const page=await context.newPage();
    page.setDefaultTimeout(30000);
    await task(page);
  } finally {await context.close(); await client.auth.signOut({scope:'local'});}
}
async function checkPage(page,base,path,role) {
  const response=await page.goto(`${base}${path}`,{waitUntil:'domcontentloaded',timeout:45000});
  assert.ok(response && response.status()===200,`${role} ${path} returned HTTP ${response?.status()}`);
  assert.equal(new URL(page.url()).pathname,path,`${role} ${path} redirected unexpectedly`);
  await page.locator('h1').first().waitFor({state:'visible',timeout:30000});
  const body=await page.locator('body').innerText();
  assert.ok(!/Application error|Internal Server Error|Er is iets misgegaan/.test(body),`${role} ${path} rendered an error`);
  result.checks.push({check:`${role} ${path}`,status:'pass'});
  console.log(`[v4-browser] PASS ${role} ${path}`);
}
