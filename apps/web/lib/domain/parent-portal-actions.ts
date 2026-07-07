"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { loadParentParticipantAccess, type ParentPortalSettings } from "./parent-portal";

export async function updateParentProfileAction(formData: FormData) {
  const context = await requirePrivateShellContext("/portaal/profiel");
  const admin = createAdminClient();
  const fullName = readOptional(formData, "fullName");
  const phone = readOptional(formData, "phone");
  const { error } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      phone
    })
    .eq("id", context.user.id);

  revalidatePath("/portaal");
  revalidatePath("/portaal/profiel");

  if (error) {
    redirect("/portaal/profiel?error=profile");
  }

  redirect("/portaal/profiel?saved=1");
}

export async function cancelLessonAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/lessen");
  const context = await requirePrivateShellContext("/portaal/lessen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const sessionId = readRequired(formData, "sessionId");
  const participantId = readRequired(formData, "participantId");
  const reason = readOptional(formData, "reason");
  const access = await loadParentParticipantAccess(tenant.id, context.user.id);

  if (!access.participantIds.includes(participantId)) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const [sessionResult, membershipResult, existingCancellationResult, settingsResult] = await Promise.all([
    admin.from("sessions").select("id, group_id, starts_at, ends_at, status").eq("tenant_id", tenant.id).eq("id", sessionId).maybeSingle(),
    admin
      .from("group_memberships")
      .select("id, group_id, enrollment_id, participant_id, status")
      .eq("tenant_id", tenant.id)
      .eq("participant_id", participantId)
      .in("status", ["active", "trial"]),
    admin.from("lesson_cancellations").select("id").eq("tenant_id", tenant.id).eq("session_id", sessionId).eq("participant_id", participantId).maybeSingle(),
    admin
      .from("tenant_settings")
      .select("lesson_cancellation_cutoff_hours, lesson_cancellation_credit_window_days, lesson_cancellation_grants_credit")
      .eq("tenant_id", tenant.id)
      .maybeSingle()
  ]);

  if (sessionResult.error || !sessionResult.data || settingsResult.error || membershipResult.error) {
    redirectWithStatus(nextPath, "error", "lesson");
  }

  if (existingCancellationResult.data) {
    redirectWithStatus(nextPath, "error", "duplicate");
  }

  const session = sessionResult.data as { id: string; group_id: string; starts_at: string; ends_at: string; status: string };
  const membership = ((membershipResult.data ?? []) as { id: string; group_id: string; enrollment_id: string; participant_id: string; status: string }[]).find((item) => item.group_id === session.group_id);

  if (!membership || session.status !== "scheduled" || new Date(session.starts_at).getTime() <= Date.now()) {
    redirectWithStatus(nextPath, "error", "lesson");
  }

  const settings = normalizeActionSettings(settingsResult.data);
  const onTime = isCancellationOnTime(settings, session.starts_at);
  const eligibleForCredit = onTime && settings.lesson_cancellation_grants_credit;
  const cancellationResult = await admin
    .from("lesson_cancellations")
    .insert({
      tenant_id: tenant.id,
      session_id: session.id,
      participant_id: participantId,
      enrollment_id: membership.enrollment_id,
      parent_user_id: context.user.id,
      status: onTime ? "accepted" : "late_cancelled",
      policy_status: onTime ? "on_time" : "late",
      reason,
      eligible_for_credit: eligibleForCredit
    })
    .select("id")
    .single();

  if (cancellationResult.error || !cancellationResult.data) {
    redirectWithStatus(nextPath, "error", "cancel");
  }

  if (eligibleForCredit) {
    const expiresOn = new Date();

    expiresOn.setDate(expiresOn.getDate() + settings.lesson_cancellation_credit_window_days);

    const creditResult = await admin.from("catch_up_credits").insert({
      tenant_id: tenant.id,
      participant_id: participantId,
      enrollment_id: membership.enrollment_id,
      source_cancellation_id: (cancellationResult.data as { id: string }).id,
      status: "available",
      credit_type: "lesson_cancellation",
      expires_on: expiresOn.toISOString().slice(0, 10)
    });

    if (creditResult.error) {
      redirectWithStatus(nextPath, "error", "credit");
    }
  }

  revalidatePath("/portaal");
  revalidatePath("/portaal/lessen");
  revalidatePath(nextPath);
  redirectWithStatus(nextPath, "saved", onTime ? "cancelled" : "late");
}

export async function respondGraduationInviteAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/diplomas");
  const context = await requirePrivateShellContext("/portaal/diplomas");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const eventParticipantId = readRequired(formData, "eventParticipantId");
  const response = readRequired(formData, "response");

  if (response !== "confirmed" && response !== "declined") {
    redirectWithStatus(nextPath, "error", "response");
  }

  const eventParticipantResult = await admin
    .from("graduation_event_participants")
    .select("id, participant_id")
    .eq("tenant_id", tenant.id)
    .eq("id", eventParticipantId)
    .maybeSingle();

  if (eventParticipantResult.error || !eventParticipantResult.data) {
    redirectWithStatus(nextPath, "error", "invite");
  }

  const access = await loadParentParticipantAccess(tenant.id, context.user.id);

  if (!access.participantIds.includes(eventParticipantResult.data.participant_id)) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const { error } = await admin
    .from("graduation_event_participants")
    .update({
      invite_status: response,
      status: response,
      responded_at: new Date().toISOString()
    })
    .eq("tenant_id", tenant.id)
    .eq("id", eventParticipantResult.data.id);

  revalidatePath("/portaal");
  revalidatePath("/portaal/diplomas");
  revalidatePath(nextPath);

  if (error) {
    redirectWithStatus(nextPath, "error", "invite");
  }

  redirectWithStatus(nextPath, "saved", response);
}

function normalizeActionSettings(value: unknown): Pick<ParentPortalSettings, "lesson_cancellation_cutoff_hours" | "lesson_cancellation_credit_window_days" | "lesson_cancellation_grants_credit"> {
  const row = (value ?? {}) as Partial<ParentPortalSettings>;

  return {
    lesson_cancellation_cutoff_hours: Number(row.lesson_cancellation_cutoff_hours ?? 12),
    lesson_cancellation_credit_window_days: Number(row.lesson_cancellation_credit_window_days ?? 60),
    lesson_cancellation_grants_credit: row.lesson_cancellation_grants_credit ?? true
  };
}

function isCancellationOnTime(settings: Pick<ParentPortalSettings, "lesson_cancellation_cutoff_hours">, startsAt: string) {
  return new Date(startsAt).getTime() - Date.now() >= settings.lesson_cancellation_cutoff_hours * 60 * 60 * 1000;
}

function redirectWithStatus(path: `/${string}`, key: "saved" | "error", value: string): never {
  const separator = path.includes("?") ? "&" : "?";

  redirect(`${path}${separator}${key}=${encodeURIComponent(value)}`);
}

function readRequired(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    throw new Error(`${field} is required.`);
  }

  return value;
}

function readOptional(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}
