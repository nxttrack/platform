import { createClient } from "@supabase/supabase-js";

const [command, ...args] = process.argv.slice(2);

if (process.env.APP_ENV !== "staging") {
  fail("Controlled communications evidence may only run against staging.");
}

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseSecret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseSecret) {
  fail("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.");
}

const admin = createClient(supabaseUrl, supabaseSecret, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

try {
  if (command === "wait-delivery") {
    const [recipientEmail, startedAt, templateKey] = requireArgs(args, 3);
    await waitForDelivery({ recipientEmail, startedAt, templateKey });
    writeResult({ status: "sent" });
  } else if (command === "seed-retry") {
    const [marker, recipientEmail, tenantSlug] = requireArgs(args, 3);
    writeResult(await seedRetryEvidence({ marker, recipientEmail, tenantSlug }));
  } else if (command === "verify-retry") {
    const [notificationId] = requireArgs(args, 1);
    await verifyRetry(notificationId);
    writeResult({ states: ["failed", "sent"], notificationStatus: "sent" });
  } else {
    fail("Expected wait-delivery, seed-retry or verify-retry.");
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

async function waitForDelivery(input) {
  await poll(async () => {
    const { data, error } = await admin
      .from("email_delivery_attempts")
      .select("status")
      .eq("recipient_email", input.recipientEmail)
      .eq("template_key", input.templateKey)
      .gte("created_at", input.startedAt)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return data?.[0]?.status === "sent";
  }, `${input.templateKey} did not create a sent delivery attempt.`);
}

async function seedRetryEvidence(input) {
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

  if (notificationError || !notification) {
    throw notificationError ?? new Error("Controlled notification was not created.");
  }

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

  if (attemptError || !failedAttempt) {
    throw attemptError ?? new Error("Controlled retry evidence was not created.");
  }

  const { error: updateError } = await admin
    .from("tenant_notifications")
    .update({ email_delivery_attempt_id: failedAttempt.id })
    .eq("id", notification.id);

  if (updateError) throw updateError;
  return { notificationId: notification.id };
}

async function verifyRetry(notificationId) {
  await poll(async () => {
    const { data, error } = await admin
      .from("email_delivery_attempts")
      .select("status")
      .eq("related_type", "tenant_notification")
      .eq("related_id", notificationId)
      .order("attempted_at", { ascending: true });

    if (error) throw error;
    return JSON.stringify((data ?? []).map((attempt) => attempt.status)) === JSON.stringify(["failed", "sent"]);
  }, "The retry did not preserve the failed attempt and create a sent attempt.");

  const { data: notification, error: notificationError } = await admin
    .from("tenant_notifications")
    .select("delivery_status, delivery_error, delivered_at")
    .eq("id", notificationId)
    .single();

  if (notificationError) throw notificationError;
  if (
    notification?.delivery_status !== "sent" ||
    notification.delivery_error !== null ||
    !notification.delivered_at
  ) {
    throw new Error("The tenant notification does not record successful retry delivery.");
  }
}

async function poll(check, message) {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(message);
}

function requireArgs(values, count) {
  if (values.length !== count || values.some((value) => !value)) {
    fail(`Expected ${count} non-empty command arguments.`);
  }

  return values;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) fail(`${name} is required.`);
  return value;
}

function writeResult(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
