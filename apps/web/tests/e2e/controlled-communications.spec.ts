import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";

const recipientEmail = requiredEnv("CONTROLLED_RECIPIENT_EMAIL").trim().toLowerCase();
const tenantSlug = requiredEnv("CONTROLLED_TENANT_SLUG");
const mutationExpect = expect.configure({ timeout: 20_000 });
const execFileAsync = promisify(execFile);
const evidenceScript = resolve(process.cwd(), "../../scripts/staging/controlled-communications-evidence.mjs");

test.describe("controlled staging communications", () => {
  test("delivers invite and reset mail, then preserves failed evidence during a notification retry", async ({ page }) => {
    test.setTimeout(120_000);
    expect(process.env.APP_ENV).toBe("staging");
    expect(process.env.CONTROLLED_COMMUNICATIONS_REHEARSAL).toBe("true");

    const startedAt = new Date().toISOString();
    const marker = `controlled-communications:${process.env.GITHUB_RUN_ID ?? Date.now()}`;

    await signIn(page, requiredEnv("E2E_PLATFORM_OWNER_EMAIL"), requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"), "/platform/uitnodigingen");
    await page.getByRole("tab", { name: "Zwemschool" }).click();
    await page.getByLabel("Naam").fill("Controlled Communications Recipient");
    await page.getByLabel("E-mail").fill(recipientEmail);
    await page.getByLabel("Rol binnen de zwemschool").selectOption("parent");
    await page.getByLabel("Organisatie").selectOption(tenantSlug);
    await page.getByRole("button", { name: "Organisatie-uitnodiging sturen" }).click();
    await mutationExpect(page.getByText("Uitnodiging is verzonden.")).toBeVisible();
    await evidenceCommand("wait-delivery", [recipientEmail, startedAt, "auth_invitation"]);

    await page.goto("/wachtwoord-vergeten", { waitUntil: "domcontentloaded" });
    await page.getByLabel("E-mail").fill(recipientEmail);
    await page.getByRole("button", { name: "Code versturen" }).click();
    await mutationExpect(page.getByText("Als dit e-mailadres bekend is, is de code verzonden.")).toBeVisible();
    await evidenceCommand("wait-delivery", [recipientEmail, startedAt, "auth_password_reset"]);

    const seed = await evidenceCommand("seed-retry", [marker, recipientEmail, tenantSlug]);

    await page.context().clearCookies();
    await signIn(page, requiredEnv("E2E_TENANT_ADMIN_EMAIL"), requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/berichten");
    const failedAttempt = page.locator("div").filter({ hasText: marker }).filter({ has: page.getByRole("button", { name: "Retry" }) }).first();
    await mutationExpect(failedAttempt).toBeVisible();
    await failedAttempt.getByRole("button", { name: "Retry" }).click();
    await mutationExpect(page.getByText("Opgeslagen: mail_retry.")).toBeVisible();

    await evidenceCommand("verify-retry", [seed.notificationId]);
  });
});

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await mutationExpect(page).toHaveURL(new RegExp(`${nextPath.replaceAll("/", "\\/")}(?:\\?|$)`));
}

async function evidenceCommand(command: string, args: string[]) {
  const { stdout } = await execFileAsync(process.execPath, [evidenceScript, command, ...args], {
    env: process.env,
    timeout: 30_000
  });
  return JSON.parse(stdout.trim()) as { notificationId: string };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
