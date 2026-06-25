"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { queueParentEventMessages } from "@/lib/communication/event-hooks";
import {
  buildEvidenceSnapshot,
  buildParentProgressSummary,
  createProgressEvidenceEvent,
  evaluateBadgeRecommendations,
  type ProgressStatus
} from "@/lib/progress/progress-engine";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const instructorRoles = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"] as const;

export async function recordAttendanceAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const sessionId = requiredString(formData, "session_id");
  const groupId = optionalString(formData, "group_id");

  await throwOnError(
    supabase.from("session_attendance").upsert(
      {
        tenant_id: tenantId,
        session_id: sessionId,
        enrollment_id: requiredString(formData, "enrollment_id"),
        participant_id: requiredString(formData, "participant_id"),
        status: requiredEnum(formData, "status", ["present", "absent", "late", "excused"]),
        note: optionalString(formData, "note"),
        recorded_by_profile_id: profileId,
        recorded_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,session_id,enrollment_id" }
    )
  );

  revalidateInstructorPortal({ groupId, participantId: optionalString(formData, "participant_id") });
}

export async function recordBulkAttendanceAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const sessionId = requiredString(formData, "session_id");
  const groupId = optionalString(formData, "group_id");
  const rows = formData
    .getAll("attendance_row")
    .map((value) => (typeof value === "string" ? value.split("|") : []))
    .filter((parts): parts is [string, string] => parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]));

  if (rows.length === 0) {
    throw new Error("Geen leerlingen gevonden om aanwezigheid voor op te slaan.");
  }

  const recordedAt = new Date().toISOString();
  const attendanceRows = rows.map(([enrollmentId, participantId]) => ({
    tenant_id: tenantId,
    session_id: sessionId,
    enrollment_id: enrollmentId,
    participant_id: participantId,
    status: requiredEnum(formData, `status_${enrollmentId}`, ["present", "absent", "late", "excused"]),
    note: optionalString(formData, `note_${enrollmentId}`),
    recorded_by_profile_id: profileId,
    recorded_at: recordedAt
  }));

  await throwOnError(supabase.from("session_attendance").upsert(attendanceRows, { onConflict: "tenant_id,session_id,enrollment_id" }));
  await notifyAttendanceGuardians(
    supabase,
    tenantId,
    attendanceRows
      .filter((row): row is (typeof attendanceRows)[number] & { status: "absent" | "excused" } => row.status === "absent" || row.status === "excused")
      .map((row) => ({
        participantId: row.participant_id,
        enrollmentId: row.enrollment_id,
        status: row.status
      }))
  );

  revalidateInstructorPortal({ groupId });
}

export async function createProgressUpdateAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const participantId = requiredString(formData, "participant_id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const status = requiredEnum(formData, "status", ["observed", "in_progress", "passed", "needs_attention"]);
  const score = optionalScore(formData, "score");
  const stageId = optionalString(formData, "stage_id");
  const note = optionalString(formData, "note");
  const subject = optionalString(formData, "subject_label") ?? "Algemene voortgang";
  const parentSummary = buildParentProgressSummary(subject, status, score, note);
  const evidenceSnapshot = buildEvidenceSnapshot({
    status,
    score,
    note,
    subject,
    source: "progress"
  });

  const { data, error } = await supabase
    .from("progress")
    .insert({
      tenant_id: tenantId,
      enrollment_id: enrollmentId,
      stage_id: stageId,
      status,
      score,
      note,
      parent_summary: parentSummary,
      evidence_snapshot: evidenceSnapshot,
      assessed_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Voortgang kon niet worden opgeslagen.");
  }

  const progressId = (data as { id: string }).id;

  await createProgressEvidenceEvent(supabase, {
    tenantId,
    participantId,
    enrollmentId,
    stageId,
    progressId,
    eventType: "progress_observation",
    title: subject,
    summary: note,
    parentSummary,
    score,
    createdByProfileId: profileId,
    metadata: evidenceSnapshot
  });
  await notifyProgressGuardians(supabase, tenantId, {
    participantId,
    enrollmentId,
    title: "Nieuwe voortgang toegevoegd",
    body: parentSummary,
    sourceRecordId: progressId,
    createdByProfileId: profileId
  });
  await evaluateBadgeRecommendations(supabase, { tenantId, participantId, enrollmentId });

  revalidateInstructorPortal({ groupId: optionalString(formData, "group_id"), participantId: optionalString(formData, "participant_id") });
}

export async function createStudentNoteAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();

  await throwOnError(
    supabase.from("instructor_student_notes").insert({
      tenant_id: tenantId,
      participant_id: requiredString(formData, "participant_id"),
      enrollment_id: optionalString(formData, "enrollment_id"),
      note_type: requiredEnum(formData, "note_type", ["internal", "parent_visible", "compliment"]),
      body: requiredString(formData, "body"),
      author_profile_id: profileId,
      status: "active"
    })
  );

  revalidateInstructorPortal({ groupId: optionalString(formData, "group_id"), participantId: optionalString(formData, "participant_id") });
}

export async function createStageModuleProgressAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const participantId = requiredString(formData, "participant_id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const stageId = requiredString(formData, "stage_id");
  const stageModuleId = requiredString(formData, "stage_module_id");
  const status = requiredEnum(formData, "status", ["observed", "in_progress", "passed", "needs_attention"]);
  const score = optionalScore(formData, "score");
  const note = optionalString(formData, "note");
  const subject = optionalString(formData, "subject_label") ?? (await moduleName(supabase, tenantId, stageModuleId));
  const parentSummary = buildParentProgressSummary(subject, status, score, note);
  const evidenceSnapshot = buildEvidenceSnapshot({
    status,
    score,
    note,
    subject,
    source: "module_progress",
    templateId: optionalString(formData, "template_id")
  });

  const { data, error } = await supabase
    .from("stage_module_progress")
    .upsert(
      {
        tenant_id: tenantId,
        enrollment_id: enrollmentId,
        participant_id: participantId,
        stage_id: stageId,
        stage_module_id: stageModuleId,
        status,
        score,
        note,
        parent_summary: parentSummary,
        evidence_snapshot: evidenceSnapshot,
        assessed_by_profile_id: profileId,
        assessed_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,enrollment_id,stage_module_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Module-progress kon niet worden opgeslagen.");
  }

  const stageModuleProgressId = (data as { id: string }).id;

  await createProgressEvidenceEvent(supabase, {
    tenantId,
    participantId,
    enrollmentId,
    stageId,
    stageModuleId,
    stageModuleProgressId,
    eventType: "module_assessment",
    title: subject,
    summary: note,
    parentSummary,
    score,
    createdByProfileId: profileId,
    metadata: evidenceSnapshot
  });
  await notifyProgressGuardians(supabase, tenantId, {
    participantId,
    enrollmentId,
    title: status === "passed" ? "Onderdeel afgerond" : "Nieuwe module-update",
    body: parentSummary,
    sourceRecordId: stageModuleProgressId,
    createdByProfileId: profileId
  });
  await evaluateBadgeRecommendations(supabase, { tenantId, participantId, enrollmentId });

  revalidateInstructorPortal({ groupId, participantId });
}

export async function createBulkStageModuleProgressAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const stageModuleId = requiredString(formData, "stage_module_id");
  const subject = optionalString(formData, "subject_label") ?? (await moduleName(supabase, tenantId, stageModuleId));
  const rows = formData
    .getAll("progress_row")
    .map((value) => (typeof value === "string" ? value.split("|") : []))
    .filter((parts): parts is [string, string, string] => parts.length === 3 && Boolean(parts[0]) && Boolean(parts[1]) && Boolean(parts[2]));

  if (rows.length === 0) {
    throw new Error("Geen leerlingen gevonden om module-progress voor op te slaan.");
  }

  const assessedAt = new Date().toISOString();
  const upsertRows = rows.map(([enrollmentId, participantId, stageId]) => {
    const status = requiredEnum(formData, `progress_status_${enrollmentId}`, ["observed", "in_progress", "passed", "needs_attention"]);
    const score = optionalScore(formData, `progress_score_${enrollmentId}`);
    const note = optionalString(formData, `progress_note_${enrollmentId}`);
    const parentSummary = buildParentProgressSummary(subject, status, score, note);

    return {
      tenant_id: tenantId,
      enrollment_id: enrollmentId,
      participant_id: participantId,
      stage_id: stageId,
      stage_module_id: stageModuleId,
      status,
      score,
      note,
      parent_summary: parentSummary,
      evidence_snapshot: buildEvidenceSnapshot({ status, score, note, subject, source: "module_progress" }),
      assessed_by_profile_id: profileId,
      assessed_at: assessedAt
    };
  });

  const { data, error } = await supabase
    .from("stage_module_progress")
    .upsert(upsertRows, { onConflict: "tenant_id,enrollment_id,stage_module_id" })
    .select("id, enrollment_id, participant_id, stage_id, status, score, note, parent_summary, evidence_snapshot");

  if (error) {
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as Array<{
    id: string;
    enrollment_id: string;
    participant_id: string;
    stage_id: string;
    status: ProgressStatus;
    score: number | null;
    note: string | null;
    parent_summary: string | null;
    evidence_snapshot: Record<string, unknown>;
  }>) {
    await createProgressEvidenceEvent(supabase, {
      tenantId,
      participantId: row.participant_id,
      enrollmentId: row.enrollment_id,
      stageId: row.stage_id,
      stageModuleId,
      stageModuleProgressId: row.id,
      eventType: "module_assessment",
      title: subject,
      summary: row.note,
      parentSummary: row.parent_summary,
      score: row.score,
      createdByProfileId: profileId,
      metadata: row.evidence_snapshot
    });
    await evaluateBadgeRecommendations(supabase, { tenantId, participantId: row.participant_id, enrollmentId: row.enrollment_id });
  }

  revalidateInstructorPortal({ groupId });
}

export async function awardBadgeAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const participantId = requiredString(formData, "participant_id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const badgeId = requiredString(formData, "badge_id");
  const badgeRecommendationId = optionalString(formData, "badge_recommendation_id");
  const note = optionalString(formData, "note");

  const { data, error } = await supabase
    .from("badge_awards")
    .upsert(
      {
        tenant_id: tenantId,
        badge_id: badgeId,
        participant_id: participantId,
        enrollment_id: enrollmentId,
        awarded_by_profile_id: profileId,
        source: "instructor",
        note,
        status: "awarded",
        badge_recommendation_id: badgeRecommendationId,
        awarded_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,badge_id,participant_id,enrollment_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Badge kon niet worden toegekend.");
  }

  const badgeAwardId = (data as { id: string }).id;

  if (badgeRecommendationId) {
    await throwOnError(
      supabase
        .from("badge_recommendations")
        .update({
          status: "awarded",
          reviewed_by_profile_id: profileId,
          reviewed_at: new Date().toISOString(),
          review_note: note,
          badge_award_id: badgeAwardId
        })
        .eq("tenant_id", tenantId)
        .eq("id", badgeRecommendationId)
    );
  }

  await createProgressEvidenceEvent(supabase, {
    tenantId,
    participantId,
    enrollmentId,
    badgeAwardId,
    eventType: "badge_award",
    title: "Badge toegekend",
    summary: note,
    parentSummary: note ?? "Er is een nieuwe badge verdiend.",
    score: null,
    createdByProfileId: profileId,
    metadata: {
      badge_id: badgeId,
      badge_recommendation_id: badgeRecommendationId
    }
  });
  await maybeQueueBadgeAwardMessage(supabase, tenantId, participantId, enrollmentId, badgeId, profileId);

  revalidateInstructorPortal({ groupId, participantId });
}

export async function reviewBadgeRecommendationAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const participantId = requiredString(formData, "participant_id");
  const decision = requiredEnum(formData, "decision", ["awarded", "rejected"]);
  const reviewNote = optionalString(formData, "review_note");

  if (decision === "rejected" && !reviewNote) {
    throw new Error("Afwijzen vereist een reden.");
  }

  const { data, error } = await supabase
    .from("badge_recommendations")
    .select("id, badge_id, participant_id, enrollment_id, review_note")
    .eq("tenant_id", tenantId)
    .eq("id", requiredString(formData, "badge_recommendation_id"))
    .maybeSingle();

  if (error || !data) {
    throw new Error(error?.message ?? "Badge-aanbeveling niet gevonden.");
  }

  const recommendation = data as { id: string; badge_id: string; participant_id: string; enrollment_id: string | null; review_note: string | null };

  if (decision === "rejected") {
    await throwOnError(
      supabase
        .from("badge_recommendations")
        .update({
          status: "rejected",
          reviewed_by_profile_id: profileId,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote
        })
        .eq("tenant_id", tenantId)
        .eq("id", recommendation.id)
    );
    revalidateInstructorPortal({ groupId, participantId });
    return;
  }

  const awardForm = new FormData();
  awardForm.set("participant_id", recommendation.participant_id);
  awardForm.set("enrollment_id", recommendation.enrollment_id ?? requiredString(formData, "enrollment_id"));
  awardForm.set("badge_id", recommendation.badge_id);
  awardForm.set("badge_recommendation_id", recommendation.id);
  awardForm.set("note", reviewNote ?? recommendation.review_note ?? "Toegekend op basis van voortgangsevidence.");

  if (groupId) {
    awardForm.set("group_id", groupId);
  }

  await awardBadgeAction(awardForm);
}

export async function proposeStageTransitionAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const participantId = requiredString(formData, "participant_id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const fromStageId = optionalString(formData, "from_stage_id");
  const toStageId = requiredString(formData, "to_stage_id");
  const reason = optionalString(formData, "reason");
  const evidenceSnapshot = await buildStageTransitionEvidenceSnapshot(supabase, tenantId, enrollmentId, fromStageId);

  const { data, error } = await supabase
    .from("stage_transition_proposals")
    .insert({
      tenant_id: tenantId,
      enrollment_id: enrollmentId,
      participant_id: participantId,
      from_stage_id: fromStageId,
      to_stage_id: toStageId,
      proposed_by_profile_id: profileId,
      reason,
      evidence_snapshot: evidenceSnapshot,
      status: "proposed",
      proposed_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Doorstroomvoorstel kon niet worden opgeslagen.");
  }

  await createProgressEvidenceEvent(supabase, {
    tenantId,
    participantId,
    enrollmentId,
    stageId: fromStageId,
    stageTransitionProposalId: (data as { id: string }).id,
    eventType: "stage_transition_proposal",
    title: "Doorstroom voorgesteld",
    summary: reason,
    parentSummary: reason ?? "De instructeur heeft een niveau-overgang voorgesteld.",
    createdByProfileId: profileId,
    metadata: evidenceSnapshot
  });

  revalidateInstructorPortal({ groupId, participantId });
}

async function requireInstructorContext() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canUseInstructorPortal = context.activeTenant.roles.some((role) => instructorRoles.includes(role as (typeof instructorRoles)[number]));

  if (!canUseInstructorPortal) {
    throw new Error("Je hebt geen instructeursrechten voor deze tenant.");
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

async function notifyAttendanceGuardians(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  rows: { participantId: string; enrollmentId: string; status: "absent" | "excused" }[]
) {
  if (rows.length === 0) {
    return;
  }

  const participantIds = [...new Set(rows.map((row) => row.participantId))];
  const { data, error } = await supabase
    .from("participant_guardians")
    .select("participant_id, profile_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .in("participant_id", participantIds);

  if (error) {
    throw new Error(error.message);
  }

  const guardians = Array.isArray(data) ? (data as { participant_id: string; profile_id: string }[]) : [];
  const notifications = rows.flatMap((row) => {
    return guardians
      .filter((guardian) => guardian.participant_id === row.participantId)
      .map((guardian) => ({
        tenant_id: tenantId,
        recipient_profile_id: guardian.profile_id,
        participant_id: row.participantId,
        enrollment_id: row.enrollmentId,
        title: row.status === "excused" ? "Afmelding geregistreerd" : "Afwezigheid geregistreerd",
        body: row.status === "excused" ? "De afmelding voor de les is verwerkt." : "De afwezigheid voor de les is geregistreerd.",
        notification_type: "lesson",
        status: "unread"
      }));
  });

  if (notifications.length > 0) {
    await throwOnError(supabase.from("parent_notifications").insert(notifications));
  }
}

async function notifyProgressGuardians(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  input: {
    participantId: string;
    enrollmentId: string;
    title: string;
    body: string;
    sourceRecordId: string;
    createdByProfileId: string;
  }
) {
  await queueParentEventMessages(supabase, {
    tenantId,
    participantId: input.participantId,
    enrollmentId: input.enrollmentId,
    eventKey: "progress_update",
    templateCode: "progress-update",
    context: {
      message_title: input.title,
      message_body: input.body
    },
    sourceTable: "progress",
    sourceRecordId: input.sourceRecordId,
    createdByProfileId: input.createdByProfileId,
    fallbackSubject: input.title,
    fallbackBody: input.body
  });
}

async function maybeQueueBadgeAwardMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  participantId: string,
  enrollmentId: string,
  badgeId: string,
  profileId: string
) {
  const [participantResult, badgeResult] = await Promise.all([
    supabase.from("participants").select("display_name").eq("tenant_id", tenantId).eq("id", participantId).maybeSingle(),
    supabase.from("badges").select("name").eq("tenant_id", tenantId).eq("id", badgeId).maybeSingle()
  ]);

  if (participantResult.error || badgeResult.error) {
    throw new Error(participantResult.error?.message ?? badgeResult.error?.message ?? "Badgebericht kon niet worden voorbereid.");
  }

  await queueParentEventMessages(supabase, {
    tenantId,
    participantId,
    enrollmentId,
    eventKey: "badge_awarded",
    templateCode: "badge-awarded",
    context: {
      participant_name: (participantResult.data as { display_name?: string } | null)?.display_name ?? "De leerling",
      badge_name: (badgeResult.data as { name?: string } | null)?.name ?? "Nieuwe badge"
    },
    sourceTable: "badges",
    sourceRecordId: badgeId,
    createdByProfileId: profileId,
    fallbackSubject: "Nieuwe badge behaald",
    fallbackBody: "Er is een nieuwe badge behaald. Bekijk de voortgang in het ouderportaal."
  });
}

async function moduleName(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, moduleId: string) {
  const { data, error } = await supabase.from("stage_modules").select("name").eq("tenant_id", tenantId).eq("id", moduleId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { name?: string } | null)?.name ?? "Module";
}

async function buildStageTransitionEvidenceSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  enrollmentId: string,
  fromStageId: string | null
) {
  if (!fromStageId) {
    return buildEvidenceSnapshot({
      source: "stage_transition",
      subject: "Doorstroom",
      status: "observed",
      score: null
    });
  }

  const [criteriaResult, progressResult] = await Promise.all([
    supabase
      .from("stage_progress_criteria")
      .select("id, name, required_modules, required_score")
      .eq("tenant_id", tenantId)
      .eq("stage_id", fromStageId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stage_module_progress")
      .select("stage_module_id, status, score, assessed_at")
      .eq("tenant_id", tenantId)
      .eq("enrollment_id", enrollmentId)
      .eq("stage_id", fromStageId)
  ]);

  if (criteriaResult.error || progressResult.error) {
    throw new Error(criteriaResult.error?.message ?? progressResult.error?.message ?? "Evidence kon niet worden opgebouwd.");
  }

  const rows = Array.isArray(progressResult.data)
    ? (progressResult.data as Array<{ stage_module_id: string; status: string; score: number | null; assessed_at: string }>)
    : [];
  const passed = rows.filter((row) => row.status === "passed").length;
  const averageScore = rows.length === 0
    ? null
    : Math.round(rows.reduce((sum, row) => sum + (typeof row.score === "number" ? row.score : 0), 0) / rows.length);

  return {
    source: "stage_transition",
    criteria: criteriaResult.data ?? null,
    module_progress: {
      total: rows.length,
      passed,
      average_score: averageScore,
      rows
    },
    captured_at: new Date().toISOString()
  };
}

function revalidateInstructorPortal({ groupId, participantId }: { groupId?: string | null; participantId?: string | null } = {}) {
  for (const path of ["/instructor", "/instructor/agenda", "/instructor/groepen", "/instructor/leerlingen"]) {
    revalidatePath(path);
  }

  for (const path of ["/parent", "/parent/voortgang", "/parent/badges", "/parent/notificaties"]) {
    revalidatePath(path);
  }

  if (groupId) {
    revalidatePath(`/instructor/group/${groupId}`);
  }

  if (participantId) {
    revalidatePath(`/instructor/student/${participantId}`);
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

function requiredEnum<Allowed extends string>(formData: FormData, key: string, allowed: Allowed[]) {
  const value = requiredString(formData, key);

  if (!allowed.includes(value as Allowed)) {
    throw new Error(`${key} heeft een ongeldige waarde.`);
  }

  return value as Allowed;
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
