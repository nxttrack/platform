"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { createMolliePayment } from "./mollie";
import { getSafeMollieCheckoutUrl, resolveMollieApplicationUrl, type MollieMode } from "./mollie-contract";

const adminPath = "/admin/seizoenen";
const parentPath = "/portaal/planning";

export async function createTemporaryOfferingAction(formData: FormData) {
  const { context, tenant } = await requireOfferingAdmin();
  const admin = createAdminClient();
  const groupId = readUuid(formData, "groupId");
  const pricingModel = readEnum(formData, "pricingModel", ["free", "per_lesson", "package"] as const);
  const paymentMode = pricingModel === "free"
    ? "free"
    : readEnum(formData, "paymentMode", ["manual", "direct_mollie", "periodic_debit"] as const);
  const paymentPlanId = pricingModel === "free" ? null : readUuid(formData, "paymentPlanId");
  const providerConfigId = paymentMode === "direct_mollie" || paymentMode === "periodic_debit"
    ? readUuid(formData, "providerConfigId")
    : null;
  const bookingOpensAt = await resolveOptionalLocalDateTime(admin, tenant.id, readOptional(formData, "bookingOpensAt"));
  const bookingClosesAt = await resolveOptionalLocalDateTime(admin, tenant.id, readOptional(formData, "bookingClosesAt"));
  if (bookingOpensAt && bookingClosesAt && bookingOpensAt >= bookingClosesAt) {
    redirect(`${adminPath}?error=offering-window`);
  }

  const group = await admin
    .from("groups")
    .select("id, offering_type")
    .eq("tenant_id", tenant.id)
    .eq("id", groupId)
    .maybeSingle();
  if (group.error || !group.data || group.data.offering_type === "regular") {
    redirect(`${adminPath}?error=offering-group`);
  }

  const result = await admin.from("group_offerings").insert({
    booking_closes_at: bookingClosesAt,
    booking_opens_at: bookingOpensAt,
    cancellation_policy: readEnum(formData, "cancellationPolicy", ["non_refundable", "manual_review", "refund_until_start"] as const),
    created_by_user_id: context.user.id,
    currency: "EUR",
    description: readOptional(formData, "description"),
    group_id: groupId,
    payment_mode: paymentMode,
    payment_plan_id: paymentPlanId,
    price_cents: pricingModel === "free" ? 0 : readMoneyCents(formData, "price"),
    pricing_model: pricingModel,
    provider_config_id: providerConfigId,
    seat_hold_minutes: readInteger(formData, "seatHoldMinutes", 15, 2880, 1440),
    tenant_id: tenant.id,
    terms_version: readTermsVersion(formData),
    title: readText(formData, "title", 3, 160),
    vat_rate_basis_points: readInteger(formData, "vatRateBasisPoints", 0, 2100, 2100)
  });
  if (result.error) {
    console.error("[offerings] draft create failed", { code: result.error.code, tenantId: tenant.id });
    redirect(`${adminPath}?error=offering-create`);
  }
  revalidatePath(adminPath);
  redirect(`${adminPath}?saved=offering`);
}

export async function publishTemporaryOfferingAction(formData: FormData) {
  const { context, tenant } = await requireOfferingAdmin();
  if (formData.get("humanConfirmation") !== "publish") redirect(`${adminPath}?error=confirmation`);
  const result = await createAdminClient().rpc("publish_group_offering", {
    actor_user_id: context.user.id,
    target_idempotency_key: readUuid(formData, "idempotencyKey"),
    target_offering_id: readUuid(formData, "offeringId"),
    target_tenant_id: tenant.id
  });
  if (result.error) {
    console.error("[offerings] publication failed", { code: result.error.code, tenantId: tenant.id });
    redirect(`${adminPath}?error=offering-publish`);
  }
  revalidatePath(adminPath);
  revalidatePath(parentPath);
  redirect(`${adminPath}?saved=offering-published`);
}

export async function reserveTemporaryOfferingAction(formData: FormData) {
  const context = await requirePrivateShellContext(parentPath);
  const tenant = getActiveTenant(context);
  const idempotencyKey = readUuid(formData, "idempotencyKey");
  const admin = createAdminClient();
  const reserveResult = await admin.rpc("reserve_group_offering_seat", {
    actor_user_id: context.user.id,
    target_capacity_bucket: readEnum(formData, "capacityBucket", ["regular", "flex", "trial"] as const),
    target_enrollment_id: readUuid(formData, "enrollmentId"),
    target_idempotency_key: idempotencyKey,
    target_offering_id: readUuid(formData, "offeringId"),
    target_tenant_id: tenant.id,
    target_terms_accepted: formData.get("termsAccepted") === "accepted"
  });
  if (reserveResult.error) {
    console.error("[offerings] seat reservation failed", { code: reserveResult.error.code, tenantId: tenant.id });
    const reason = /capacity|bucket is full/i.test(reserveResult.error.message) ? "offering-full" : "offering-reserve";
    redirect(`${parentPath}?error=${reason}#aanbod`);
  }
  const reservation = asRecord(reserveResult.data);
  if (reservation.paymentMode !== "direct_mollie") {
    revalidatePath(parentPath);
    revalidatePath("/portaal/betalingen");
    redirect(reservation.paymentMode === "free"
      ? `${parentPath}?saved=offering-confirmed#aanbod`
      : `/portaal/betalingen?saved=offering-held`);
  }

  const sessionId = readRecordUuid(reservation, "paymentSessionId");
  const [sessionResult, offeringResult] = await Promise.all([
    admin
      .from("payment_sessions")
      .select("id, provider_config_id, manual_payment_id, amount_cents, currency, status, expires_at")
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId)
      .maybeSingle(),
    admin
      .from("group_offerings")
      .select("title")
      .eq("tenant_id", tenant.id)
      .eq("id", readUuid(formData, "offeringId"))
      .maybeSingle()
  ]);
  if (sessionResult.error || !sessionResult.data || offeringResult.error || !offeringResult.data) {
    redirect(`${parentPath}?error=offering-payment#aanbod`);
  }
  const providerResult = await admin
    .from("billing_provider_configs")
    .select("id, provider, mode, status, secret_reference, public_config")
    .eq("tenant_id", tenant.id)
    .eq("id", sessionResult.data.provider_config_id)
    .eq("provider", "mollie")
    .eq("status", "active")
    .maybeSingle();
  const provider = providerResult.data;
  if (providerResult.error || !provider?.secret_reference) {
    redirect(`${parentPath}?error=offering-provider#aanbod`);
  }
  const returnUrl = optionalString(provider.public_config?.return_url);
  if (!returnUrl) redirect(`${parentPath}?error=offering-provider#aanbod`);

  try {
    const appUrl = resolveMollieApplicationUrl(returnUrl, process.env.APP_URL);
    const payment = await createMolliePayment({
      amountCents: sessionResult.data.amount_cents,
      currency: sessionResult.data.currency,
      description: `${tenant.name} · ${offeringResult.data.title}`,
      idempotencyKey,
      metadata: {
        manualPaymentId: sessionResult.data.manual_payment_id,
        offeringRegistrationId: String(reservation.registrationId),
        paymentSessionId: sessionId,
        tenantId: tenant.id
      },
      mode: provider.mode as MollieMode,
      redirectUrl: returnUrl,
      secretReference: provider.secret_reference,
      webhookUrl: `${appUrl}/api/webhooks/mollie`
    });
    const update = await admin
      .from("payment_sessions")
      .update({
        checkout_url: payment._links?.checkout?.href ?? null,
        expires_at: payment.expiresAt ?? sessionResult.data.expires_at,
        provider_session_id: payment.id,
        return_url: returnUrl,
        status: "pending"
      })
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId);
    if (update.error) throw update.error;

    const checkoutUrl = getSafeMollieCheckoutUrl({
      checkoutUrl: payment._links?.checkout?.href ?? null,
      expiresAt: payment.expiresAt ?? sessionResult.data.expires_at,
      provider: "mollie",
      status: "pending"
    });
    if (!checkoutUrl) throw new Error("Mollie returned no safe checkout URL.");
    redirect(checkoutUrl);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    await admin
      .from("payment_sessions")
      .update({
        failure_code: "provider_api",
        failure_message: "Mollie checkout kon niet worden gestart.",
        status: "failed"
      })
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId);
    redirect(`${parentPath}?error=offering-provider#aanbod`);
  }
}

async function requireOfferingAdmin() {
  const context = await requirePrivateShellContext(adminPath);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) {
    redirect(`${adminPath}?error=forbidden`);
  }
  return { context, tenant: getActiveTenant(context) };
}

async function resolveOptionalLocalDateTime(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  value: string | null
) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Invalid local date/time.");
  const result = await admin.rpc("resolve_tenant_local_datetime", {
    target_local_timestamp: `${value}:00`,
    target_tenant_id: tenantId
  });
  if (result.error || typeof result.data !== "string") throw new Error("Could not resolve local date/time.");
  return result.data;
}

function readText(formData: FormData, key: string, min: number, max: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length < min || value.length > max) throw new Error(`${key} invalid`);
  return value;
}

function readOptional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function readUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error(`${key} invalid`);
  }
  return value;
}

function readEnum<T extends string>(formData: FormData, key: string, allowed: readonly T[]) {
  const value = String(formData.get(key) ?? "");
  if (!allowed.includes(value as T)) throw new Error(`${key} invalid`);
  return value as T;
}

function readMoneyCents(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${key} invalid`);
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error(`${key} invalid`);
  return cents;
}

function readInteger(formData: FormData, key: string, min: number, max: number, fallback: number) {
  const value = Number.parseInt(String(formData.get(key) ?? fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} invalid`);
  return value;
}

function readTermsVersion(formData: FormData) {
  const value = String(formData.get("termsVersion") ?? "offering_terms_v1").trim().toLowerCase();
  return /^[a-z0-9_]{3,80}$/.test(value) ? value : "offering_terms_v1";
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function readRecordUuid(record: Record<string, unknown>, key: string) {
  const value = record[key];
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`${key} missing`);
  return value;
}

function isRedirectError(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}
