import { expect, test, type Frame, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type RehearsalState = {
  appUrl: string;
  expected: {
    billingEventCount: number;
    finalPaymentStatus: string;
    finalSessionStatus: string;
    providerEventCount: number;
    sessionCount: number;
  };
  payment: {
    amount_cents: number;
    currency: string;
    id: string;
    reference: string;
    status: string;
  };
  releaseSha: string;
  runId: string;
  tenant: { id: string };
  users: { parentEmail: string; tenantAdminEmail: string };
};

const statePath = path.resolve(process.cwd(), process.env.MOLLIE_REHEARSAL_STATE_PATH || "artifacts/mollie-rehearsal-state.json");
const enabled = process.env.MOLLIE_SANDBOX_REHEARSAL === "true";
let state: RehearsalState;

test.describe("Sprint 6 Mollie sandbox", () => {
  test.skip(!enabled, "Enable MOLLIE_SANDBOX_REHEARSAL only in the bounded staging workflow.");

  test("admin and parent complete a real Mollie test checkout", async ({ browser, page }) => {
    test.setTimeout(120_000);
    state = JSON.parse(readFileSync(statePath, "utf8")) as RehearsalState;

    await signIn(page, state.users.tenantAdminEmail, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/betalingen");
    await configureTestProvider(page);

    const paymentArticle = page.locator("article").filter({ hasText: state.payment.reference }).first();
    await expect(paymentArticle).toBeVisible();
    const checkoutForm = paymentArticle.locator("form").filter({ has: page.getByRole("button", { name: "Checkout aanmaken" }) });
    await checkoutForm.getByLabel("Provider", { exact: true }).selectOption({ label: "Mollie Sprint 6 test (test)" });
    await checkoutForm.getByLabel("Return URL", { exact: true }).fill(`${state.appUrl}/portaal/betalingen`);

    await checkoutForm.evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
    await expect(page.getByText(/Opgeslagen: provider-session(?:-reused)?\./)).toBeVisible();

    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    await signIn(parentPage, state.users.parentEmail, requiredEnv("E2E_PARENT_PASSWORD"), "/portaal/betalingen");
    const amount = new Intl.NumberFormat("nl-NL", { style: "currency", currency: state.payment.currency }).format(state.payment.amount_cents / 100);
    const parentSession = parentPage.locator("article").filter({ hasText: amount }).filter({ has: parentPage.getByRole("link", { name: "Veilig betalen via Mollie" }) }).first();
    const checkoutLink = parentSession.getByRole("link", { name: "Veilig betalen via Mollie" });
    await expect(checkoutLink).toBeVisible();
    const checkoutUrl = await checkoutLink.getAttribute("href");
    expect(checkoutUrl).toMatch(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);

    await parentPage.goto(checkoutUrl ?? "", { waitUntil: "domcontentloaded" });
    await completeMollieTestCheckout(parentPage, "paid");
    await parentPage.waitForURL(new RegExp(`^${escapeRegex(state.appUrl)}`), { timeout: 30_000 }).catch(() => undefined);
    await parentContext.close();
  });
});

async function configureTestProvider(page: Page) {
  const providerForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Provider opslaan" }) });
  await providerForm.getByLabel("Provider", { exact: true }).selectOption("mollie");
  await providerForm.getByLabel("Mode", { exact: true }).selectOption("test");
  await providerForm.getByLabel("Status", { exact: true }).selectOption("active");
  await providerForm.getByLabel("Naam", { exact: true }).fill("Mollie Sprint 6 test");
  await providerForm.getByLabel("Secret reference", { exact: true }).fill("ENV:MOLLIE_API_KEY");
  await providerForm.getByLabel("Return URL", { exact: true }).fill(`${state.appUrl}/portaal/betalingen`);
  await providerForm.getByLabel("Checkout omschrijving", { exact: true }).fill("NXTTRACK staging sandboxbetaling");
  await providerForm.getByRole("button", { name: "Provider opslaan" }).click();
  await expect(page.getByText("Opgeslagen: provider.")).toBeVisible();
}

async function completeMollieTestCheckout(page: Page, status: "paid") {
  await expect(page).toHaveURL(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);

  if (!await chooseMollieStatus(page, status)) {
    const methodSelected = await chooseMollieTestMethod(page);
    if (methodSelected) {
      await page.waitForTimeout(1_000);
    }
    if (!await chooseMollieStatus(page, status)) {
      await writeMollieDiagnostic(page);
      throw new Error("Mollie test checkout did not expose a supported paid-status control.");
    }
  }

  for (const context of pageContexts(page)) {
    const continueButton = context.getByRole("button", { name: /continue|confirm|doorgaan|verder|bevestigen|submit/i }).first();
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
      return;
    }
  }
}

async function chooseMollieStatus(page: Page, status: "paid") {
  const statusLabel = /^(paid|betaald|successful|success|geslaagd)$/i;

  for (const context of pageContexts(page)) {
    const selects = context.locator("select");
    for (let index = 0; index < await selects.count(); index += 1) {
      const select = selects.nth(index);
      const option = await select.locator("option").evaluateAll((options, pattern) => {
        const matcher = new RegExp(pattern, "i");
        const match = options.find((item) => matcher.test(`${(item as HTMLOptionElement).value} ${item.textContent ?? ""}`));
        return match ? { label: match.textContent?.trim() ?? "", value: (match as HTMLOptionElement).value } : null;
      }, "^(paid|betaald|successful|success|geslaagd)(\\s|$)");
      if (option) {
        await select.selectOption(option.value ? { value: option.value } : { label: option.label });
        return true;
      }
    }

    for (const role of ["radio", "button", "option"] as const) {
      const control = context.getByRole(role, { name: statusLabel }).first();
      if (await control.isVisible().catch(() => false)) {
        if (role === "radio") await control.check();
        else await control.click();
        return true;
      }
    }

    const exactText = context.getByText(statusLabel).first();
    if (await exactText.isVisible().catch(() => false)) {
      await exactText.click();
      return true;
    }
  }

  return false;
}

async function chooseMollieTestMethod(page: Page) {
  const methodLabel = /^(iDEAL|Credit card|Creditcard|Bank card|Bancontact)$/i;

  for (const context of pageContexts(page)) {
    for (const role of ["radio", "button", "link"] as const) {
      const control = context.getByRole(role, { name: methodLabel }).first();
      if (await control.isVisible().catch(() => false)) {
        if (role === "radio") await control.check();
        else await control.click();
        return true;
      }
    }

    const exactText = context.getByText(methodLabel).first();
    if (await exactText.isVisible().catch(() => false)) {
      await exactText.click();
      return true;
    }
  }

  return false;
}

async function writeMollieDiagnostic(page: Page) {
  const basePath = process.env.MOLLIE_REHEARSAL_DIAGNOSTIC_PATH;
  if (!basePath) return;
  mkdirSync(path.dirname(basePath), { recursive: true });
  await page.screenshot({ path: `${basePath}.png`, fullPage: true });
  const frames = await Promise.all(pageContexts(page).map(async (context) => ({
    buttons: await context.getByRole("button").allTextContents(),
    links: await context.getByRole("link").allTextContents(),
    radios: await context.getByRole("radio").evaluateAll((items) => items.map((item) => ({
      ariaLabel: item.getAttribute("aria-label"),
      value: (item as HTMLInputElement).value
    }))),
    selects: await context.locator("select").evaluateAll((items) => items.map((item) => ({
      ariaLabel: item.getAttribute("aria-label"),
      options: [...(item as HTMLSelectElement).options].map((option) => ({ text: option.text, value: option.value }))
    }))),
    url: context.url()
  })));
  writeFileSync(`${basePath}.json`, `${JSON.stringify({ frames, pageUrl: page.url() }, null, 2)}\n`);
}

function pageContexts(page: Page): Array<Page | Frame> {
  return [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
}

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForURL((url) => url.pathname === nextPath || url.pathname.startsWith(`${nextPath}/`), { timeout: 20_000 });
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
