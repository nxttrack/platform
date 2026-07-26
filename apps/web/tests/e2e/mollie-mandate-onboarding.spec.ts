import { expect, test, type Frame, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type MandateState = {
  appUrl: string;
  parentEmail: string;
  participantName: string;
  payment: { amount_cents: number; currency: string };
};

const statePath = path.resolve(process.cwd(), process.env.MOLLIE_MANDATE_STATE_PATH || "artifacts/mollie-mandate-runtime.json");
const enabled = process.env.MOLLIE_MANDATE_REHEARSAL === "true";

test.describe("Mollie mandate onboarding", () => {
  test.skip(!enabled, "Enable only in the bounded staging mandate workflow.");

  test("parent gives explicit consent and completes the first payment", async ({ page }) => {
    test.setTimeout(120_000);
    const state = JSON.parse(readFileSync(statePath, "utf8")) as MandateState;
    await signIn(page, state.parentEmail, requiredEnv("E2E_PARENT_PASSWORD"), "/portaal/betalingen");

    const onboardingCard = page
      .locator("article")
      .filter({ hasText: state.participantName })
      .filter({ has: page.getByRole("button", { name: "Veilig activeren via Mollie" }) })
      .first();
    await expect(onboardingCard).toBeVisible();
    await onboardingCard.getByRole("checkbox").check();
    await onboardingCard.getByRole("button", { name: "Veilig activeren via Mollie" }).click();
    await expect(page.getByText("Mollie is geopend voor de eerste betaling en incassomachtiging.")).toBeVisible();

    const amount = new Intl.NumberFormat("nl-NL", { style: "currency", currency: state.payment.currency }).format(state.payment.amount_cents / 100);
    const session = page
      .locator("article")
      .filter({ hasText: amount })
      .filter({ has: page.getByRole("link", { name: "Veilig betalen via Mollie" }) })
      .first();
    const checkoutLink = session.getByRole("link", { name: "Veilig betalen via Mollie" });
    await expect(checkoutLink).toBeVisible();
    const checkoutUrl = await checkoutLink.getAttribute("href");
    expect(checkoutUrl).toMatch(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);

    await page.goto(checkoutUrl ?? "", { waitUntil: "domcontentloaded" });
    await completeMollieTestCheckout(page);
  });
});

async function completeMollieTestCheckout(page: Page) {
  await expect(page).toHaveURL(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);
  for (let step = 0; step < 4; step += 1) {
    if (await choosePaidStatus(page)) {
      await continueCheckout(page);
      return;
    }
    if (await chooseTestMethod(page) || await chooseTestIssuer(page)) {
      await page.waitForTimeout(1_000);
      continue;
    }
    break;
  }
  await writeDiagnostic(page);
  throw new Error("Mollie first-payment checkout did not expose a supported paid-status control.");
}

async function choosePaidStatus(page: Page) {
  const label = /^(paid|betaald|successful|success|geslaagd)$/i;
  for (const context of pageContexts(page)) {
    const selects = context.locator("select");
    for (let index = 0; index < await selects.count(); index += 1) {
      const select = selects.nth(index);
      const option = await select.locator("option").evaluateAll((options) => {
        const matcher = /^(paid|betaald|successful|success|geslaagd)(\s|$)/i;
        const match = options.find((item) => matcher.test(`${(item as HTMLOptionElement).value} ${item.textContent ?? ""}`));
        return match ? { label: match.textContent?.trim() ?? "", value: (match as HTMLOptionElement).value } : null;
      });
      if (option) {
        await select.selectOption(option.value ? { value: option.value } : { label: option.label });
        return true;
      }
    }
    for (const role of ["radio", "button", "option"] as const) {
      const control = context.getByRole(role, { name: label }).first();
      if (await control.isVisible().catch(() => false)) {
        if (role === "radio") await control.check();
        else await control.click();
        return true;
      }
    }
  }
  return false;
}

async function chooseTestMethod(page: Page) {
  const label = /iDEAL|Credit card|Creditcard|Bank card|Bancontact/i;
  for (const context of pageContexts(page)) {
    for (const role of ["radio", "button", "link"] as const) {
      const control = context.getByRole(role, { name: label }).first();
      if (await control.isVisible().catch(() => false)) {
        if (role === "radio") await control.check();
        else await control.click();
        return true;
      }
    }
  }
  return false;
}

async function chooseTestIssuer(page: Page) {
  for (const context of pageContexts(page)) {
    const issuer = context.getByRole("button", { name: /ABN AMRO/i }).first();
    if (await issuer.isVisible().catch(() => false)) {
      await issuer.click();
      return true;
    }
  }
  return false;
}

async function continueCheckout(page: Page) {
  for (const context of pageContexts(page)) {
    const button = context.getByRole("button", { name: /continue|confirm|doorgaan|verder|bevestigen|submit/i }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
  }
}

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL((url) => url.pathname === nextPath || url.pathname.startsWith(`${nextPath}/`), { timeout: 20_000 });
}

async function writeDiagnostic(page: Page) {
  const basePath = process.env.MOLLIE_MANDATE_DIAGNOSTIC_PATH;
  if (!basePath) return;
  mkdirSync(path.dirname(basePath), { recursive: true });
  await page.screenshot({ path: `${basePath}.png`, fullPage: true });
  writeFileSync(`${basePath}.json`, `${JSON.stringify({
    pageUrl: page.url(),
    frames: await Promise.all(pageContexts(page).map(async (context) => ({
      buttons: await context.getByRole("button").allTextContents(),
      links: await context.getByRole("link").allTextContents(),
      url: context.url()
    })))
  }, null, 2)}\n`);
}

function pageContexts(page: Page): Array<Page | Frame> {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
