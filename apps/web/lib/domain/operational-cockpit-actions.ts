"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

const path = "/admin";
const allowedStatuses = ["acknowledged", "snoozed", "resolved"] as const;
const signalTypes = [
  "crm_follow_up",
  "session_without_instructor",
  "empty_seat",
  "missing_attendance",
  "expiring_offer",
  "failed_payment",
  "parent_question",
  "expiring_media",
  "automation_failure",
  "configuration_drift",
  "retention_risk"
] as const;
const entityTypes = [
  "intake",
  "session",
  "recovery_snapshot",
  "slot_offer",
  "payment_attempt",
  "message_thread",
  "participant_media",
  "automation_run",
  "tenant",
  "participant"
] as const;

export async function updateOperationalSignalStateAction(formData: FormData) {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role))) redirect("/admin?error=forbidden");

  const signalKey = readText(formData, "signalKey", 180);
  const signalType = readEnum(formData, "signalType", signalTypes);
  const entityType = readEnum(formData, "entityType", entityTypes);
  const entityId = readOptionalUuid(formData, "entityId");
  const fingerprint = readHash(formData, "fingerprint");
  const status = readEnum(formData, "status", allowedStatuses);
  const note = readOptionalText(formData, "note", 1000);
  const snooze = status === "snoozed" ? readEnum(formData, "snooze", ["four_hours", "tomorrow", "one_week"] as const) : null;
  const now = new Date();
  const snoozedUntil = snooze === "four_hours"
    ? new Date(now.getTime() + 4 * 3_600_000).toISOString()
    : snooze === "tomorrow"
      ? tomorrowAtNine(now).toISOString()
      : snooze === "one_week"
        ? new Date(now.getTime() + 7 * 86_400_000).toISOString()
        : null;
  const admin = createAdminClient();
  const existing = await admin.from("operational_signal_states").select("id, source_fingerprint, status").eq("tenant_id", tenant.id).eq("signal_key", signalKey).maybeSingle();
  if (existing.error) redirect(`${path}?error=signal_state`);

  const payload = {
    tenant_id: tenant.id,
    signal_key: signalKey,
    signal_type: signalType,
    source_entity_type: entityType,
    source_entity_id: entityId,
    source_fingerprint: fingerprint,
    status,
    reviewed_by_user_id: context.user.id,
    reviewed_at: now.toISOString(),
    snoozed_until: snoozedUntil,
    review_note: note
  };
  const write = await admin.from("operational_signal_states").upsert(payload, { onConflict: "tenant_id,signal_key" }).select("id").single();
  if (write.error) redirect(`${path}?error=signal_state`);
  const eventType = status === "acknowledged" ? "acknowledged" : status;
  await admin.from("operational_signal_events").insert({
    tenant_id: tenant.id,
    signal_state_id: write.data.id,
    event_type: eventType,
    actor_user_id: context.user.id,
    note
  });
  revalidatePath(path);
  redirect(`${path}?saved=${status}`);
}

function tomorrowAtNine(now: Date) {
  const value = new Date(now);
  value.setDate(value.getDate() + 1);
  value.setHours(9, 0, 0, 0);
  return value;
}

function readText(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(`${name} is invalid.`);
  return value.trim();
}

function readOptionalText(formData: FormData, name: string, max: number) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.length > max) throw new Error(`${name} is invalid.`);
  return value.trim();
}

function readHash(formData: FormData, name: string) {
  const value = readText(formData, name, 64);
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readOptionalUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !value) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function readEnum<const T extends readonly string[]>(formData: FormData, name: string, allowed: T): T[number] {
  const value = formData.get(name);
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${name} is invalid.`);
  return value as T[number];
}
