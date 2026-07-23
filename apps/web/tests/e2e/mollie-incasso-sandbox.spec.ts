import { expect, test, type Frame, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type IncassoState = {
  changePaymentStateUrl: string;
  providerPaymentId: string;
};

const statePath = path.resolve(process.cwd(), process.env.MOLLIE_INCASSO_STATE_PATH || "artifacts/mollie-incasso-runtime.json");
const enabled = process.env.MOLLIE_INCASSO_REHEARSAL === "true";
const outcome = process.env.MOLLIE_INCASSO_OUTCOME === "failed" ? "failed" : "paid";

test.describe("Sprint 6 Mollie recurring incasso sandbox", () => {
  test.skip(!enabled, "Enable MOLLIE_INCASSO_REHEARSAL only in the bounded staging workflow.");

  test(`moves the background SEPA Direct Debit payment to ${outcome}`, async ({ page }) => {
    test.setTimeout(90_000);
    const state = JSON.parse(readFileSync(statePath, "utf8")) as IncassoState;

    expect(state.providerPaymentId).toMatch(/^tr_[A-Za-z0-9]+$/);
    expect(isSafeMollieUrl(state.changePaymentStateUrl)).toBe(true);
    await page.goto(state.changePaymentStateUrl, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);

    if (!(await chooseFinalStatus(page, outcome))) {
      await writeDiagnostic(page);
      throw new Error(`Mollie recurring test page did not expose a ${outcome}-status control.`);
    }
    await continueTestPayment(page);
    await page.waitForTimeout(1_500);
  });
});

async function chooseFinalStatus(page: Page, status: "paid" | "failed") {
  const statusLabel = status === "paid"
    ? /^(paid|betaald|successful|success|geslaagd)$/i
    : /^(failed|mislukt|failure|geweigerd)$/i;
  const optionPattern = status === "paid"
    ? "^(paid|betaald|successful|success|geslaagd)(\\s|$)"
    : "^(failed|mislukt|failure|geweigerd)(\\s|$)";

  for (const context of pageContexts(page)) {
    const selects = context.locator("select");
    for (let index = 0; index < await selects.count(); index += 1) {
      const select = selects.nth(index);
      const option = await select.locator("option").evaluateAll((options, pattern) => {
        const matcher = new RegExp(pattern, "i");
        const match = options.find((item) => matcher.test(`${(item as HTMLOptionElement).value} ${item.textContent ?? ""}`));
        return match ? { label: match.textContent?.trim() ?? "", value: (match as HTMLOptionElement).value } : null;
      }, optionPattern);
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
  }

  return false;
}

async function continueTestPayment(page: Page) {
  for (const context of pageContexts(page)) {
    const button = context.getByRole("button", { name: /continue|confirm|doorgaan|verder|bevestigen|submit/i }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
  }
}

async function writeDiagnostic(page: Page) {
  const basePath = process.env.MOLLIE_INCASSO_DIAGNOSTIC_PATH;
  if (!basePath) return;
  mkdirSync(path.dirname(basePath), { recursive: true });
  await page.screenshot({ path: `${basePath}.png`, fullPage: true });
  const frames = await Promise.all(pageContexts(page).map(async (context) => ({
    buttons: await context.getByRole("button").allTextContents(),
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

function isSafeMollieUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "mollie.com" || url.hostname.endsWith(".mollie.com"));
  } catch {
    return false;
  }
}
