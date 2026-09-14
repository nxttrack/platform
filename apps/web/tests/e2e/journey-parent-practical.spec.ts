import {expect,test} from '@playwright/test';
import {readFileSync} from 'node:fs';
test.use({actionTimeout:15_000,navigationTimeout:30_000});

test('real parent planning, explicit cancellation, invitation, profile and private feedback remain functional',async({page,baseURL},info)=>{
 const file=process.env.PORTAL_PRACTICAL_BROWSER_FIXTURE;
 test.skip(!file,'Requires an explicitly seeded fictional family in a loopback database');
 if(!baseURL || !['localhost','127.0.0.1'].includes(new URL(baseURL).hostname))throw new Error('Practical writes require a loopback application');
 const f=JSON.parse(readFileSync(file!,'utf8'));
 await page.goto('/login?next=/portaal');await page.getByLabel('E-mail',{exact:true}).fill(f.email);await page.getByLabel('Wachtwoord',{exact:true}).fill(f.password);await page.getByRole('button',{name:'Inloggen',exact:true}).click();
 await expect(page).toHaveURL(/\/portaal$/);
 await page.getByRole('link',{name:'Planning',exact:true}).first().click();
 await expect(page.locator('#lessen')).toContainText('Fictieve instructiegroep');
 await page.locator(`a[href*="/portaal/lessen/${f.lesson}"]`).click();
 await expect(page).toHaveURL(new RegExp(`/portaal/lessen/${f.lesson}`));
 await expect(page.locator('main')).toContainText('Fictieve instructiegroep');
 await page.goBack();await expect(page).toHaveURL(/\/portaal\/planning/);
 await page.getByRole('button',{name:'Annuleer met credit',exact:true}).click();
 const cancel=page.getByRole('alertdialog');await expect(cancel).toContainText('credit');
 await cancel.getByRole('button',{name:/definitief annuleren/}).click();
 await expect(page.locator('#lessen')).toContainText('Geannuleerd op');
 await expect(page.locator('#inhalen')).toContainText('Credit voor');
 await page.reload();await expect(page.locator('#lessen')).toContainText('Geannuleerd op');
 await page.locator('#afzwemmen').getByRole('button',{name:'Bevestigen',exact:true}).click();
 await expect(page.locator('#afzwemmen')).toContainText('Bevestigd');
 await expect(page.locator('#afzwemmen')).toContainText('Nog niet bekend');
 await page.goto(`/portaal/planning?kind=${f.otherChild}`);await expect(page.locator('#lessen')).not.toContainText('Fictieve instructiegroep');
 await page.goto('/portaal/profiel');await page.getByRole('textbox',{name:'Naam',exact:true}).fill('Fictieve proefouder');
 await page.getByRole('button',{name:'Profiel opslaan',exact:true}).click();await expect(page).toHaveURL(/saved=1/);await page.reload();await expect(page.getByRole('textbox',{name:'Naam',exact:true})).toHaveValue('Fictieve proefouder');
 await page.goto(`/portaal/feedback?kind=${f.child}`);const form=page.locator('form').filter({has:page.getByRole('button',{name:'Feedback veilig versturen'})});
 await form.getByRole('radio',{name:'8',exact:true}).check({force:true});
 await form.getByRole('textbox').fill('Fictieve feedback voor een lokale controle.');
 await form.getByRole('button',{name:'Feedback veilig versturen'}).click();await expect(page).toHaveURL(/saved=response/);await page.reload();await expect(page.getByText('score 8',{exact:true})).toBeVisible();
 for(const path of ['betalingen','documenten','ontwikkeling/media','ontwikkeling/badges','kinderen']){
  const response=await page.goto(`/portaal/${path}`);expect(response?.status(),path).toBe(200);
  // Wait for the streamed loading boundary to leave before checking the final landmark.
  await expect(page.locator('main')).toHaveCount(1);await expect(page.locator('main')).toBeVisible();await expect(page.getByText('Application error',{exact:false})).toHaveCount(0);
 }
 await page.screenshot({path:info.outputPath('parent-practical-family.png')});
});
