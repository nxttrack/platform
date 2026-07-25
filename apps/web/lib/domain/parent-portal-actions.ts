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

  if (!access.mutableParticipantIds.includes(participantId)) {
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

export async function requestCatchUpSessionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/lessen");
  const context = await requirePrivateShellContext("/portaal/lessen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const creditId = readRequired(formData, "creditId");
  const sessionId = readRequired(formData, "sessionId");
  const access = await loadParentParticipantAccess(tenant.id, context.user.id);
  const [creditResult, sessionResult, settingsResult] = await Promise.all([
    admin
      .from("catch_up_credits")
      .select("id, participant_id, enrollment_id, status, expires_on")
      .eq("tenant_id", tenant.id)
      .eq("id", creditId)
      .maybeSingle(),
    admin
      .from("sessions")
      .select("id, group_id, starts_at, status, capacity_override")
      .eq("tenant_id", tenant.id)
      .eq("id", sessionId)
      .maybeSingle(),
    admin.from("tenant_settings").select("catch_up_requires_admin_approval").eq("tenant_id", tenant.id).maybeSingle()
  ]);

  if (creditResult.error || sessionResult.error || settingsResult.error || !creditResult.data || !sessionResult.data) {
    redirectWithStatus(nextPath, "error", "catchup");
  }

  const credit = creditResult.data as { enrollment_id: string; expires_on: string | null; id: string; participant_id: string; status: string };
  const session = sessionResult.data as { capacity_override: number | null; group_id: string; id: string; starts_at: string; status: string };

  if (!access.mutableParticipantIds.includes(credit.participant_id) || credit.status !== "available") {
    redirectWithStatus(nextPath, "error", "access");
  }

  if (credit.expires_on && new Date(`${credit.expires_on}T23:59:59`).getTime() < Date.now()) {
    redirectWithStatus(nextPath, "error", "expired");
  }

  if (session.status !== "scheduled" || new Date(session.starts_at).getTime() <= Date.now()) {
    redirectWithStatus(nextPath, "error", "lesson");
  }

  const [enrollmentResult, groupResult] = await Promise.all([
    admin.from("enrollments").select("id, participant_id, program_id, current_stage_id, status").eq("tenant_id", tenant.id).eq("id", credit.enrollment_id).maybeSingle(),
    admin.from("groups").select("id, program_id, stage_id, capacity").eq("tenant_id", tenant.id).eq("id", session.group_id).maybeSingle()
  ]);

  if (enrollmentResult.error || groupResult.error || !enrollmentResult.data || !groupResult.data) {
    redirectWithStatus(nextPath, "error", "catchup");
  }

  const enrollment = enrollmentResult.data as { current_stage_id: string | null; id: string; participant_id: string; program_id: string; status: string };
  const group = groupResult.data as { capacity: number; id: string; program_id: string; stage_id: string | null };

  if (enrollment.status !== "active" || enrollment.participant_id !== credit.participant_id || group.program_id !== enrollment.program_id || (enrollment.current_stage_id && group.stage_id && group.stage_id !== enrollment.current_stage_id)) {
    redirectWithStatus(nextPath, "error", "match");
  }

  const capacityOk = await sessionHasCatchUpCapacity({ tenantId: tenant.id, sessionId: session.id });

  if (!capacityOk) {
    redirectWithStatus(nextPath, "error", "capacity");
  }

  const requiresApproval = ((settingsResult.data as { catch_up_requires_admin_approval?: boolean } | null)?.catch_up_requires_admin_approval ?? true) === true;
  const status = requiresApproval ? "requested" : "approved";
  const requestResult = await admin
    .from("catch_up_requests")
    .insert({
      tenant_id: tenant.id,
      credit_id: credit.id,
      participant_id: credit.participant_id,
      enrollment_id: credit.enrollment_id,
      requested_by_user_id: context.user.id,
      preferred_session_id: session.id,
      assigned_session_id: requiresApproval ? null : session.id,
      status,
      decided_at: requiresApproval ? null : new Date().toISOString(),
      decided_by_user_id: requiresApproval ? null : context.user.id
    })
    .select("id")
    .single();

  if (requestResult.error || !requestResult.data) {
    redirectWithStatus(nextPath, "error", "catchup");
  }

  const { error: creditError } = await admin
    .from("catch_up_credits")
    .update({
      status: "reserved",
      used_session_id: session.id
    })
    .eq("tenant_id", tenant.id)
    .eq("id", credit.id);

  if (creditError) {
    redirectWithStatus(nextPath, "error", "credit");
  }

  revalidatePath("/portaal");
  revalidatePath("/portaal/lessen");
  revalidatePath(nextPath);
  redirectWithStatus(nextPath, "saved", requiresApproval ? "catchup-requested" : "catchup-approved");
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

  if (!access.mutableParticipantIds.includes(eventParticipantResult.data.participant_id)) {
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

async function sessionHasCatchUpCapacity(input: { sessionId: string; tenantId: string }) {
  const admin = createAdminClient();
  const sessionResult = await admin
    .from("sessions")
    .select("id, group_id, capacity_override, status")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionResult.error || !sessionResult.data || sessionResult.data.status !== "scheduled") {
    return false;
  }

  const [groupResult, membershipsResult, requestsResult] = await Promise.all([
    admin.from("groups").select("capacity").eq("tenant_id", input.tenantId).eq("id", sessionResult.data.group_id).maybeSingle(),
    admin.from("group_memberships").select("capacity_weight, status").eq("tenant_id", input.tenantId).eq("group_id", sessionResult.data.group_id),
    admin
      .from("catch_up_requests")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .or(`preferred_session_id.eq.${input.sessionId},assigned_session_id.eq.${input.sessionId}`)
      .in("status", ["requested", "approved"])
  ]);

  if (groupResult.error || !groupResult.data || membershipsResult.error || requestsResult.error) {
    return false;
  }

  const capacity = Number(sessionResult.data.capacity_override ?? groupResult.data.capacity ?? 0);
  const used = ((membershipsResult.data ?? []) as { capacity_weight: number; status: string }[])
    .filter((membership) => membership.status === "active" || membership.status === "trial")
    .reduce((total, membership) => total + Number(membership.capacity_weight), 0);
  const holds = ((requestsResult.data ?? []) as { id: string }[]).length;

  return used + holds + 1 <= capacity;
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
