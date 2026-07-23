import { expect, test, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

type PaymentSessionRecord = {
  checkout_url: string;
  id: string;
  provider_session_id: string;
  status: string;
};

const statePath = path.resolve(process.cwd(), process.env.MOLLIE_REHEARSAL_STATE_PATH || "artifacts/mollie-rehearsal-state.json");
const enabled = process.env.MOLLIE_SANDBOX_REHEARSAL === "true";
let state: RehearsalState;
let admin: ReturnType<typeof createClient>;

test.describe("Sprint 6 Mollie sandbox", () => {
  test.skip(!enabled, "Enable MOLLIE_SANDBOX_REHEARSAL only in the bounded staging workflow.");

  test("paid checkout and repeated webhook have exactly one business effect", async ({ browser, page, request }) => {
    test.setTimeout(120_000);
    state = JSON.parse(readFileSync(statePath, "utf8")) as RehearsalState;
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const supabaseSecret = process.env.SUPABASE_SECRET_KEY || requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    admin = createClient(supabaseUrl, supabaseSecret, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    await signIn(page, state.users.tenantAdminEmail, requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/betalingen");
    await configureTestProvider(page);

    const paymentArticle = page.locator("article").filter({ hasText: state.payment.reference }).first();
    await expect(paymentArticle).toBeVisible();
    const checkoutForm = paymentArticle.locator("form").filter({ has: page.getByRole("button", { name: "Checkout aanmaken" }) });
    await checkoutForm.getByLabel("Provider").selectOption({ label: "Mollie Sprint 6 test (test)" });
    await checkoutForm.getByLabel("Return URL").fill(`${state.appUrl}/portaal/betalingen`);

    await checkoutForm.evaluate((form) => {
      (form as HTMLFormElement).requestSubmit();
      (form as HTMLFormElement).requestSubmit();
    });
    await expect(page.getByText(/Opgeslagen: provider-session(?:-reused)?\./)).toBeVisible();

    const session = await pollSession();
    const sessionCount = await countRows(
      admin
        .from("payment_sessions")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", state.tenant.id)
        .eq("manual_payment_id", state.payment.id)
    );
    expect(sessionCount).toBe(state.expected.sessionCount);
    expect(session.checkout_url).toMatch(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);

    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    await signIn(parentPage, state.users.parentEmail, requiredEnv("E2E_PARENT_PASSWORD"), "/portaal/betalingen");
    const amount = new Intl.NumberFormat("nl-NL", { style: "currency", currency: state.payment.currency }).format(state.payment.amount_cents / 100);
    const parentSession = parentPage.locator("article").filter({ hasText: amount }).filter({ has: parentPage.getByRole("link", { name: "Veilig betalen via Mollie" }) }).first();
    const checkoutLink = parentSession.getByRole("link", { name: "Veilig betalen via Mollie" });
    await expect(checkoutLink).toBeVisible();
    expect(await checkoutLink.getAttribute("href")).toBe(session.checkout_url);

    await parentPage.goto(session.checkout_url, { waitUntil: "domcontentloaded" });
    await completeMollieTestCheckout(parentPage, "paid");
    await parentPage.waitForURL(new RegExp(`^${escapeRegex(state.appUrl)}`), { timeout: 30_000 }).catch(() => undefined);

    await pollPaidState();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await request.post(`${state.appUrl}/api/webhooks/mollie`, {
        form: { id: session.provider_session_id }
      });
      expect(response.status()).toBe(200);
    }

    const result = await verifyExactlyOnce(session);
    writeFileSync(statePath, `${JSON.stringify({ ...state, result }, null, 2)}\n`);
    await parentContext.close();
  });
});

async function configureTestProvider(page: Page) {
  const providerForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Provider opslaan" }) });
  await providerForm.getByLabel("Provider").selectOption("mollie");
  await providerForm.getByLabel("Mode").selectOption("test");
  await providerForm.getByLabel("Status").selectOption("active");
  await providerForm.getByLabel("Naam").fill("Mollie Sprint 6 test");
  await providerForm.getByLabel("Secret reference").fill("ENV:MOLLIE_API_KEY");
  await providerForm.getByLabel("Return URL").fill(`${state.appUrl}/portaal/betalingen`);
  await providerForm.getByLabel("Checkout omschrijving").fill("NXTTRACK staging sandboxbetaling");
  await providerForm.getByRole("button", { name: "Provider opslaan" }).click();
  await expect(page.getByText("Opgeslagen: provider.")).toBeVisible();
}

async function completeMollieTestCheckout(page: Page, status: "paid") {
  await expect(page).toHaveURL(/^https:\/\/(?:[^/]+\.)?mollie\.com\//);

  const statusSelect = page.locator("select").filter({ has: page.locator(`option[value='${status}']`) }).first();
  if (await statusSelect.count()) {
    await statusSelect.selectOption(status);
  } else {
    const radio = page.locator(`input[type='radio'][value='${status}']`).first();
    if (await radio.count()) {
      await radio.check();
    } else {
      await page.getByText(/^(Paid|Betaald)$/i).first().click();
    }
  }

  const continueButton = page.getByRole("button", { name: /continue|confirm|doorgaan|verder|bevestigen|submit/i }).first();
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }
}

async function pollSession(): Promise<PaymentSessionRecord> {
  let session: PaymentSessionRecord | null = null;

  await expect.poll(async () => {
      const result = await admin
        .from("payment_sessions")
        .select("id, checkout_url, provider_session_id, status")
        .eq("tenant_id", state.tenant.id)
        .eq("manual_payment_id", state.payment.id)
        .maybeSingle();
      if (result.error) throw result.error;
      const row = result.data as unknown as PaymentSessionRecord | null;
      if (row?.checkout_url && row.provider_session_id) session = row;
      return Boolean(session);
    }, { timeout: 30_000 }).toBe(true);

  if (!session) throw new Error("Mollie payment session did not become ready.");
  return session;
}

async function pollPaidState() {
  await expect.poll(async () => {
    const [payment, session] = await Promise.all([
      admin.from("manual_payments").select("status").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
      admin.from("payment_sessions").select("status").eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id).single()
    ]);
    if (payment.error) throw payment.error;
    if (session.error) throw session.error;
    const paymentRow = payment.data as unknown as { status: string };
    const sessionRow = session.data as unknown as { status: string };
    return `${paymentRow.status}:${sessionRow.status}`;
  }, { timeout: 30_000 }).toBe(`${state.expected.finalPaymentStatus}:${state.expected.finalSessionStatus}`);
}

async function verifyExactlyOnce(session: { id: string; provider_session_id: string }) {
  const [payment, paymentSession, sessions, providerEvents, billingEvents] = await Promise.all([
    admin.from("manual_payments").select("status, method, reference").eq("tenant_id", state.tenant.id).eq("id", state.payment.id).single(),
    admin.from("payment_sessions").select("status, provider_session_id").eq("tenant_id", state.tenant.id).eq("id", session.id).single(),
    admin.from("payment_sessions").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id),
    admin.from("payment_provider_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("provider_event_id", `${session.provider_session_id}:paid`),
    admin.from("billing_events").select("id", { count: "exact", head: true }).eq("tenant_id", state.tenant.id).eq("manual_payment_id", state.payment.id).eq("type", "payment_paid")
  ]);

  for (const result of [payment, paymentSession, sessions, providerEvents, billingEvents]) {
    if (result.error) throw result.error;
  }

  const paymentRow = payment.data as unknown as { method: string | null; reference: string | null; status: string };
  const sessionRow = paymentSession.data as unknown as { provider_session_id: string; status: string };
  expect(paymentRow.status).toBe(state.expected.finalPaymentStatus);
  expect(sessionRow.status).toBe(state.expected.finalSessionStatus);
  expect(sessions.count).toBe(state.expected.sessionCount);
  expect(providerEvents.count).toBe(state.expected.providerEventCount);
  expect(billingEvents.count).toBe(state.expected.billingEventCount);

  return {
    billingEventCount: billingEvents.count,
    manualPaymentStatus: paymentRow.status,
    paymentSessionStatus: sessionRow.status,
    providerEventCount: providerEvents.count,
    providerSessionId: sessionRow.provider_session_id,
    repeatedWebhookCount: 2,
    sessionCount: sessions.count,
    verifiedAt: new Date().toISOString()
  };
}

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
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
