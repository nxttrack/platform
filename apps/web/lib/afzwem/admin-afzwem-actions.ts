"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

export async function createAfzwemEventAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("milestone_events").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      stage_id: optionalString(formData, "stage_id"),
      resource_id: optionalString(formData, "resource_id"),
      event_type: "afzwem",
      title: requiredString(formData, "title"),
      description: optionalString(formData, "description"),
      starts_at: requiredDateTime(formData, "starts_at"),
      ends_at: requiredDateTime(formData, "ends_at"),
      capacity: intValue(formData, "capacity", 1, 1),
      status: enumValue(formData, "status", ["draft", "scheduled", "completed", "cancelled"], "scheduled")
    })
  );

  revalidateAfzwem();
}

export async function inviteAfzwemParticipantAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const enrollmentId = requiredString(formData, "enrollment_id");
  const enrollmentResult = await supabase.from("enrollments").select("participant_id").eq("tenant_id", tenantId).eq("id", enrollmentId).single();

  if (enrollmentResult.error || !enrollmentResult.data) {
    throw new Error(enrollmentResult.error?.message ?? "Enrollment niet gevonden.");
  }

  await throwOnError(
    supabase.from("milestone_event_participants").upsert(
      {
        tenant_id: tenantId,
        milestone_event_id: requiredString(formData, "milestone_event_id"),
        enrollment_id: enrollmentId,
        participant_id: enrollmentResult.data.participant_id,
        readiness_criteria_id: optionalString(formData, "readiness_criteria_id"),
        invited_by_profile_id: profileId,
        status: enumValue(formData, "status", ["invited", "confirmed", "declined", "attended", "no_show", "cancelled"], "invited"),
        note: optionalString(formData, "note"),
        invited_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,milestone_event_id,enrollment_id" }
    )
  );

  revalidateAfzwem();
}

export async function registerAfzwemResultAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const eventParticipantId = requiredString(formData, "milestone_event_participant_id");
  const participantResult = await supabase
    .from("milestone_event_participants")
    .select("milestone_event_id, enrollment_id, participant_id")
    .eq("tenant_id", tenantId)
    .eq("id", eventParticipantId)
    .single();

  if (participantResult.error || !participantResult.data) {
    throw new Error(participantResult.error?.message ?? "Afzwemdeelnemer niet gevonden.");
  }

  const eventResult = await supabase.from("milestone_events").select("program_id").eq("tenant_id", tenantId).eq("id", participantResult.data.milestone_event_id).single();

  if (eventResult.error || !eventResult.data) {
    throw new Error(eventResult.error?.message ?? "Afzwemmoment niet gevonden.");
  }

  const resultStatus = enumValue(formData, "result_status", ["pending", "passed", "failed", "absent", "needs_retry"], "pending");

  await throwOnError(
    supabase.from("milestone_results").upsert(
      {
        tenant_id: tenantId,
        milestone_event_participant_id: eventParticipantId,
        milestone_event_id: participantResult.data.milestone_event_id,
        enrollment_id: participantResult.data.enrollment_id,
        participant_id: participantResult.data.participant_id,
        program_id: eventResult.data.program_id,
        result_status: resultStatus,
        score: optionalScore(formData, "score"),
        note: optionalString(formData, "note"),
        registered_by_profile_id: profileId,
        registered_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,milestone_event_participant_id" }
    )
  );

  await throwOnError(
    supabase
      .from("milestone_event_participants")
      .update({
        status: resultStatus === "absent" ? "no_show" : resultStatus === "pending" ? "confirmed" : "attended"
      })
      .eq("tenant_id", tenantId)
      .eq("id", eventParticipantId)
  );

  revalidateAfzwem();
}

export async function updateCertificateVaultAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("certificates")
      .update({
        file_path: optionalString(formData, "file_path"),
        download_status: enumValue(formData, "download_status", ["pending", "ready", "blocked"], "pending"),
        share_enabled: formData.get("share_enabled") === "on",
        share_expires_at: optionalDateTime(formData, "share_expires_at"),
        vault_status: enumValue(formData, "vault_status", ["draft", "available", "archived"], "draft")
      })
      .eq("tenant_id", tenantId)
      .eq("id", requiredString(formData, "certificate_id"))
  );

  revalidateAfzwem();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om afzwemdata te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

function revalidateAfzwem() {
  for (const path of ["/admin", "/admin/afzwemmen", "/parent", "/parent/diplomas", "/parent/documenten", "/parent/notificaties"]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function intValue(formData: FormData, key: string, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function optionalScore(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Score moet tussen 0 en 100 liggen.");
  }

  return parsed;
}

function requiredDateTime(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}

function optionalDateTime(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}
