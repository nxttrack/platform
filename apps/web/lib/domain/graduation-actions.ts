"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

const readinessStatuses = new Set(["not_ready", "nearly_ready", "ready", "blocked"]);
const eventStatuses = new Set(["planned", "published", "completed", "cancelled"]);
const resultValues = new Set(["passed", "failed", "deferred"]);

export async function markGraduationReadinessAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const enrollmentId = readRequired(formData, "enrollmentId");
  const status = readEnum(formData, "status", readinessStatuses, "nearly_ready");
  const enrollmentResult = await admin.from("enrollments").select("id, participant_id, program_id, current_stage_id").eq("tenant_id", tenant.id).eq("id", enrollmentId).maybeSingle();

  if (enrollmentResult.error || !enrollmentResult.data || !enrollmentResult.data.current_stage_id) {
    redirect("/admin/afzwemmen?error=enrollment");
  }

  const { error } = await admin.from("graduation_readiness").upsert(
    {
      tenant_id: tenant.id,
      participant_id: enrollmentResult.data.participant_id,
      enrollment_id: enrollmentResult.data.id,
      program_id: enrollmentResult.data.program_id,
      stage_id: enrollmentResult.data.current_stage_id,
      status,
      readiness_score: readNumber(formData, "readinessScore"),
      checklist_summary: readOptional(formData, "checklistSummary"),
      reviewed_by_user_id: user.id,
      reviewed_at: new Date().toISOString(),
      next_review_on: readOptional(formData, "nextReviewOn")
    },
    { onConflict: "tenant_id,enrollment_id,stage_id" }
  );

  redirectAfterWrite(error, "readiness");
}

export async function createGraduationEventAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const startsAt = readRequired(formData, "startsAt");
  const endsAt = readRequired(formData, "endsAt");

  if (new Date(startsAt).getTime() >= new Date(endsAt).getTime()) {
    redirect("/admin/afzwemmen?error=time");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("graduation_events").insert({
    tenant_id: tenant.id,
    program_id: readOptional(formData, "programId"),
    stage_id: readOptional(formData, "stageId"),
    resource_id: readOptional(formData, "resourceId"),
    title: readRequired(formData, "title"),
    status: readEnum(formData, "status", eventStatuses, "planned"),
    starts_at: new Date(startsAt).toISOString(),
    ends_at: new Date(endsAt).toISOString(),
    capacity: readInteger(formData, "capacity"),
    notes: readOptional(formData, "notes"),
    created_by_user_id: user.id
  });

  redirectAfterWrite(error, "event");
}

export async function inviteGraduationParticipantAction(formData: FormData) {
  const { tenant } = await getActionContext();
  const admin = createAdminClient();
  const eventId = readRequired(formData, "eventId");
  const readinessId = readRequired(formData, "readinessId");
  const [eventResult, readinessResult, participantCountResult] = await Promise.all([
    admin.from("graduation_events").select("id, title, starts_at, capacity, status").eq("tenant_id", tenant.id).eq("id", eventId).maybeSingle(),
    admin.from("graduation_readiness").select("id, participant_id, enrollment_id, program_id, stage_id, status").eq("tenant_id", tenant.id).eq("id", readinessId).maybeSingle(),
    admin.from("graduation_event_participants").select("id, status").eq("tenant_id", tenant.id).eq("event_id", eventId)
  ]);

  if (eventResult.error || readinessResult.error || participantCountResult.error || !eventResult.data || !readinessResult.data) {
    redirect("/admin/afzwemmen?error=invite");
  }

  const activeInviteCount = ((participantCountResult.data ?? []) as { id: string; status: string }[]).filter((item) => item.status !== "declined" && item.status !== "cancelled").length;

  if (eventResult.data.capacity !== null && activeInviteCount >= Number(eventResult.data.capacity)) {
    redirect("/admin/afzwemmen?error=capacity");
  }

  const inviteResult = await admin
    .from("graduation_event_participants")
    .upsert(
      {
        tenant_id: tenant.id,
        event_id: eventResult.data.id,
        participant_id: readinessResult.data.participant_id,
        enrollment_id: readinessResult.data.enrollment_id,
        readiness_id: readinessResult.data.id,
        invite_status: "sent",
        status: "invited",
        invited_at: new Date().toISOString(),
        result: "pending"
      },
      { onConflict: "tenant_id,event_id,participant_id" }
    )
    .select("id")
    .single();

  if (inviteResult.error || !inviteResult.data) {
    redirect("/admin/afzwemmen?error=invite");
  }

  await admin.from("graduation_readiness").update({ status: "invited" }).eq("tenant_id", tenant.id).eq("id", readinessResult.data.id);
  await createParentNotifications({
    tenantId: tenant.id,
    participantId: readinessResult.data.participant_id,
    type: "graduation_invite",
    title: "Afzwemuitnodiging",
    message: `Uitgenodigd voor ${eventResult.data.title} op ${formatDate(eventResult.data.starts_at)}`
  });

  redirectAfterWrite(null, "invite");
}

export async function registerGraduationResultAction(formData: FormData) {
  const { tenant, user } = await getActionContext();
  const admin = createAdminClient();
  const eventParticipantId = readRequired(formData, "eventParticipantId");
  const result = readEnum(formData, "result", resultValues, "passed");
  const eventParticipantResult = await admin
    .from("graduation_event_participants")
    .select("id, participant_id, enrollment_id, readiness_id, event_id")
    .eq("tenant_id", tenant.id)
    .eq("id", eventParticipantId)
    .maybeSingle();

  if (eventParticipantResult.error || !eventParticipantResult.data) {
    redirect("/admin/afzwemmen?error=result");
  }

  const enrollmentResult = await admin
    .from("enrollments")
    .select("id, participant_id, program_id, current_stage_id")
    .eq("tenant_id", tenant.id)
    .eq("id", eventParticipantResult.data.enrollment_id)
    .maybeSingle();

  if (enrollmentResult.error || !enrollmentResult.data || !enrollmentResult.data.current_stage_id) {
    redirect("/admin/afzwemmen?error=result");
  }

  const { error: resultError } = await admin
    .from("graduation_event_participants")
    .update({
      result,
      status: result,
      result_registered_by_user_id: user.id,
      result_registered_at: new Date().toISOString(),
      result_notes: readOptional(formData, "resultNotes")
    })
    .eq("tenant_id", tenant.id)
    .eq("id", eventParticipantResult.data.id);

  if (resultError) {
    redirect("/admin/afzwemmen?error=result");
  }

  if (result === "passed") {
    const stageResult = await admin.from("program_stages").select("name, badge_label").eq("tenant_id", tenant.id).eq("id", enrollmentResult.data.current_stage_id).maybeSingle();
    const certificateTitle = readOptional(formData, "certificateTitle") ?? `Diploma ${stageResult.data?.badge_label ?? stageResult.data?.name ?? "zwemvaardigheid"}`;
    const certificateResult = await admin
      .from("certificate_records")
      .upsert(
        {
          tenant_id: tenant.id,
          participant_id: eventParticipantResult.data.participant_id,
          enrollment_id: enrollmentResult.data.id,
          program_id: enrollmentResult.data.program_id,
          stage_id: enrollmentResult.data.current_stage_id,
          event_participant_id: eventParticipantResult.data.id,
          certificate_number: readOptional(formData, "certificateNumber"),
          title: certificateTitle,
          status: "issued",
          issued_on: readOptional(formData, "issuedOn") ?? new Date().toISOString().slice(0, 10),
          issued_by_user_id: user.id,
          notes: readOptional(formData, "certificateNotes")
        },
        { onConflict: "tenant_id,event_participant_id" }
      )
      .select("id")
      .single();

    if (certificateResult.error || !certificateResult.data) {
      redirect("/admin/afzwemmen?error=certificate");
    }

    if (eventParticipantResult.data.readiness_id) {
      await admin.from("graduation_readiness").update({ status: "completed" }).eq("tenant_id", tenant.id).eq("id", eventParticipantResult.data.readiness_id);
    }

    await createParentNotifications({
      tenantId: tenant.id,
      participantId: eventParticipantResult.data.participant_id,
      type: "certificate_issued",
      title: "Diploma beschikbaar",
      message: certificateTitle
    });
  }

  redirectAfterWrite(null, "result");
}

async function getActionContext() {
  const context = await requirePrivateShellContext("/admin");

  return {
    tenant: getActiveTenant(context),
    user: context.user
  };
}

async function createParentNotifications(input: { tenantId: string; participantId: string; type: "graduation_invite" | "certificate_issued"; title: string; message: string }) {
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

  await admin.from("tenant_notifications").insert(
    recipientIds.map((recipientId) => ({
      tenant_id: input.tenantId,
      recipient_user_id: recipientId,
      participant_id: input.participantId,
      type: input.type,
      title: input.title,
      message: `${participant.display_name}: ${input.message}`,
      status: "unread"
    }))
  );

  revalidatePath("/portaal");
  revalidatePath("/portaal/diplomas");
}

function redirectAfterWrite(error: { message: string } | null, saved: string): never {
  revalidatePath("/admin");
  revalidatePath("/admin/afzwemmen");
  revalidatePath("/portaal");
  revalidatePath("/portaal/diplomas");

  if (error) {
    redirect("/admin/afzwemmen?error=write");
  }

  redirect(`/admin/afzwemmen?saved=${encodeURIComponent(saved)}`);
}

function readEnum(formData: FormData, field: string, allowed: Set<string>, fallback: string) {
  const value = readOptional(formData, field) ?? fallback;

  return allowed.has(value) ? value : fallback;
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

function readInteger(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : null;
}

function readNumber(formData: FormData, field: string) {
  const value = readOptional(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
