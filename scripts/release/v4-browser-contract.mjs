import assert from 'node:assert/strict';

export function verificationConfig(env) {
  assert.ok(['staging', 'production'].includes(env.TARGET), 'TARGET must explicitly be staging or production');
  assert.match(env.RELEASE_SHA ?? '', /^[a-f0-9]{40}$/, 'RELEASE_SHA must be a full immutable commit SHA');
  assert.match(env.VERIFIER_SOURCE_SHA ?? '', /^[a-f0-9]{40}$/, 'VERIFIER_SOURCE_SHA must identify the verification source');
  const origin = env.TARGET === 'production' ? 'https://nxttrack.nl' : 'https://staging.nxttrack.nl';
  return {
    target: env.TARGET,
    releaseSha: env.RELEASE_SHA,
    verifierSourceSha: env.VERIFIER_SOURCE_SHA,
    origin,
    adminOrigin: env.TARGET === 'production' ? 'https://admin.nxttrack.nl' : origin,
    tenantOrigin: 'https://aquaswim-demo.staging.nxttrack.nl'
  };
}

export function assertReleaseHealth(status, health, config) {
  assert.equal(status, 200, 'Health endpoint must return HTTP 200');
  assert.equal(health?.ok, true, 'Runtime health must pass');
  assert.equal(health?.env, config.target, 'Runtime must match the selected environment');
  assert.equal(health?.commitSha, config.releaseSha, 'Runtime must match the requested application SHA');
  assert.equal(health?.checks?.database?.status, 'pass', 'Database health must pass');
  assert.equal(health?.checks?.schemaCompatibility?.status, 'pass', 'Schema compatibility must pass');
}

export async function waitForAnonymousLogin(page, adminOrigin, timeoutMs = 30000) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000, 'Login redirect budget must be bounded');
  const origin = new URL(adminOrigin).origin;
  const deadline = performance.now() + timeoutMs;
  const remaining = () => {
    const value = Math.ceil(deadline - performance.now());
    assert.ok(value > 0, 'Anonymous login redirect exceeded its budget');
    return value;
  };
  // A streamed Next.js redirect can arrive after the source document's DOMContentLoaded.
  await page.waitForURL(url => url.origin === origin && url.pathname === '/login', {
    timeout: remaining(), waitUntil: 'domcontentloaded'
  });
  await page.getByLabel('E-mail', {exact:true}).waitFor({state:'visible', timeout:remaining()});
  await page.getByLabel('Wachtwoord', {exact:true}).waitFor({state:'visible', timeout:remaining()});
}

export async function verifyTenantAssignmentReachability(page, fixtureSlugs, timeoutMs = 5000) {
  assert.ok(Array.isArray(fixtureSlugs) && fixtureSlugs.length === 3 && new Set(fixtureSlugs).size === 3,
    'Exactly three distinct fixture tenants are required');
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 5000, 'Trial click budget must be bounded');
  const section = page.locator('section').filter({has: page.getByRole('heading', {level:2, name:'Tenantassignments', exact:true})});
  assert.equal(await section.count(), 1, 'Exactly one assignment section is required');
  assert.equal(await section.locator('article').count(), 3, 'Exactly three assignment articles are required');
  // Values stay in memory and are compared through a boolean, never assertion output.
  const formState = () => section.locator('input,select,textarea').evaluateAll(elements => elements.map(element =>
    [element.tagName, element.value, element.checked ?? null, element.selectedIndex ?? null]));
  const before = JSON.stringify(await formState());
  const bounds = [];
  for (const slug of fixtureSlugs) {
    const article = section.locator('article').filter({has: page.getByText(slug, {exact:true})});
    assert.equal(await article.count(), 1, 'Each fixture must identify exactly one assignment article');
    for (const name of ['Activeer', 'Plan', 'Naamgate opslaan']) {
      const button = article.getByRole('button', {name, exact:true});
      assert.equal(await button.count(), 1, 'Each assignment action must occur once');
      // Playwright performs scrolling and normal actionability checks but dispatches
      // no pointer click, submit, or input event in trial mode.
      await button.click({trial:true, timeout:timeoutMs});
      const visible = await button.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {reachable:x >= 0 && x < innerWidth && y >= 0 && y < innerHeight
          && Boolean(hit && (hit === element || element.contains(hit))),
        viewportWidth:innerWidth, viewportHeight:innerHeight,
        scrollX, scrollY, documentWidth:document.documentElement.scrollWidth,
        documentHeight:document.documentElement.scrollHeight,
        left:rect.left, top:rect.top, width:rect.width, height:rect.height};
      });
      assert.ok(visible.reachable, 'Assignment action must be reachable at its visible center');
      const {reachable, ...numericBounds} = visible;
      bounds.push(numericBounds);
    }
  }
  assert.ok(before === JSON.stringify(await formState()), 'Assignment form values must remain unchanged');
  return {check:'staging theme assignment actions reachable without activation', status:'pass',
    articles:3, trialActions:9, bounds};
}
