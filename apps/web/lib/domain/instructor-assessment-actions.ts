"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCanonicalSwimJourneys, getJourneyForEnrollment } from "./swim-progress";
import { parentJourneyView } from "./portal-journey-view";
import { latestJourneyObservations } from "./swim-assessment-order";
import { evaluateBadgeTriggerSet } from "./badge-engine";
import { createClient } from "@/lib/supabase/server";
import { getActiveTenant } from "./core";
import { assessmentUuid, assessmentRevision, parseInstructorAssessmentContext, parseInstructorAssessmentInput,
  type InstructorAssessmentContext, type InstructorAssessmentDraft, type InstructorAssessmentInput, type InstructorAssessmentResult, type InstructorAssessmentView } from "./instructor-assessment-contract";

async function actor(raw: InstructorAssessmentContext) {
  const input = parseInstructorAssessmentContext(raw), context = await requirePrivateShellContext(`/instructor/student/${input.participantId}`);
  const tenant = getActiveTenant(context);
  if (context.user.id !== input.actorId || tenant.id !== input.tenantId) throw new Error("assessment_review_access_denied");
  return { input, supabase: await createClient() };
}
const contextArgs = (input: InstructorAssessmentContext) => ({ p_tenant: input.tenantId, p_participant: input.participantId, p_enrollment: input.enrollmentId, p_item: input.itemId });
function failure(error: unknown): InstructorAssessmentResult<never> {
  unstable_rethrow(error);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/observation_conflict|revision_conflict|observation_changed|context_changed/.test(message)) return { ok: false, code: "conflict", message: "De beoordeling of het concept is intussen gewijzigd. Je invoer blijft staan. Vergelijk eerst met de actuele beoordeling." };
  if (/access_denied|session_denied|Insufficient/.test(message)) return { ok: false, code: "access", message: "Je hebt geen toegang meer tot deze leerling, inschrijving of handeling." };
  if (/other_client/.test(message)) return { ok: false, code: "conflict", message: "Er bestaat een concept uit een andere beoordelingsomgeving. Rond dat daar af voordat je hier verdergaat." };
  if (/already_published/.test(message)) return { ok: false, code: "conflict", message: "Er is al een compliment gepubliceerd bij deze beoordeling. De bestaande tekst is behouden." };
  if (/invalid|_required|immutable/.test(message)) return { ok: false, code: "invalid", message: "Controleer de score, eventuele correctiereden en bevestiging. Er is niets gepubliceerd." };
  return { ok: false, code: "unavailable", message: "De opslag is niet bevestigd. Je concept blijft staan; probeer opnieuw." };
}
function refresh(input: InstructorAssessmentContext) {
  for (const route of [`/instructor/student/${input.participantId}`, "/instructor", "/portaal", "/portaal/ontwikkeling", "/kind", "/kind/reis"]) revalidatePath(route);
}
export async function readInstructorAssessmentAction(raw: InstructorAssessmentContext): Promise<InstructorAssessmentResult<InstructorAssessmentView>> {
  try {
    const { input, supabase } = await actor(raw), result = await supabase.rpc("read_instructor_assessment_draft", { ...contextArgs(input), p_session: input.sessionId });
    if (result.error || !result.data) throw result.error ?? new Error("assessment_read_unavailable");
    return { ok: true, value: result.data as InstructorAssessmentView };
  } catch (error) { return failure(error); }
}
export async function saveInstructorAssessmentDraftAction(raw: InstructorAssessmentContext, content: InstructorAssessmentInput, revision: number): Promise<InstructorAssessmentResult<InstructorAssessmentDraft>> {
  try {
    const { input, supabase } = await actor(raw), value = parseInstructorAssessmentInput(content);
    const result = await supabase.rpc("save_instructor_assessment_draft", { ...contextArgs(input), p_session: input.sessionId, p_rating: value.rating, p_visibility: value.visibility,
      p_base_observation: value.baseObservationId, p_reason: value.correctionReason, p_expected_revision: assessmentRevision(revision, true) });
    if (result.error || !result.data) throw result.error ?? new Error("assessment_draft_unavailable");
    return { ok: true, value: result.data as InstructorAssessmentDraft };
  } catch (error) { return failure(error); }
}
export async function discardInstructorAssessmentDraftAction(raw: InstructorAssessmentContext, draft: string, revision: number): Promise<InstructorAssessmentResult<null>> {
  try {
    const { input, supabase } = await actor(raw), result = await supabase.rpc("discard_instructor_assessment_draft", { p_tenant: input.tenantId, p_draft: assessmentUuid(draft), p_revision: assessmentRevision(revision) });
    if (result.error) throw result.error;
    return { ok: true, value: null };
  } catch (error) { return failure(error); }
}
export async function finalizeInstructorAssessmentAction(raw: InstructorAssessmentContext, draft: string, revision: number, operation: string, confirmed: boolean): Promise<InstructorAssessmentResult<{ observationId: string; replayed: boolean; badgeEvaluationPending: boolean }>> {
  try {
    const { input, supabase } = await actor(raw), result = await supabase.rpc("finalize_instructor_assessment_draft", { ...contextArgs(input), p_draft: assessmentUuid(draft),
      p_revision: assessmentRevision(revision), p_operation: assessmentUuid(operation), p_confirmed: confirmed === true });
    if (result.error || !result.data) throw result.error ?? new Error("assessment_finalize_unavailable");
    const recorded = result.data as { observationId: string; replayed: boolean };
    const badgeConfirmed = await evaluateAssessmentBadges(input, recorded.observationId);
    refresh(input); return { ok: true, value: { ...recorded, badgeEvaluationPending: !badgeConfirmed } };
  } catch (error) { return failure(error); }
}
export async function publishChildComplimentAction(raw: InstructorAssessmentContext, observation: string, message: string, operation: string, confirmed: boolean): Promise<InstructorAssessmentResult<string>> {
  try {
    const { input, supabase } = await actor(raw), id = assessmentUuid(observation);
    if (typeof message !== "string" || !message.trim() || message.trim().length > 240) throw new Error("child_compliment_invalid");
    const bound = await supabase.from("swim_assessment_observations").select("id").eq("tenant_id", input.tenantId).eq("participant_id", input.participantId).eq("enrollment_id", input.enrollmentId).eq("curriculum_item_id", input.itemId).eq("id", id).maybeSingle();
    if (bound.error || !bound.data) throw new Error("assessment_review_access_denied");
    const result = await supabase.rpc("publish_swim_child_compliment", { p_tenant: input.tenantId, p_observation: id, p_message: message.trim(), p_operation: assessmentUuid(operation), p_confirmed: confirmed === true });
    if (result.error || !result.data) throw result.error ?? new Error("child_compliment_unavailable");
    refresh(input); return { ok: true, value: String(result.data) };
  } catch (error) { return failure(error); }
}

async function evaluateAssessmentBadges(input: InstructorAssessmentContext, observationId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const observed = await admin.from("swim_assessment_observations").select("rating,visibility,curriculum_version_id")
      .eq("tenant_id", input.tenantId).eq("participant_id", input.participantId).eq("enrollment_id", input.enrollmentId).eq("curriculum_item_id", input.itemId).eq("id", observationId).maybeSingle();
    if (observed.error || !observed.data) return false;
    if (observed.data.visibility !== "parent_visible") return true;
    // Reuse the parent-visible canonical projection. Internal observations must
    // not contribute indirectly to a public automatic badge count.
    const data = await loadCanonicalSwimJourneys({ tenantId: input.tenantId, enrollments: [{ id: input.enrollmentId, participant_id: input.participantId, curriculum_version_id: observed.data.curriculum_version_id }], parentVisibleOnly: true });
    const journey = getJourneyForEnrollment(data, input.enrollmentId);
    if (!journey) return false;
    const item = journey.items.find((row) => row.id === input.itemId);
    if (!item) return false;
    const current = latestJourneyObservations(journey.effectiveObservations).find((row) => row.curriculum_item_id === input.itemId);
    if (current?.id !== observationId || current.rating < item.mastery_threshold) return true;
    const count = parentJourneyView({ ...journey, currentStageItems: journey.items })!.nodes.filter((node) => node.completed).length;
    const eventContext = { count, entityId: observationId, skill: item.stable_key };
    // Existing immutable automatic badge batch and its in-app contract. No score
    // email, parent-message creation or child-compliment publication is invoked.
    const result = await evaluateBadgeTriggerSet({ tenantId: input.tenantId, participantId: input.participantId, events: [
      { eventType: "progress_item_completed", eventContext }, { eventType: "skill_completed", eventContext }
    ] });
    return result.confirmed;
  } catch { return false; }
}
