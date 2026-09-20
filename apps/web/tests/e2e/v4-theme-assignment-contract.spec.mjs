import assert from 'node:assert/strict';
import { test } from '@playwright/test';
import { verifyTenantAssignmentReachability } from '../../../../scripts/release/v4-browser-contract.mjs';

const slugs = ['fixture-one', 'fixture-two', 'fixture-three'];
async function fixture(page, clipped = false, fixtures = slugs) {
  let mutationRequests = 0;
  await page.route('**/*', route => {
    if (route.request().method() !== 'GET') mutationRequests += 1;
    return route.fulfill({status:200, contentType:'text/html', body:`
      <style>body{margin:0} main{height:450px} article{width:2400px;margin:20px;padding:20px;border:1px solid}
      form{margin:12px 12px 12px 1500px} button{height:44px} .spacer{height:1300px}
      section{${clipped ? 'height:80px;overflow:clip' : ''}}</style>
      <main><h1>Theme catalog</h1></main><div class="spacer"></div>
      <section><h2>Tenantassignments</h2><div class="articles">${fixtures.map(slug => `
        <article><p>${slug}</p>${['Activeer','Plan','Naamgate opslaan'].map(name => `
          <form method="post" action="/mutation"><input value="private-fixture-value">
          <button type="submit">${name}</button></form>`).join('')}</article>`).join('')}</div></section>
      <script>window.events={click:0,submit:0,input:0,change:0};for(const name of Object.keys(events))
      document.addEventListener(name,()=>events[name]++);</script>`});
  });
  await page.goto('https://assignment-contract.test');
  return () => mutationRequests;
}

test('trial actions scroll beyond main and are hit-testable without changing or submitting forms', async ({page}) => {
  const mutations = await fixture(page);
  assert.equal(await page.evaluate(() => scrollY), 0);
  const proof = await verifyTenantAssignmentReachability(page, slugs, 1500);
  assert.equal(proof.trialActions, 9);
  assert.equal(proof.articles, 3);
  assert.ok(proof.bounds.every(bound => bound.scrollY > 0 && bound.top >= 0 && bound.top < bound.viewportHeight));
  assert.ok(proof.bounds.every(bound => bound.scrollX > 0 && bound.documentWidth > bound.viewportWidth
    && bound.left >= 0 && bound.left < bound.viewportWidth));
  assert.equal(mutations(), 0);
  assert.deepEqual(await page.evaluate(() => window.events), {click:0,submit:0,input:0,change:0});
  assert.equal(JSON.stringify(proof).includes('private-fixture-value'), false);
  assert.equal(slugs.some(slug => JSON.stringify(proof).includes(slug)), false);
});

test('genuinely clipped controls fail instead of bypassing normal actionability', async ({page}) => {
  const mutations = await fixture(page, true);
  await assert.rejects(verifyTenantAssignmentReachability(page, slugs, 600), /Timeout|reachable/);
  assert.equal(mutations(), 0);
  assert.deepEqual(await page.evaluate(() => window.events), {click:0,submit:0,input:0,change:0});
});

for (const [label, fixtures] of [
  ['duplicate', [slugs[0], slugs[0], slugs[2]]],
  ['missing', [slugs[0], slugs[1], 'unexpected-fixture']]
]) {
  test(`${label} fixture identities cannot satisfy the three-article contract`, async ({page}) => {
    await fixture(page, false, fixtures);
    await assert.rejects(verifyTenantAssignmentReachability(page, slugs, 600), /exactly one/);
  });
}
