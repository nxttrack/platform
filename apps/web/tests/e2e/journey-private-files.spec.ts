import {expect,test,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
async function login(page:Page,email:string,password:string){
 await page.goto('/login?next=/portaal/kinderen');await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Wachtwoord',{exact:true}).fill(password);await page.getByRole('button',{name:'Inloggen',exact:true}).click();await expect(page).toHaveURL(url=>url.pathname==='/portaal/kinderen');
}
test('private file bytes, finalized invoices, media consent and separate child approval survive the real standalone routes',async({page,browser,baseURL})=>{
 const path=process.env.PORTAL_PRIVATE_FILES_BROWSER_FIXTURE;
 test.skip(!path,'Requires fictional file fixtures on an explicitly owned loopback database/storage');
 if(!baseURL || !['localhost','127.0.0.1'].includes(new URL(baseURL).hostname))throw new Error('Private file verification requires loopback');
 const f=JSON.parse(readFileSync(path!,'utf8'));await login(page,f.email,f.password);
 for(const [kind,id] of [['tenant-document',f.document],['certificate',f.certificate]]){
  const r=await page.request.get(`/api/files/${kind}/${id}`);expect(r.status()).toBe(200);expect(r.headers()['cache-control']).toContain('private');expect(r.headers()['content-disposition']).toContain('attachment');expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(f.fileHash);
 }
 expect((await page.request.get(`/api/files/tenant-document/${f.unscannedDocument}`)).status()).toBe(423);
 expect((await page.request.get(`/api/files/certificate/${f.revokedCertificate}`)).status()).toBe(403);
 expect((await page.request.get(`/api/files/invoice/${f.invoiceDraft}`)).status()).toBe(409);
 const invoice=await page.request.get(`/api/files/invoice/${f.invoice}`);expect(invoice.status()).toBe(200);expect(invoice.headers()['content-type']).toBe('application/pdf');expect((await invoice.body()).subarray(0,5).toString()).toBe('%PDF-');
 for(const [id,status] of [[f.media,200],[f.blockedMedia,404],[f.expiredMedia,404],[f.siblingMedia,404]] as const){
  const r=await page.request.get(`/api/files/participant-media/${id}`);expect(r.status()).toBe(status);
  if(status===200)expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(f.mediaHash);
 }
 expect((await page.request.get(`/api/files/participant-media/${f.media}?download=1`)).status()).toBe(404);
 const anonymous=await browser.newContext();try{const p=await anonymous.newPage();expect([401,403]).toContain((await p.request.get(`${baseURL}/api/files/tenant-document/${f.document}`)).status());}finally{await anonymous.close();}
 await page.locator('article').filter({hasText:'Fictieve Lotte'}).getByRole('button',{name:/^Open kindmodus/}).click();await expect(page).toHaveURL(/\/kind$/);
 for(const [id,status] of [[f.media,200],[f.unapprovedMedia,404],[f.expiredMedia,404],[f.siblingMedia,404]] as const){
  const r=await page.request.get(`/api/child/media/${id}`);expect(r.status()).toBe(status);
  if(status===200){expect(r.headers()['content-disposition']).toContain('inline');expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(f.mediaHash);}
 }
 expect([401,403]).toContain((await page.request.get(`/api/files/invoice/${f.invoice}`)).status());
});
