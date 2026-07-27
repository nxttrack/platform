"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyContent } from "@/lib/security/content-classification";
import { getActiveTenant } from "./core";
import { badgeCatalogTemplate, getPositiveScoreLabel, swimProgressTemplate } from "./progress-template";
import { createTenantNotifications } from "./tenant-notifications";
import { evaluateBadgeTriggers } from "./badge-engine";

const attendanceStatuses = new Set(["present", "absent", "late", "excused", "trial"]);
const noteVisibilities = new Set(["internal", "parent_visible"]);

export async function installSwimProgressTemplateAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const canManageTenant = isTenantOperator(context.activeTenant?.roles ?? []);

  if (!canManageTenant && !context.activeTenant?.roles.includes("instructor")) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const admin = createAdminClient();

  for (const moduleTemplate of swimProgressTemplate) {
    const moduleResult = await admin
      .from("progress_modules")
      .upsert(
        {
          tenant_id: tenant.id,
          code: moduleTemplate.code,
          name: moduleTemplate.name,
          description: moduleTemplate.description,
          template_key: "nxttrack-swim-mvp",
          status: "active",
          sort_order: moduleTemplate.sortOrder
        },
        { onConflict: "tenant_id,code" }
      )
      .select("id")
      .single();

    if (moduleResult.error || !moduleResult.data) {
      redirectWithStatus(nextPath, "error", "template");
    }

    for (const [index, itemTemplate] of moduleTemplate.items.entries()) {
      const { error } = await admin.from("progress_items").upsert(
        {
          tenant_id: tenant.id,
          module_id: moduleResult.data.id,
          code: itemTemplate.code,
          name: itemTemplate.name,
          positive_goal: itemTemplate.positiveGoal,
          status: "active",
          sort_order: moduleTemplate.sortOrder + index + 1
        },
        { onConflict: "tenant_id,module_id,code" }
      );

      if (error) {
        redirectWithStatus(nextPath, "error", "template");
      }
    }
  }

  for (const badgeTemplate of badgeCatalogTemplate) {
    const { error } = await admin.from("badge_definitions").upsert(
      {
        tenant_id: tenant.id,
        code: badgeTemplate.code,
        name: badgeTemplate.name,
        description: badgeTemplate.description,
        icon_name: badgeTemplate.iconName,
        status: "active",
        sort_order: badgeTemplate.sortOrder
      },
      { onConflict: "tenant_id,code" }
    );

    if (error) {
      redirectWithStatus(nextPath, "error", "template");
    }
  }

  revalidateInstructorPaths(nextPath);
  redirectWithStatus(nextPath, "saved", "template");
}

export async function markAttendanceAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const sessionId = readRequired(formData, "sessionId");
  const participantId = readRequired(formData, "participantId");
  const status = readEnum(formData, "status", attendanceStatuses, "present");
  const note = readOptional(formData, "note");
  const membership = await getSessionMembership({
    tenantId: tenant.id,
    userId: context.user.id,
    canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
    sessionId,
    participantId
  });

  if (!membership) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const { error } = await admin.from("session_attendance").upsert(
    {
      tenant_id: tenant.id,
      session_id: sessionId,
      participant_id: participantId,
      enrollment_id: membership.enrollment_id,
      status,
      note,
      marked_by_user_id: context.user.id,
      marked_at: new Date().toISOString()
    },
    { onConflict: "tenant_id,session_id,participant_id" }
  );

  revalidateInstructorPaths(nextPath);

  if (error) {
    redirectWithStatus(nextPath, "error", "attendance");
  }

  if (status === "present") {
    await evaluateAttendanceBadges({ tenantId: tenant.id, participantId, sessionId });
  }

  redirectWithStatus(nextPath, "saved", "attendance");
}

export async function markRosterPresentAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const sessionId = readRequired(formData, "sessionId");
  const access = await canAccessSession({
    tenantId: tenant.id,
    userId: context.user.id,
    canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
    sessionId
  });

  if (!access.allowed || !access.session) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const admin = createAdminClient();
  const membershipsResult = await admin
    .from("group_memberships")
    .select("participant_id, enrollment_id")
    .eq("tenant_id", tenant.id)
    .eq("group_id", access.session.group_id)
    .in("status", ["active", "trial"]);
  const catchUpResult = await admin
    .from("catch_up_requests")
    .select("participant_id, enrollment_id")
    .eq("tenant_id", tenant.id)
    .eq("assigned_session_id", sessionId)
    .eq("status", "approved");

  if (membershipsResult.error || catchUpResult.error) {
    redirectWithStatus(nextPath, "error", "attendance");
  }

  const regularMemberships = (membershipsResult.data ?? []) as Array<{ enrollment_id: string; participant_id: string }>;
  const memberships = [
    ...regularMemberships,
    ...((catchUpResult.data ?? []) as Array<{ enrollment_id: string; participant_id: string }>).filter(
      (row) => !regularMemberships.some((membership) => membership.participant_id === row.participant_id)
    )
  ];
  if (memberships.length) {
    const markedAt = new Date().toISOString();
    const { error } = await admin.from("session_attendance").upsert(
      memberships.map((membership) => ({
        tenant_id: tenant.id,
        session_id: sessionId,
        participant_id: membership.participant_id,
        enrollment_id: membership.enrollment_id,
        status: "present",
        marked_by_user_id: context.user.id,
        marked_at: markedAt
      })),
      { onConflict: "tenant_id,session_id,participant_id" }
    );

    if (error) redirectWithStatus(nextPath, "error", "attendance");

    await Promise.all(
      memberships.map((membership) =>
        evaluateAttendanceBadges({
          tenantId: tenant.id,
          participantId: membership.participant_id,
          sessionId
        })
      )
    );
  }

  revalidateInstructorPaths(nextPath);
  redirectWithStatus(nextPath, "saved", "roster");
}

export async function completeSessionAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const sessionId = readRequired(formData, "sessionId");
  const access = await canAccessSession({
    tenantId: tenant.id,
    userId: context.user.id,
    canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
    sessionId
  });

  if (!access.allowed) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("sessions").update({ status: "completed" }).eq("tenant_id", tenant.id).eq("id", sessionId);

  revalidateInstructorPaths(nextPath);

  if (error) {
    redirectWithStatus(nextPath, "error", "session");
  }

  redirectWithStatus(nextPath, "saved", "completed");
}

export async function saveProgressNoteAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const sessionId = readOptional(formData, "sessionId");
  const visibility = readEnum(formData, "visibility", noteVisibilities, "internal");
  const note = readRequired(formData, "note");
  const membership = sessionId
    ? await getSessionMembership({
        tenantId: tenant.id,
        userId: context.user.id,
        canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
        sessionId,
        participantId
      })
    : await getInstructorMembershipForParticipant({
        tenantId: tenant.id,
        userId: context.user.id,
        canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
        participantId
      });

  if (!membership) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const admin = createAdminClient();
  const classification = classifyContent(note, "personal");
  const { error } = await admin.from("progress_notes").insert({
    tenant_id: tenant.id,
    participant_id: participantId,
    enrollment_id: membership.enrollment_id,
    session_id: sessionId,
    instructor_user_id: context.user.id,
    visibility,
    note,
    content_classification: classification.classification,
    classification_reasons: classification.reasons,
    status: "active"
  });

  revalidateInstructorPaths(nextPath);

  if (error) {
    redirectWithStatus(nextPath, "error", "note");
  }

  redirectWithStatus(nextPath, "saved", "note");
}

export async function scoreProgressItemAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const moduleId = readRequired(formData, "moduleId");
  const itemId = readRequired(formData, "itemId");
  const sessionId = readOptional(formData, "sessionId");
  const score = readScore(formData, "score");
  const note = readOptional(formData, "note");
  const visibility = readEnum(formData, "visibility", noteVisibilities, "parent_visible");
  const membership = sessionId
    ? await getSessionMembership({
        tenantId: tenant.id,
        userId: context.user.id,
        canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
        sessionId,
        participantId
      })
    : await getInstructorMembershipForParticipant({
        tenantId: tenant.id,
        userId: context.user.id,
        canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
        participantId
      });

  if (!membership) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const admin = createAdminClient();
  const itemResult = await admin.from("progress_items").select("id, module_id, name, code").eq("tenant_id", tenant.id).eq("module_id", moduleId).eq("id", itemId).eq("status", "active").maybeSingle();

  if (itemResult.error || !itemResult.data) {
    redirectWithStatus(nextPath, "error", "progress");
  }

  const positiveLabel = getPositiveScoreLabel(score);
  const scoreResult = await admin
    .from("participant_progress_scores")
    .upsert(
      {
        tenant_id: tenant.id,
        participant_id: participantId,
        enrollment_id: membership.enrollment_id,
        module_id: moduleId,
        item_id: itemId,
        session_id: sessionId,
        score,
        positive_label: positiveLabel,
        note,
        visibility,
        status: "active",
        scored_by_user_id: context.user.id,
        scored_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,participant_id,item_id" }
    )
    .select("id")
    .single();

  revalidateInstructorPaths(nextPath);

  if (scoreResult.error || !scoreResult.data) {
    redirectWithStatus(nextPath, "error", "progress");
  }

  if (visibility === "parent_visible") {
    await createParentNotificationsForParticipant({
      tenantId: tenant.id,
      organizationName: tenant.name,
      participantId,
      type: "progress_score",
      title: "Nieuwe voortgang",
      message: `${itemResult.data.name}: ${positiveLabel}`,
      relatedProgressScoreId: scoreResult.data.id
    });
  }

  if (score >= 4) {
    const completedCountResult = await admin
      .from("participant_progress_scores")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("participant_id", participantId)
      .eq("status", "active")
      .gte("score", 4);
    const triggerContext = {
      count: completedCountResult.count ?? 1,
      entityId: scoreResult.data.id,
      skill: itemResult.data.code?.replace(/_completed$/, "") ?? itemResult.data.id
    };
    await Promise.all([
      evaluateBadgeTriggers({ tenantId: tenant.id, participantId, eventType: "progress_item_completed", eventContext: triggerContext }),
      evaluateBadgeTriggers({ tenantId: tenant.id, participantId, eventType: "skill_completed", eventContext: triggerContext })
    ]);
  }

  redirectWithStatus(nextPath, "saved", "progress");
}

export async function awardBadgeAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/instructor");
  const context = await requirePrivateShellContext("/instructor");
  const tenant = getActiveTenant(context);
  const participantId = readRequired(formData, "participantId");
  const sessionId = readOptional(formData, "sessionId");
  const badgeDefinitionId = readOptional(formData, "badgeDefinitionId");
  const customTitle = readOptional(formData, "title");
  const note = readOptional(formData, "note");
  const visibility = readEnum(formData, "visibility", noteVisibilities, "parent_visible");
  const membership = sessionId
    ? await getSessionMembership({
        tenantId: tenant.id,
        userId: context.user.id,
        canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
        sessionId,
        participantId
      })
    : await getInstructorMembershipForParticipant({
        tenantId: tenant.id,
        userId: context.user.id,
        canManageTenant: isTenantOperator(context.activeTenant?.roles ?? []),
        participantId
      });

  if (!membership) {
    redirectWithStatus(nextPath, "error", "access");
  }

  const admin = createAdminClient();
  const badgeDefinitionResult = badgeDefinitionId
    ? await admin.from("badge_definitions").select("id, name").eq("tenant_id", tenant.id).eq("id", badgeDefinitionId).eq("status", "active").maybeSingle()
    : { data: null, error: null };
  const title = customTitle ?? badgeDefinitionResult.data?.name ?? null;

  if (badgeDefinitionResult.error || (badgeDefinitionId && !badgeDefinitionResult.data) || !title) {
    redirectWithStatus(nextPath, "error", "badge");
  }

  const badgeResult = await admin
    .from("participant_badge_awards")
    .insert({
      tenant_id: tenant.id,
      participant_id: participantId,
      enrollment_id: membership.enrollment_id,
      badge_definition_id: badgeDefinitionResult.data?.id ?? null,
      awarded_by_user_id: context.user.id,
      source_session_id: sessionId,
      title,
      note,
      visibility,
      status: "awarded"
    })
    .select("id")
    .single();

  revalidateInstructorPaths(nextPath);

  if (badgeResult.error || !badgeResult.data) {
    redirectWithStatus(nextPath, "error", "badge");
  }

  if (visibility === "parent_visible") {
    await createParentNotificationsForParticipant({
      tenantId: tenant.id,
      organizationName: tenant.name,
      participantId,
      type: "badge_award",
      title: "Nieuwe badge",
      message: title,
      relatedBadgeAwardId: badgeResult.data.id
    });
  }

  redirectWithStatus(nextPath, "saved", "badge");
}

async function createParentNotificationsForParticipant(input: {
  tenantId: string;
  organizationName: string;
  participantId: string;
  type: "progress_score" | "badge_award";
  title: string;
  message: string;
  relatedProgressScoreId?: string;
  relatedBadgeAwardId?: string;
}) {
  const admin = createAdminClient();
  const [participantResult, guardiansResult] = await Promise.all([
    admin.from("participants").select("guardian_user_id, display_name").eq("tenant_id", input.tenantId).eq("id", input.participantId).maybeSingle(),
    admin.from("participant_guardians").select("guardian_user_id").eq("tenant_id", input.tenantId).eq("participant_id", input.participantId).eq("status", "active")
  ]);

  if (participantResult.error || guardiansResult.error || !participantResult.data) {
    return;
  }

  const participant = participantResult.data as { guardian_user_id: string | null; display_name: string };
  const guardianRows = (guardiansResult.data ?? []) as { guardian_user_id: string }[];
  const recipientIds = unique([participant.guardian_user_id, ...guardianRows.map((guardian) => guardian.guardian_user_id)]);

  if (recipientIds.length === 0) {
    return;
  }

  await createTenantNotifications({
    message: `${participant.display_name}: ${input.message}`,
    organizationName: input.organizationName,
    participantId: input.participantId,
    recipientIds,
    relatedBadgeAwardId: input.relatedBadgeAwardId ?? null,
    relatedProgressScoreId: input.relatedProgressScoreId ?? null,
    tenantId: input.tenantId,
    title: input.title,
    type: input.type
  });

  revalidatePath("/portaal");
  revalidatePath("/portaal/voortgang");
}

async function getSessionMembership(input: { tenantId: string; userId: string; canManageTenant: boolean; sessionId: string; participantId: string }) {
  const access = await canAccessSession(input);

  if (!access.allowed || !access.session) {
    return null;
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("group_memberships")
    .select("enrollment_id, participant_id, group_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("group_id", access.session.group_id)
    .eq("participant_id", input.participantId)
    .in("status", ["active", "trial"])
    .limit(1);

  if (error) {
    return null;
  }

  const membership = ((data ?? []) as { enrollment_id: string; participant_id: string; group_id: string; status: string }[])[0] ?? null;
  if (membership) return membership;

  const catchUpResult = await admin
    .from("catch_up_requests")
    .select("enrollment_id, participant_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("assigned_session_id", input.sessionId)
    .eq("participant_id", input.participantId)
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  if (catchUpResult.error || !catchUpResult.data) return null;
  return {
    enrollment_id: catchUpResult.data.enrollment_id,
    participant_id: catchUpResult.data.participant_id,
    group_id: access.session.group_id,
    status: "active"
  };
}

async function getInstructorMembershipForParticipant(input: { tenantId: string; userId: string; canManageTenant: boolean; participantId: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("group_memberships")
    .select("enrollment_id, participant_id, group_id, status")
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participantId)
    .in("status", ["active", "trial"]);

  if (error) {
    return null;
  }

  const memberships = (data ?? []) as { enrollment_id: string; participant_id: string; group_id: string; status: string }[];

  if (input.canManageTenant) {
    return memberships[0] ?? null;
  }

  for (const membership of memberships) {
    const allowed = await canAccessGroup({
      tenantId: input.tenantId,
      userId: input.userId,
      groupId: membership.group_id
    });

    if (allowed) {
      return membership;
    }
  }

  return null;
}

async function canAccessSession(input: { tenantId: string; userId: string; canManageTenant: boolean; sessionId: string }) {
  const admin = createAdminClient();
  const sessionResult = await admin.from("sessions").select("id, group_id").eq("tenant_id", input.tenantId).eq("id", input.sessionId).maybeSingle();

  if (sessionResult.error || !sessionResult.data) {
    return { allowed: false, session: null };
  }

  const session = sessionResult.data as { id: string; group_id: string };

  if (input.canManageTenant) {
    return { allowed: true, session };
  }

  const [groupAssignmentResult, sessionAssignmentResult] = await Promise.all([
    admin
      .from("group_instructor_assignments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("group_id", session.group_id)
      .eq("instructor_user_id", input.userId)
      .eq("status", "active")
      .limit(1),
    admin
      .from("session_instructor_assignments")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("session_id", session.id)
      .eq("instructor_user_id", input.userId)
      .eq("status", "active")
      .limit(1)
  ]);

  const allowed = !groupAssignmentResult.error && !sessionAssignmentResult.error && (((groupAssignmentResult.data ?? []) as { id: string }[]).length > 0 || ((sessionAssignmentResult.data ?? []) as { id: string }[]).length > 0);

  return { allowed, session };
}

async function canAccessGroup(input: { tenantId: string; userId: string; groupId: string }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("group_instructor_assignments")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("group_id", input.groupId)
    .eq("instructor_user_id", input.userId)
    .eq("status", "active")
    .limit(1);

  return !error && ((data ?? []) as { id: string }[]).length > 0;
}

function revalidateInstructorPaths(nextPath: `/${string}`) {
  revalidatePath("/instructor");
  revalidatePath("/instructor/agenda");
  revalidatePath("/portaal");
  revalidatePath("/portaal/voortgang");
  revalidatePath(nextPath);
}

function isTenantOperator(roles: readonly string[]) {
  return roles.some((role) => role === "tenant_owner" || role === "tenant_admin" || role === "tenant_staff");
}

function redirectWithStatus(path: `/${string}`, key: "saved" | "error", value: string): never {
  const separator = path.includes("?") ? "&" : "?";

  redirect(`${path}${separator}${key}=${encodeURIComponent(value)}`);
}

function readEnum(formData: FormData, field: string, allowed: Set<string>, fallback: string) {
  const value = readOptional(formData, field) ?? fallback;

  return allowed.has(value) ? value : fallback;
}

function readScore(formData: FormData, field: string) {
  const rawScore = Number(readOptional(formData, field) ?? 1);

  if (!Number.isInteger(rawScore) || rawScore < 1 || rawScore > 5) {
    return 1;
  }

  return rawScore;
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

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function evaluateAttendanceBadges(input: { participantId: string; sessionId: string; tenantId: string }) {
  const admin = createAdminClient();
  const attendanceResult = await admin
    .from("session_attendance")
    .select("id, status, marked_at")
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participantId)
    .order("marked_at", { ascending: false })
    .limit(50);
  if (attendanceResult.error) return;
  const rows = attendanceResult.data ?? [];
  const presentCount = rows.filter((row) => row.status === "present").length;
  let streak = 0;
  for (const row of rows) {
    if (row.status !== "present") break;
    streak += 1;
  }
  await Promise.all([
    evaluateBadgeTriggers({
      tenantId: input.tenantId,
      participantId: input.participantId,
      eventType: "attendance_count",
      eventContext: { count: presentCount, entityId: input.sessionId }
    }),
    evaluateBadgeTriggers({
      tenantId: input.tenantId,
      participantId: input.participantId,
      eventType: "attendance_streak",
      eventContext: { count: streak, entityId: input.sessionId }
    })
  ]);
}
