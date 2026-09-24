import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
// Root test tooling supplies pg; the web app does not depend on its driver/types.
const pg=createRequire(resolve(process.cwd(),'package.json'))('pg') as {Client:new(options:{connectionString?:string})=>{
 connect():Promise<void>;end():Promise<void>;
 query(sql:string,values:string[]):Promise<{rows:Array<Record<string,string|null>>}>;
}};
test('local provider snapshots drive the real webhook and parent payment status; forged amount cannot settle',async({page,baseURL})=>{
 const file=process.env.PORTAL_LOCAL_PAYMENT_BROWSER_FIXTURE,dbUrl=process.env.PORTAL_MESSAGE_TEST_DATABASE_URL;
 test.skip(!file||!dbUrl,'Requires explicit isolated provider fixture and test-only standalone preload; never a real provider');
 for(const url of [baseURL,dbUrl])if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Loopback rehearsal only');
 const f=JSON.parse(readFileSync(file!,'utf8'));
 const db=new pg.Client({connectionString:dbUrl});await db.connect();
 try{
  await page.goto('/login?next=/portaal/betalingen');await page.getByLabel('E-mail',{exact:true}).fill(f.email);await page.getByLabel('Wachtwoord',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Inloggen',exact:true}).click();await expect(page).toHaveURL(url=>url.pathname==='/portaal/betalingen');
  await page.getByText('Technische betaalgegevens',{exact:true}).click();
  await expect(page.getByRole('link',{name:'Veilig betalen via Mollie'})).toHaveCount(3);
  await expect(page.getByRole('button',{name:/markeer.*betaald|betaling.*betaald/i})).toHaveCount(0);
  for(const p of f.payments){
   const r=await page.request.post('/api/webhooks/mollie',{form:{id:p.providerId}});expect(r.status(),p.outcome).toBe(p.outcome==='mismatch'?503:200);
   const row=(await db.query('select status,paid_on from public.manual_payments where tenant_id=$1 and id=$2',[f.tenant,p.payment])).rows[0];expect(row.status).toBe(p.outcome==='paid'?'paid':'due');expect(row.paid_on!==null).toBe(p.outcome==='paid');
  }
  const paid=f.payments.find((p:{outcome:string})=>p.outcome==='paid');
  expect((await page.request.post('/api/webhooks/mollie',{form:{id:paid.providerId}})).status()).toBe(200);
  expect(Number((await db.query("select count(*) n from public.billing_events where tenant_id=$1 and manual_payment_id=$2 and type='payment_paid'",[f.tenant,paid.payment])).rows[0].n)).toBe(1);
  await page.reload();await page.getByText('Technische betaalgegevens',{exact:true}).click();
  await expect(page.getByRole('link',{name:'Veilig betalen via Mollie'})).toHaveCount(1); // only mismatched/unsettled session remains pending
  await expect(page.getByText('Mislukt',{exact:true}).first()).toBeVisible();await expect(page.getByText('Betaald',{exact:true}).first()).toBeVisible();
 }finally{await db.end();}
});
