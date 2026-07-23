import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const recipientEmail = requiredEnv("CONTROLLED_RECIPIENT_EMAIL").trim().toLowerCase();
const tenantSlug = requiredEnv("CONTROLLED_TENANT_SLUG");
const mutationExpect = expect.configure({ timeout: 20_000 });

test.describe("controlled staging communications", () => {
  test("delivers invite and reset mail, then preserves failed evidence during a notification retry", async ({ page }) => {
    test.setTimeout(120_000);
    expect(process.env.APP_ENV).toBe("staging");

    const admin = adminClient();
    const startedAt = new Date().toISOString();
    const marker = `controlled-communications:${process.env.GITHUB_RUN_ID ?? Date.now()}`;

    await signIn(page, requiredEnv("E2E_PLATFORM_OWNER_EMAIL"), requiredEnv("E2E_PLATFORM_OWNER_PASSWORD"), "/platform/uitnodigingen");
    await page.getByLabel("Naam").fill("Controlled Communications Recipient");
    await page.getByLabel("E-mail").fill(recipientEmail);
    await page.getByLabel("Rol").selectOption("parent");
    await page.getByLabel("Organisatie slug").fill(tenantSlug);
    await page.getByRole("button", { name: "Uitnodiging sturen" }).click();
    await mutationExpect(page.getByText("Uitnodiging is verzonden.")).toBeVisible();
    await expectDelivery(admin, { recipientEmail, startedAt, templateKey: "auth_invitation" });

    await page.goto("/wachtwoord-vergeten", { waitUntil: "domcontentloaded" });
    await page.getByLabel("E-mail").fill(recipientEmail);
    await page.getByRole("button", { name: "Code versturen" }).click();
    await mutationExpect(page.getByText("Als dit e-mailadres bekend is, is de code verzonden.")).toBeVisible();
    await expectDelivery(admin, { recipientEmail, startedAt, templateKey: "auth_password_reset" });

    const seed = await seedRetryEvidence(admin, { marker, recipientEmail, tenantSlug });

    await page.context().clearCookies();
    await signIn(page, requiredEnv("E2E_TENANT_ADMIN_EMAIL"), requiredEnv("E2E_TENANT_ADMIN_PASSWORD"), "/admin/berichten");
    const failedAttempt = page.locator("div").filter({ hasText: marker }).filter({ has: page.getByRole("button", { name: "Retry" }) }).first();
    await mutationExpect(failedAttempt).toBeVisible();
    await failedAttempt.getByRole("button", { name: "Retry" }).click();
    await mutationExpect(page.getByText("Opgeslagen: mail_retry.")).toBeVisible();

    await expect
      .poll(async () => deliveryStates(admin, seed.notificationId), {
        message: "The original failed attempt must remain and the retry must create a sent attempt.",
        timeout: 20_000
      })
      .toEqual(["failed", "sent"]);

    const { data: notification, error: notificationError } = await admin
      .from("tenant_notifications")
      .select("delivery_status, delivery_error, delivered_at")
      .eq("id", seed.notificationId)
      .single();

    expect(notificationError).toBeNull();
    expect(notification?.delivery_status).toBe("sent");
    expect(notification?.delivery_error).toBeNull();
    expect(notification?.delivered_at).toBeTruthy();
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

async function expectDelivery(
  admin: SupabaseClient,
  input: { recipientEmail: string; startedAt: string; templateKey: string }
) {
  await expect
    .poll(
      async () => {
        const { data, error } = await admin
          .from("email_delivery_attempts")
          .select("status")
          .eq("recipient_email", input.recipientEmail)
          .eq("template_key", input.templateKey)
          .gte("created_at", input.startedAt)
          .order("created_at", { ascending: false })
          .limit(1);

        if (error) throw error;
        return data?.[0]?.status ?? null;
      },
      { message: `${input.templateKey} should have a sent delivery attempt.`, timeout: 20_000 }
    )
    .toBe("sent");
}

async function seedRetryEvidence(
  admin: SupabaseClient,
  input: { marker: string; recipientEmail: string; tenantSlug: string }
) {
  const [{ data: tenant, error: tenantError }, { data: profile, error: profileError }] = await Promise.all([
    admin.from("tenants").select("id").eq("slug", input.tenantSlug).eq("status", "active").single(),
    admin.from("profiles").select("id").eq("email", input.recipientEmail).single()
  ]);

  if (tenantError || !tenant) throw tenantError ?? new Error("Controlled tenant was not found.");
  if (profileError || !profile) throw profileError ?? new Error("Controlled recipient profile was not found.");

  const { data: notification, error: notificationError } = await admin
    .from("tenant_notifications")
    .insert({
      tenant_id: tenant.id,
      recipient_user_id: profile.id,
      type: "system",
      title: input.marker,
      message: "Gecontroleerde stagingmelding voor het bewijzen van herstelbare mailretry.",
      status: "unread",
      delivery_status: "failed",
      delivery_error: "Controlled rehearsal seed; no provider request was made."
    })
    .select("id")
    .single();

  if (notificationError || !notification) throw notificationError ?? new Error("Controlled notification was not created.");

  const evidenceTime = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data: failedAttempt, error: attemptError } = await admin
    .from("email_delivery_attempts")
    .insert({
      tenant_id: tenant.id,
      recipient_user_id: profile.id,
      recipient_email: input.recipientEmail,
      provider: "sendgrid_api",
      provider_source: "platform_settings",
      template_key: "controlled_retry_seed",
      subject: input.marker,
      status: "failed",
      error_message: "Controlled rehearsal seed; no provider request was made.",
      related_type: "tenant_notification",
      related_id: notification.id,
      attempted_at: evidenceTime,
      created_at: evidenceTime,
      metadata: { controlledRehearsal: true }
    })
    .select("id")
    .single();

  if (attemptError || !failedAttempt) throw attemptError ?? new Error("Controlled retry evidence was not created.");

  const { error: updateError } = await admin
    .from("tenant_notifications")
    .update({ email_delivery_attempt_id: failedAttempt.id })
    .eq("id", notification.id);

  if (updateError) throw updateError;

  return { notificationId: notification.id };
}

async function deliveryStates(admin: SupabaseClient, notificationId: string) {
  const { data, error } = await admin
    .from("email_delivery_attempts")
    .select("status")
    .eq("related_type", "tenant_notification")
    .eq("related_id", notificationId)
    .order("attempted_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((attempt) => attempt.status);
}

function adminClient() {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
