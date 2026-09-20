import assert from 'node:assert/strict';
import { expect, test } from '@playwright/test';
import { waitForAnonymousLogin } from '../../../../scripts/release/v4-browser-contract.mjs';

const origin = 'https://anonymous-redirect.test';
const login = '<label for="email">E-mail</label><input id="email"><label for="password">Wachtwoord</label><input id="password" type="password">';

async function fixture(page, destination = '/login', fields = true) {
  // All responses are local. No account, auth service, or external request is used.
  await page.route('**/*', route => {
    const current = new URL(route.request().url());
    const body = current.pathname === '/platform'
      ? `<h1>Loading private shell</h1><script>setTimeout(() => location.href = ${JSON.stringify(destination)}, 200)</script>`
      : `<h1>Destination</h1>${fields ? login : ''}`;
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  });
  await page.goto(`${origin}/platform`, { waitUntil: 'domcontentloaded' });
}

test('waits for the delayed redirect that the former immediate assertion rejects', async ({ page }) => {
  await fixture(page);
  assert.throws(() => assert.equal(new URL(page.url()).pathname, '/login'));
  await waitForAnonymousLogin(page, origin, 2_000);
  assert.equal(new URL(page.url()).pathname, '/login');
  await expect(page.getByLabel('E-mail', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Wachtwoord', { exact: true })).toBeVisible();
});

for (const destination of ['/unexpected', 'https://wrong-origin.test/login']) {
  test(`rejects the wrong redirect destination ${destination}`, async ({ page }) => {
    await fixture(page, destination);
    await assert.rejects(waitForAnonymousLogin(page, origin, 600), /Timeout|budget/);
    assert.notEqual(page.url(), `${origin}/login`);
  });
}

test('a matching URL without the actual login fields still fails', async ({ page }) => {
  await fixture(page, '/login', false);
  await assert.rejects(waitForAnonymousLogin(page, origin, 600), /Timeout|budget/);
  assert.equal(new URL(page.url()).pathname, '/login');
});

test('the observation budget cannot exceed the existing 30 seconds', async ({ page }) => {
  await assert.rejects(waitForAnonymousLogin(page, origin, 30_001), /bounded/);
});
