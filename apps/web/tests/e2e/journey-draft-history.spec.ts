import {expect,test} from '@playwright/test';

test('browser Back retains a failed draft without replacing router history; retry and Forward remain navigable',async({page})=>{
  await page.goto('/test-harness/journey-rich?count=0&draft=start');
  await page.getByRole('link',{name:'Open conceptfixture'}).click();
  const input=page.getByRole('textbox',{name:'Fictief concept'});
  await input.fill('Fictieve onverzonden invoer');
  const entries=await page.evaluate(()=>history.length);
  await page.goBack();
  await expect(page.getByRole('status').filter({hasText:'Opslag mislukt'})).toBeVisible();
  await expect(page).toHaveURL(/draft=editor/);await expect(input).toHaveValue('Fictieve onverzonden invoer');
  expect(await page.evaluate(()=>history.length)).toBe(entries);
  // Repeating Back while failure persists still leaves exactly the same editor mounted.
  await page.goBack();await expect(input).toHaveValue('Fictieve onverzonden invoer');await expect(page).toHaveURL(/draft=editor/);
  await page.getByRole('checkbox',{name:'Simuleer opslagfout'}).uncheck();
  await page.goBack();await expect(page).toHaveURL(/draft=start/);await expect(input).toHaveCount(0);
  await page.goForward();await expect(page).toHaveURL(/draft=editor/);await expect(input).toBeVisible();
  expect(await page.evaluate(()=>history.length)).toBe(entries);
});

test('command palette cannot discard a failed private draft during imperative navigation',async({page})=>{
  await page.goto('/test-harness/journey-rich?count=0&draft=editor');
  const input=page.getByRole('textbox',{name:'Fictief concept'});await input.fill('Fictieve invoer bij snelzoeken');
  await page.getByRole('button',{name:'Globaal zoeken'}).click();
  await page.getByRole('option',{name:/Conceptfixture start/}).click();
  await expect(page.getByRole('status').filter({hasText:'Opslag mislukt'})).toBeVisible();
  await expect(input).toHaveValue('Fictieve invoer bij snelzoeken');await expect(page).toHaveURL(/draft=editor/);
  await page.getByRole('checkbox',{name:'Simuleer opslagfout'}).uncheck();
  await page.getByRole('button',{name:'Globaal zoeken'}).click();
  await page.getByRole('option',{name:/Conceptfixture start/}).click();
  await expect(page).toHaveURL(/draft=start/);await expect(input).toHaveCount(0);
});


test('tab changes retain the mounted draft after a failed flush',async({page})=>{
  await page.goto('/test-harness/journey-rich?count=0&draft=editor');
  const input=page.getByRole('textbox',{name:'Fictief concept'});await input.fill('Fictief tabconcept');
  await page.getByRole('tab',{name:'Andere tab',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Opslag mislukt'})).toBeVisible();
  await expect(input).toHaveValue('Fictief tabconcept');
  await expect(page.getByRole('tab',{name:'Concept',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('checkbox',{name:'Simuleer opslagfout'}).uncheck();
  await page.getByRole('tab',{name:'Andere tab',exact:true}).click();
  await expect(page.getByRole('tabpanel')).toHaveText('Andere inhoud');
  await expect(input).toHaveCount(0);
});
