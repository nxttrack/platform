import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export type TemporaryOfferingRow = {
  id: string;
  group_id: string;
  title: string;
  description: string | null;
  booking_opens_at: string | null;
  booking_closes_at: string | null;
  pricing_model: "free" | "per_lesson" | "package";
  price_cents: number;
  currency: string;
  vat_rate_basis_points: number;
  payment_mode: "free" | "manual" | "direct_mollie" | "periodic_debit";
  payment_plan_id: string | null;
  provider_config_id: string | null;
  seat_hold_minutes: number;
  terms_version: string;
  cancellation_policy: string;
  status: string;
  published_at: string | null;
};

export type OfferingRegistrationRow = {
  id: string;
  offering_id: string;
  enrollment_id: string;
  participant_id: string;
  capacity_bucket: string;
  status: string;
  hold_expires_at: string | null;
  reserved_amount_cents: number;
  currency: string;
  manual_payment_id: string | null;
  payment_session_id: string | null;
};

const offeringSelect = "id, group_id, title, description, booking_opens_at, booking_closes_at, pricing_model, price_cents, currency, vat_rate_basis_points, payment_mode, payment_plan_id, provider_config_id, seat_hold_minutes, terms_version, cancellation_policy, status, published_at";

export async function getTemporaryOfferingAdminData() {
  const context = await requirePrivateShellContext("/admin/seizoenen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [offerings, groups, plans, providers, registrations, sessions] = await Promise.all([
    admin.from("group_offerings").select(offeringSelect).eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    admin
      .from("groups")
      .select("id, name, offering_type, status, regular_capacity, flex_capacity, trial_capacity, hard_capacity")
      .eq("tenant_id", tenant.id)
      .neq("offering_type", "regular")
      .order("name"),
    admin
      .from("payment_plans")
      .select("id, name, amount_cents, currency, billing_interval, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "active")
      .order("name"),
    admin
      .from("billing_provider_configs")
      .select("id, display_name, provider, mode, status, public_config")
      .eq("tenant_id", tenant.id)
      .eq("provider", "mollie")
      .eq("status", "active"),
    admin
      .from("offering_registrations")
      .select("id, offering_id, enrollment_id, participant_id, capacity_bucket, status, hold_expires_at, reserved_amount_cents, currency, manual_payment_id, payment_session_id")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("sessions")
      .select("id, group_id, starts_at, ends_at, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "scheduled")
      .order("starts_at")
  ]);

  for (const [label, error] of [
    ["offerings", offerings.error],
    ["offering groups", groups.error],
    ["payment plans", plans.error],
    ["billing providers", providers.error],
    ["offering registrations", registrations.error],
    ["offering occurrences", sessions.error]
  ] as const) {
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
  }
  const evaluationEntries = await Promise.all(
    ((offerings.data ?? []) as TemporaryOfferingRow[]).map(async (offering) => {
      const result = await admin.rpc("evaluate_group_offering", {
        target_offering_id: offering.id,
        target_tenant_id: tenant.id
      });
      if (result.error) throw new Error(`Could not evaluate offering: ${result.error.message}`);
      return [offering.id, asRecord(result.data)] as const;
    })
  );

  return {
    evaluations: Object.fromEntries(evaluationEntries) as Record<string, Record<string, unknown>>,
    groups: groups.data ?? [],
    offerings: (offerings.data ?? []) as TemporaryOfferingRow[],
    paymentPlans: plans.data ?? [],
    providers: providers.data ?? [],
    registrations: (registrations.data ?? []) as OfferingRegistrationRow[],
    sessions: sessions.data ?? [],
    tenant
  };
}

export async function loadParentTemporaryOfferings(input: {
  enrollmentIds: string[];
  participantIds: string[];
  tenantId: string;
}) {
  if (input.enrollmentIds.length === 0 || input.participantIds.length === 0) {
    return { groups: [], offerings: [], registrations: [], sessions: [] };
  }
  const admin = createAdminClient();
  const offeringsResult = await admin
    .from("group_offerings")
    .select(offeringSelect)
    .eq("tenant_id", input.tenantId)
    .eq("status", "published")
    .or(`booking_closes_at.is.null,booking_closes_at.gt.${new Date().toISOString()}`)
    .order("published_at", { ascending: false });
  if (offeringsResult.error) throw new Error(`Could not load parent offerings: ${offeringsResult.error.message}`);

  const offerings = (offeringsResult.data ?? []) as TemporaryOfferingRow[];
  const groupIds = [...new Set(offerings.map((offering) => offering.group_id))];
  if (groupIds.length === 0) return { groups: [], offerings, registrations: [], sessions: [] };

  const [groups, registrations, sessions] = await Promise.all([
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, offering_type, regular_capacity, flex_capacity, trial_capacity, hard_capacity")
      .eq("tenant_id", input.tenantId)
      .in("id", groupIds),
    admin
      .from("offering_registrations")
      .select("id, offering_id, enrollment_id, participant_id, capacity_bucket, status, hold_expires_at, reserved_amount_cents, currency, manual_payment_id, payment_session_id")
      .eq("tenant_id", input.tenantId)
      .in("participant_id", input.participantIds)
      .in("enrollment_id", input.enrollmentIds),
    admin
      .from("sessions")
      .select("id, group_id, resource_id, starts_at, ends_at, status")
      .eq("tenant_id", input.tenantId)
      .in("group_id", groupIds)
      .eq("status", "scheduled")
      .order("starts_at")
  ]);
  for (const [label, error] of [
    ["parent offering groups", groups.error],
    ["parent registrations", registrations.error],
    ["parent offering occurrences", sessions.error]
  ] as const) {
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
  }

  return {
    groups: groups.data ?? [],
    offerings,
    registrations: (registrations.data ?? []) as OfferingRegistrationRow[],
    sessions: sessions.data ?? []
  };
}

export function calculateOfferingDisplayPrice(
  offering: TemporaryOfferingRow,
  occurrenceCount: number
) {
  return offering.pricing_model === "per_lesson"
    ? offering.price_cents * occurrenceCount
    : offering.price_cents;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
