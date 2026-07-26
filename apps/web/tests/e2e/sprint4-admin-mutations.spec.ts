import { expect, test, type Locator, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type Phase16State = {
  users: {
    tenantAdmin: { email: string };
    instructor: { fullName: string };
  };
};

const phase = loadState();
const enabled = process.env.SPRINT4_ADMIN_MUTATIONS_ENABLED === "true";
const mutationExpect = expect.configure({ timeout: 15_000 });

test.describe("Sprint 4 tenant-admin mutations", () => {
  test.skip(!enabled, "Enable admin mutations to run this staging-only journey.");
  test.beforeAll(() => {
    expect(phase, "PHASE16_STATE_PATH must resolve to a readable state file when admin mutations are enabled.").not.toBeNull();
  });

  test("admin creates the core, planning, billing, document and communication chain", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const state = requireState();
    const failures = collectRuntimeFailures(page);
    const suffix = `${process.env.GITHUB_RUN_ID ?? Date.now()}-${testInfo.retry}`;
    const programName = `Sprint 4 Admin Programma ${suffix}`;
    const programCode = `sprint4-admin-program-${suffix}`;
    const stageName = `Sprint 4 Admin Stage ${suffix}`;
    const stageCode = `sprint4-admin-stage-${suffix}`;
    const groupName = `Sprint 4 Admin Groep ${suffix}`;
    const groupCode = `sprint4-admin-group-${suffix}`;
    const participantName = `Sprint 4 Admin Leerling ${suffix}`;
    const planName = `Sprint 4 Admin Plan ${suffix}`;
    const planCode = `sprint4-admin-plan-${suffix}`;
    const paymentReference = `sprint4-admin-payment-${suffix}`;
    const documentTitle = `Sprint 4 Admin Document ${suffix}`;
    const messageTitle = `Sprint 4 Admin Bericht ${suffix}`;
    const today = dateValue(0);

    await signIn(page, state.users.tenantAdmin.email, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/programma");

    await openAction(page, "Programma toevoegen");
    let form = formWithButton(page, "Programma opslaan");
    await form.getByLabel("Naam").fill(programName);
    await form.getByLabel("Code").fill(programCode);
    await form.getByLabel("Omschrijving").fill("Browsergedreven Sprint 4 adminbewijs.");
    await submitAndWaitForSaved(page, form, "Programma opslaan", "/admin/programma", "1");
    await mutationExpect(page.getByRole("listitem").filter({ hasText: programName })).toHaveCount(1);

    await page.goto("/admin/programma", { waitUntil: "domcontentloaded" });
    await openAction(page, "Niveau toevoegen");
    form = formWithButton(page, "Stage opslaan");
    await selectOptionByText(form.getByLabel("Programma"), programName);
    await form.getByLabel("Naam").fill(stageName);
    await form.getByLabel("Code").fill(stageCode);
    await form.getByLabel("Badge label").fill("Sprint 4 bewijsbadje");
    await submitAndWaitForSaved(page, form, "Stage opslaan", "/admin/programma", "1");
    await mutationExpect(page.getByRole("listitem").filter({ hasText: programName }).getByText("1 badje(s)", { exact: false })).toBeVisible();

    await page.goto("/admin/groepen", { waitUntil: "domcontentloaded" });
    await openAction(page, "Nieuwe groep");
    form = formWithButton(page, "Lesgroep opslaan");
    await form.getByLabel("Naam").fill(groupName);
    await form.getByLabel("Code").fill(groupCode);
    await selectOptionByText(form.getByLabel("Programma"), programName);
    await selectOptionByText(form.getByLabel("Niveau"), stageName);
    await form.getByLabel("Capaciteit").fill("6");
    await form.getByLabel("Vaste dag").selectOption("3");
    await form.getByLabel("Starttijd").fill("17:00");
    await form.getByLabel("Eindtijd").fill("17:45");
    await submitAndWaitForSaved(page, form, "Lesgroep opslaan", "/admin/groepen", "1");
    await filterResourceTable(page, "Zoek groep…", groupName);
    await mutationExpect(resourceRow(page, groupName)).toHaveCount(1);

    await page.goto("/admin/groepen", { waitUntil: "domcontentloaded" });
    await openAction(page, "Instructeur koppelen");
    form = formWithButton(page, "Instructeur koppelen");
    await selectOptionByText(form.getByLabel("Lesgroep"), groupName);
    await selectOptionByText(form.getByLabel("Instructeur"), state.users.instructor.fullName);
    await form.getByLabel("Vanaf").fill(today);
    await submitAndWaitForSaved(page, form, "Instructeur koppelen", "/admin/groepen", "1");
    await filterResourceTable(page, "Zoek groep…", groupName);
    await mutationExpect(resourceRow(page, groupName).getByText("1 instructeur", { exact: true })).toBeVisible();

    await page.goto("/admin/leerlingen", { waitUntil: "domcontentloaded" });
    await openAction(page, "Leerling toevoegen");
    form = formWithButton(page, "Leerling inschrijven");
    await form.getByLabel("Leerlingnaam").fill(participantName);
    await form.getByLabel("Geboortedatum").fill("2019-04-12");
    await form.getByLabel("Startdatum").fill(today);
    await selectOptionByText(form.getByLabel("Programma"), programName);
    await selectOptionByText(form.getByLabel("Huidig niveau"), stageName);
    await submitAndWaitForSaved(page, form, "Leerling inschrijven", "/admin/leerlingen", "1");
    await filterResourceTable(page, "Zoek leerling of ouder…", participantName);
    await mutationExpect(resourceRow(page, participantName)).toHaveCount(1);

    await page.goto("/admin/leerlingen", { waitUntil: "domcontentloaded" });
    await openAction(page, "Plaatsen");
    form = formWithButton(page, "In groep plaatsen");
    await selectOptionByText(form.getByLabel("Inschrijving"), participantName);
    await selectOptionByText(form.getByLabel("Lesgroep"), groupName);
    await form.getByLabel("Startdatum").fill(today);
    await submitAndWaitForSaved(page, form, "In groep plaatsen", "/admin/leerlingen", "1");
    await filterResourceTable(page, "Zoek leerling of ouder…", participantName);
    await mutationExpect(resourceRow(page, participantName).getByText(groupName, { exact: true })).toBeVisible();

    await page.goto("/admin/agenda", { waitUntil: "domcontentloaded" });
    await openAction(page, "Les plannen");
    form = formWithButton(page, "Les opslaan");
    await selectOptionByText(form.getByLabel("Lesgroep"), groupName);
    await form.getByLabel("Start").fill(dateTimeValue(5, 17, 0));
    await form.getByLabel("Einde").fill(dateTimeValue(5, 17, 45));
    await form.getByLabel("Notitie").fill(`sprint4-admin:${suffix}:session`);
    await submitAndWaitForSaved(page, form, "Les opslaan", "/admin/agenda", "1");
    await expect(page.getByText("Opgeslagen: 1.")).toBeVisible();
    await expect(page.getByRole("button").filter({ hasText: groupName })).toHaveCount(1);

    await page.goto("/admin/betalingen", { waitUntil: "domcontentloaded" });
    form = formWithButton(page, "Plan opslaan");
    await form.getByLabel("Naam").fill(planName);
    await form.getByLabel("Code").fill(planCode);
    await selectOptionByText(form.getByLabel("Programma"), programName);
    await form.getByLabel("Bedrag").fill("42,50");
    await submitAndWaitForSaved(page, form, "Plan opslaan", "/admin/betalingen", "plan");
    await expect(page.getByText("Opgeslagen: plan.")).toBeVisible();

    form = formWithButton(page, "Subscription opslaan");
    await selectOptionByText(form.getByLabel("Inschrijving"), participantName);
    await selectOptionByText(form.getByLabel("Payment plan"), planName);
    await form.getByLabel("Startdatum").fill(today);
    await form.getByLabel("Volgende vervaldatum").fill(dateValue(14));
    await form.getByLabel("Notities").fill(`sprint4-admin:${suffix}:subscription`);
    await submitAndWaitForSaved(page, form, "Subscription opslaan", "/admin/betalingen", "subscription");
    await expect(page.getByText("Opgeslagen: subscription.")).toBeVisible();
    await expect(page.locator("article").filter({ hasText: participantName }).filter({ hasText: planName })).toHaveCount(1);

    form = formWithButton(page, "Betaling opslaan");
    await selectOptionByText(form.getByLabel("Subscription"), participantName);
    await form.getByLabel("Vervaldatum").fill(dateValue(14));
    await form.getByLabel("Referentie").fill(paymentReference);
    await form.getByLabel("Methode").fill("staging-browser");
    await submitAndWaitForSaved(page, form, "Betaling opslaan", "/admin/betalingen", "payment");
    await expect(page.getByText("Opgeslagen: payment.")).toBeVisible();
    let payment = page.locator("article").filter({ hasText: paymentReference });
    await expect(payment).toHaveCount(1);
    await payment.getByLabel("Status").selectOption("paid");
    await payment.getByLabel("Betaaldatum").fill(today);
    await submitAndWaitForSaved(page, payment, "Status bijwerken", "/admin/betalingen", "status");
    await expect(page.getByText("Opgeslagen: status.")).toBeVisible();
    payment = page.locator("article").filter({ hasText: paymentReference });
    await expect(payment.getByText("paid", { exact: true })).toBeVisible();

    await page.goto("/admin/documenten", { waitUntil: "domcontentloaded" });
    await openAction(page, "Document toevoegen");
    form = formWithButton(page, "Document opslaan");
    await form.getByLabel("Titel").fill(documentTitle);
    await form.getByLabel("Omschrijving").fill("Metadata-only browserbewijs; geen extern bestand.");
    await submitAndWaitForSaved(page, form, "Document opslaan", "/admin/documenten", "document");
    await expect(page.getByText("Opgeslagen: document.")).toBeVisible();
    await filterResourceTable(page, "Zoek document…", documentTitle);
    await expect(resourceRow(page, documentTitle)).toHaveCount(1);

    await page.goto("/admin/berichten", { waitUntil: "domcontentloaded" });
    await openAction(page, "Bericht opstellen");
    form = formWithButton(page, "Bericht opslaan");
    await form.getByLabel("Titel").fill(messageTitle);
    await form.getByLabel("Bericht").fill("Interne conceptcommunicatie uit de Sprint 4 browserjourney.");
    await submitAndWaitForSaved(page, form, "Bericht opslaan", "/admin/berichten", "message");
    await expect(page.getByText("Opgeslagen: message.")).toBeVisible();
    await expect(page.getByRole("list").getByText(messageTitle, { exact: true })).toBeVisible();

    expect(failures()).toEqual([]);
  });
});

function formWithButton(page: Page, name: string) {
  return page.locator("form").filter({ has: page.getByRole("button", { name, exact: true }) });
}

async function openAction(page: Page, name: string) {
  await page.getByRole("button", { name, exact: true }).click();
}

function resourceRow(page: Page, text: string) {
  return page.getByRole("table").getByRole("row").filter({ hasText: text });
}

async function filterResourceTable(page: Page, accessibleName: string, value: string) {
  await page.getByRole("textbox", { name: accessibleName, exact: true }).fill(value);
}

async function submitAndWaitForSaved(page: Page, form: Locator, buttonName: string, pathname: string, saved: string) {
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.pathname === pathname &&
        (url.searchParams.get("saved") === saved || url.searchParams.has("error")),
      { timeout: 20_000 }
    ),
    form.getByRole("button", { name: buttonName, exact: true }).click()
  ]);
  expect(new URL(page.url()).searchParams.get("saved"), `${buttonName} must finish with a confirmed saved redirect.`).toBe(saved);
}

async function selectOptionByText(select: Locator, text: string) {
  const option = select.locator("option").filter({ hasText: text }).first();
  const value = await option.getAttribute("value");
  if (!value) throw new Error(`No selectable option found for ${text}.`);
  await select.selectOption(value);
}

async function signIn(page: Page, email: string, password: string, nextPath: string) {
  await page.goto(`/login?next=${encodeURIComponent(nextPath)}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name='email']").fill(email);
  await page.locator("input[name='password']").fill(password);
  await page.getByRole("button", { name: /inloggen/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await expect(page).toHaveURL(new RegExp(`${nextPath.replaceAll("/", "\\/")}(?:\\?|$)`));
}

function collectRuntimeFailures(page: Page) {
  const failures: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("favicon")) failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500 || (response.status() >= 400 && response.url().includes("/_next/static/"))) failures.push(`response ${response.status()}: ${response.url()}`);
  });
  return () => failures;
}

function loadState() {
  const statePath = process.env.PHASE16_STATE_PATH;
  if (!statePath) return null;
  const resolved = path.resolve(process.cwd(), statePath);
  return existsSync(resolved) ? (JSON.parse(readFileSync(resolved, "utf8")) as Phase16State) : null;
}

function requireState() {
  if (!phase) throw new Error("Phase 16 state is required for Sprint 4 admin mutations.");
  return phase;
}

function dateValue(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function dateTimeValue(days: number, hour: number, minute: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, minute, 0, 0);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
