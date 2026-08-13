import "server-only";

import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { createNativeAccessTokenClient } from "@/lib/auth/native-session";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateBadgeTriggers, evaluateBadgeTriggerSet } from "./badge-engine";
import {
  nativeCommandIdempotencyKey,
  type NativeAssessmentFinalizeCommand,
  type NativeMobileCommand
} from "./native-command-contract";
import { getPositiveScoreLabel } from "./progress-template";
import { createTenantNotifications } from "./tenant-notifications";
import { PARTICIPANT_MEDIA_POLICY_VERSION } from "./participant-media-contract";

type NativeContext = AuthenticatedTrustedAuthContext & {
  activeTenant: NonNullable<AuthenticatedTrustedAuthContext["activeTenant"]>;
};

export async function executeNativeMobileCommand(input: {
  accessToken: string;
  command: NativeMobileCommand;
  context: NativeContext;
}) {
  const tenantId = input.context.activeTenant.tenantId;
  const actorUserId = input.context.user.id;
  const idempotencyKey = nativeCommandIdempotencyKey(
    input.command,
    actorUserId
  );
  const supabase = createNativeAccessTokenClient(input.accessToken);

  switch (input.command.type) {
    case "assessment.finalize": {
      const source =
        Date.now() - new Date(input.command.payload.observedAt).getTime() >
        2 * 60_000
          ? "offline"
          : "manual";
      const result = await supabase.rpc("finalize_swim_assessment", {
        target_client_operation_id: input.command.commandId,
        target_context_json: {
          channel: "instructor_android",
          contractVersion: 1,
          formulaVersion: "swim_progress_v3"
        },
        target_corrects_observation_id:
          input.command.payload.correctsObservationId,
        target_correction_reason: input.command.payload.correctionReason,
        target_curriculum_item_id: input.command.payload.curriculumItemId,
        target_device_id: input.command.deviceId,
        target_enrollment_id: input.command.payload.enrollmentId,
        target_idempotency_key: idempotencyKey,
        target_note: input.command.payload.note,
        target_observed_at: input.command.payload.observedAt,
        target_participant_id: input.command.payload.participantId,
        target_rating: input.command.payload.rating,
        target_session_id: input.command.payload.sessionId,
        target_source: source,
        target_tenant_id: tenantId,
        target_visibility: input.command.payload.visibility
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      await processAssessmentEffects({
        command: input.command,
        observationId: String(result.data),
        organizationName: input.context.activeTenant.name,
        tenantId
      });
      return { observationId: String(result.data) };
    }
    case "attendance.mark": {
      const result = await supabase.rpc("mark_native_attendance", {
        target_idempotency_key: idempotencyKey,
        target_note: input.command.payload.note,
        target_participant_id: input.command.payload.participantId,
        target_session_id: input.command.payload.sessionId,
        target_status: input.command.payload.status,
        target_tenant_id: tenantId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      if (input.command.payload.status === "present") {
        await evaluateNativeAttendanceBadges({
          participantId: input.command.payload.participantId,
          sessionId: input.command.payload.sessionId,
          tenantId
        });
      }
      return result.data;
    }
    case "lesson.cancel": {
      const result = await supabase.rpc("cancel_native_lesson", {
        target_idempotency_key: idempotencyKey,
        target_participant_id: input.command.payload.participantId,
        target_reason: input.command.payload.reason,
        target_session_id: input.command.payload.sessionId,
        target_tenant_id: tenantId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      return result.data;
    }
    case "graduation.respond": {
      const result = await supabase.rpc("respond_native_graduation_invite", {
        target_event_participant_id:
          input.command.payload.eventParticipantId,
        target_idempotency_key: idempotencyKey,
        target_response: input.command.payload.response,
        target_tenant_id: tenantId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      return result.data;
    }
    case "notification.read": {
      const result = await supabase.rpc("mark_native_notification_read", {
        target_idempotency_key: idempotencyKey,
        target_notification_id: input.command.payload.notificationId,
        target_tenant_id: tenantId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      return result.data;
    }
    case "message.reply": {
      const classification = classifyContent(
        input.command.payload.plainText,
        "personal"
      );
      const result = await supabase.rpc("reply_native_message_thread", {
        target_classification_reasons: classification.reasons,
        target_content_classification: classification.classification,
        target_human_confirmed: input.command.payload.humanConfirmed,
        target_idempotency_key: idempotencyKey,
        target_plain_text: input.command.payload.plainText,
        target_tenant_id: tenantId,
        target_thread_id: input.command.payload.threadId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      return result.data;
    }
    case "media.consent": {
      const result = await supabase.rpc("record_native_media_consent", {
        target_authority: input.command.payload.authority,
        target_decision: input.command.payload.decision,
        target_human_confirmed: input.command.payload.humanConfirmed,
        target_idempotency_key: idempotencyKey,
        target_participant_id: input.command.payload.participantId,
        target_policy_version: PARTICIPANT_MEDIA_POLICY_VERSION,
        target_tenant_id: tenantId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      return result.data;
    }
    case "feedback.submit": {
      const classification = classifyContent(
        input.command.payload.comment ?? "",
        "personal"
      );
      if (classification.classification === "restricted") {
        throw new NativeCommandRejectedError();
      }
      const result = await supabase.rpc("submit_native_parent_feedback", {
        target_comment: input.command.payload.comment,
        target_content_classification: classification.classification,
        target_follow_up_allowed: input.command.payload.followUpAllowed,
        target_human_confirmed: input.command.payload.humanConfirmed,
        target_idempotency_key: idempotencyKey,
        target_request_id: input.command.payload.requestId,
        target_score: input.command.payload.score,
        target_tenant_id: tenantId
      });
      if (result.error || !result.data) throw new NativeCommandRejectedError();
      return result.data;
    }
  }
}

export class NativeCommandRejectedError extends Error {
  constructor() {
    super("Native command rejected");
    this.name = "NativeCommandRejectedError";
  }
}

async function processAssessmentEffects(input: {
  command: NativeAssessmentFinalizeCommand;
  observationId: string;
  organizationName: string;
  tenantId: string;
}) {
  const admin = createAdminClient();
  const itemResult = await admin
    .from("curriculum_items")
    .select("id, identity_id, name, mastery_threshold")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.command.payload.curriculumItemId)
    .maybeSingle();
  if (itemResult.error || !itemResult.data) {
    throw new Error("Assessment effects could not resolve the curriculum item");
  }

  if (input.command.payload.visibility === "parent_visible") {
    const [participantResult, guardiansResult] = await Promise.all([
      admin
        .from("participants")
        .select("guardian_user_id, display_name")
        .eq("tenant_id", input.tenantId)
        .eq("id", input.command.payload.participantId)
        .maybeSingle(),
      admin
        .from("participant_guardians")
        .select("guardian_user_id")
        .eq("tenant_id", input.tenantId)
        .eq("participant_id", input.command.payload.participantId)
        .eq("status", "active")
    ]);
    if (
      participantResult.error ||
      guardiansResult.error ||
      !participantResult.data
    ) {
      throw new Error("Assessment effects could not resolve guardians");
    }
    const recipientIds = unique([
      participantResult.data.guardian_user_id,
      ...(guardiansResult.data ?? []).map((guardian) => guardian.guardian_user_id)
    ]);
    await createTenantNotifications({
      dedupeKey: `assessment:${input.observationId}`,
      message: `${participantResult.data.display_name}: ${itemResult.data.name}: ${getPositiveScoreLabel(input.command.payload.rating)}`,
      organizationName: input.organizationName,
      participantId: input.command.payload.participantId,
      recipientIds,
      tenantId: input.tenantId,
      title: input.command.payload.correctsObservationId
        ? "Voortgang bijgewerkt"
        : "Nieuwe voortgang",
      type: "progress_score"
    });
  }

  if (
    input.command.payload.rating >= Number(itemResult.data.mastery_threshold)
  ) {
    const [completedCountResult, identityResult] = await Promise.all([
      admin
        .from("swim_progress_projections")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", input.tenantId)
        .eq("participant_id", input.command.payload.participantId)
        .eq("scope_kind", "item")
        .gte("progress_fraction", 0.8),
      admin
        .from("curriculum_item_identities")
        .select("stable_key")
        .eq("tenant_id", input.tenantId)
        .eq("id", itemResult.data.identity_id)
        .maybeSingle()
    ]);
    if (completedCountResult.error || identityResult.error) {
      throw new Error("Assessment badge effects could not be evaluated");
    }
    const eventContext = {
      count: completedCountResult.count ?? 1,
      entityId: input.observationId,
      skill: identityResult.data?.stable_key ?? itemResult.data.id
    };
    await evaluateBadgeTriggerSet({
      events: [
        { eventContext, eventType: "progress_item_completed" },
        { eventContext, eventType: "skill_completed" }
      ],
      participantId: input.command.payload.participantId,
      tenantId: input.tenantId
    });
  }
}

async function evaluateNativeAttendanceBadges(input: {
  participantId: string;
  sessionId: string;
  tenantId: string;
}) {
  const result = await createAdminClient()
    .from("session_attendance")
    .select("status, marked_at")
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participantId)
    .order("marked_at", { ascending: false })
    .limit(50);
  if (result.error) {
    throw new Error("Attendance badge effects could not be evaluated");
  }
  const rows = result.data ?? [];
  const presentCount = rows.filter((row) => row.status === "present").length;
  let streak = 0;
  for (const row of rows) {
    if (row.status !== "present") break;
    streak += 1;
  }
  await Promise.all([
    evaluateBadgeTriggers({
      eventContext: { count: presentCount, entityId: input.sessionId },
      eventType: "attendance_count",
      participantId: input.participantId,
      tenantId: input.tenantId
    }),
    evaluateBadgeTriggers({
      eventContext: { count: streak, entityId: input.sessionId },
      eventType: "attendance_streak",
      participantId: input.participantId,
      tenantId: input.tenantId
    })
  ]);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
