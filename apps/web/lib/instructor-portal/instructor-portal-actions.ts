"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { queueParentEventMessages } from "@/lib/communication/event-hooks";
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
  const { supabase, tenantId } = await requireInstructorContext();

  await throwOnError(
    supabase.from("progress").insert({
      tenant_id: tenantId,
      enrollment_id: requiredString(formData, "enrollment_id"),
      stage_id: optionalString(formData, "stage_id"),
      status: requiredEnum(formData, "status", ["observed", "in_progress", "passed", "needs_attention"]),
      score: optionalScore(formData, "score"),
      note: optionalString(formData, "note"),
      assessed_at: new Date().toISOString()
    })
  );

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

  await throwOnError(
    supabase.from("stage_module_progress").upsert(
      {
        tenant_id: tenantId,
        enrollment_id: requiredString(formData, "enrollment_id"),
        participant_id: participantId,
        stage_id: requiredString(formData, "stage_id"),
        stage_module_id: requiredString(formData, "stage_module_id"),
        status: requiredEnum(formData, "status", ["observed", "in_progress", "passed", "needs_attention"]),
        score: optionalScore(formData, "score"),
        note: optionalString(formData, "note"),
        assessed_by_profile_id: profileId,
        assessed_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,enrollment_id,stage_module_id" }
    )
  );

  revalidateInstructorPortal({ groupId, participantId });
}

export async function awardBadgeAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const participantId = requiredString(formData, "participant_id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const badgeId = requiredString(formData, "badge_id");

  await throwOnError(
    supabase.from("badge_awards").upsert(
      {
        tenant_id: tenantId,
        badge_id: badgeId,
        participant_id: participantId,
        enrollment_id: enrollmentId,
        awarded_by_profile_id: profileId,
        source: "instructor",
        note: optionalString(formData, "note"),
        status: "awarded",
        awarded_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,badge_id,participant_id,enrollment_id", ignoreDuplicates: true }
    )
  );
  await maybeQueueBadgeAwardMessage(supabase, tenantId, participantId, enrollmentId, badgeId, profileId);

  revalidateInstructorPortal({ groupId, participantId });
}

export async function proposeStageTransitionAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireInstructorContext();
  const groupId = optionalString(formData, "group_id");
  const participantId = requiredString(formData, "participant_id");

  await throwOnError(
    supabase.from("stage_transition_proposals").insert({
      tenant_id: tenantId,
      enrollment_id: requiredString(formData, "enrollment_id"),
      participant_id: participantId,
      from_stage_id: optionalString(formData, "from_stage_id"),
      to_stage_id: requiredString(formData, "to_stage_id"),
      proposed_by_profile_id: profileId,
      reason: optionalString(formData, "reason"),
      status: "proposed",
      proposed_at: new Date().toISOString()
    })
  );

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
