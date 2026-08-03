import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type FeedbackCampaign = {
  id: string;
  name: string;
  trigger_type: "trial_completed" | "first_month" | "certificate_issued" | "manual";
  status: "draft" | "active" | "paused" | "archived";
  prompt: string;
  follow_up_question: string | null;
  created_at: string;
};

export type FeedbackRequest = {
  id: string;
  campaign_id: string;
  participant_id: string;
  guardian_user_id: string;
  status: "open" | "completed" | "expired" | "cancelled";
  requested_at: string;
  expires_at: string;
  completed_at: string | null;
};

export type FeedbackResponse = {
  id: string;
  request_id: string;
  guardian_user_id: string;
  score: number;
  comment: string | null;
  follow_up_allowed: boolean;
  submitted_at: string;
};

export type FeedbackAdminData = {
  campaigns: FeedbackCampaign[];
  requests: FeedbackRequest[];
  responses: FeedbackResponse[];
  participants: Array<{ id: string; displayName: string; guardianUserId: string; guardianName: string }>;
  metrics: { average: number | null; detractors: number; open: number; promoters: number; responses: number };
};

export async function getFeedbackAdminData(): Promise<FeedbackAdminData> {
  const context = await requirePrivateShellContext("/admin/feedback");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [campaigns, requests, responses, participants] = await Promise.all([
    admin.from("tenant_feedback_campaigns").select("id, name, trigger_type, status, prompt, follow_up_question, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    admin.from("feedback_survey_requests").select("id, campaign_id, participant_id, guardian_user_id, status, requested_at, expires_at, completed_at").eq("tenant_id", tenant.id).order("requested_at", { ascending: false }).limit(250),
    admin.from("feedback_survey_responses").select("id, request_id, guardian_user_id, score, comment, follow_up_allowed, submitted_at").eq("tenant_id", tenant.id).order("submitted_at", { ascending: false }).limit(250),
    admin.from("participants").select("id, display_name, guardian_user_id").eq("tenant_id", tenant.id).eq("is_test", false).not("guardian_user_id", "is", null).order("display_name")
  ]);
  assertResult(campaigns.error, "feedback campaigns");
  assertResult(requests.error, "feedback requests");
  assertResult(responses.error, "feedback responses");
  assertResult(participants.error, "feedback participants");
  const campaignRows = (campaigns.data ?? []) as FeedbackCampaign[];
  const requestRows = (requests.data ?? []) as FeedbackRequest[];
  const responseRows = (responses.data ?? []) as FeedbackResponse[];
  const participantRows = (participants.data ?? []) as Array<{ id: string; display_name: string; guardian_user_id: string }>;
  const guardianIds = [...new Set(participantRows.map((row) => row.guardian_user_id))];
  const profiles = guardianIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", guardianIds)
    : { data: [], error: null };
  assertResult(profiles.error, "guardian profiles");
  const names = new Map(((profiles.data ?? []) as Array<{ id: string; full_name: string | null }>).map((row) => [row.id, row.full_name || "Ouder/verzorger"]));
  const scores = responseRows.map((row) => Number(row.score));

  return {
    campaigns: campaignRows,
    requests: requestRows,
    responses: responseRows,
    participants: participantRows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      guardianUserId: row.guardian_user_id,
      guardianName: names.get(row.guardian_user_id) ?? "Ouder/verzorger"
    })),
    metrics: {
      average: scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null,
      detractors: scores.filter((score) => score <= 6).length,
      open: requestRows.filter((row) => row.status === "open" && new Date(row.expires_at).getTime() > Date.now()).length,
      promoters: scores.filter((score) => score >= 9).length,
      responses: scores.length
    }
  };
}

export async function getParentFeedbackData() {
  const context = await requirePrivateShellContext("/portaal/feedback");
  return getParentFeedbackDataForContext(context);
}

export async function getParentFeedbackDataForContext(
  context: AuthenticatedTrustedAuthContext
) {
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const requests = await admin
    .from("feedback_survey_requests")
    .select("id, campaign_id, participant_id, status, requested_at, expires_at, completed_at")
    .eq("tenant_id", tenant.id)
    .eq("guardian_user_id", context.user.id)
    .order("requested_at", { ascending: false })
    .limit(100);
  assertResult(requests.error, "parent feedback requests");
  const requestRows = (requests.data ?? []) as Array<FeedbackRequest>;
  const campaignIds = [...new Set(requestRows.map((row) => row.campaign_id))];
  const participantIds = [...new Set(requestRows.map((row) => row.participant_id))];
  const [campaigns, participants, responses] = await Promise.all([
    campaignIds.length
      ? admin.from("tenant_feedback_campaigns").select("id, name, prompt, follow_up_question, trigger_type").eq("tenant_id", tenant.id).in("id", campaignIds)
      : Promise.resolve({ data: [], error: null }),
    participantIds.length
      ? admin.from("participants").select("id, display_name").eq("tenant_id", tenant.id).in("id", participantIds)
      : Promise.resolve({ data: [], error: null }),
    requestRows.length
      ? admin.from("feedback_survey_responses").select("id, request_id, score, comment, follow_up_allowed, submitted_at").eq("tenant_id", tenant.id).in("request_id", requestRows.map((row) => row.id))
      : Promise.resolve({ data: [], error: null })
  ]);
  assertResult(campaigns.error, "parent feedback campaigns");
  assertResult(participants.error, "parent feedback participants");
  assertResult(responses.error, "parent feedback responses");

  return {
    requests: requestRows,
    campaigns: campaigns.data ?? [],
    participants: participants.data ?? [],
    responses: responses.data ?? []
  };
}

function assertResult(error: { message: string } | null, source: string) {
  if (error) throw new Error(`Could not load ${source}: ${error.message}`);
}
