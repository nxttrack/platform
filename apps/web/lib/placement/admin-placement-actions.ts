"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { buildCapacitySnapshot, capacitySnapshotToRecord, capacitySummaryText, releaseExpiredCapacity, type CapacityHoldInput, type CapacityMembershipInput, type CapacitySnapshot } from "@/lib/capacity/capacity-engine";
import { queueDirectEventMessage } from "@/lib/communication/event-hooks";
import { detectAndStoreIntakeDuplicates } from "@/lib/smart-flow/intake-duplicates";
import { updateSmartDecisionLifecycle } from "@/lib/smart-flow/decision";
import { createPlacementSmartDecision } from "@/lib/smart-flow/placement-decision";
import { placementAssistantRuleVersion, scorePlacementMatch, type PlacementAssistantGroup, type PlacementAssistantInstructor, type PlacementAssistantResource, type PlacementAssistantWaitlistEntry, type PlacementSuggestedAction } from "@/lib/smart-flow/placement-assistant";
import { normalizeDuplicateRisk, scoreWaitlistEntry, upsertWaitlistSmartDecision, type WaitlistAdminPriority, type WaitlistDuplicateRisk, type WaitlistRankingEntryInput } from "@/lib/smart-flow/waitlist-ranking";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

export async function createWaitlistEntryFromIntakeAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const intakeId = requiredString(formData, "intake_submission_id");
  const selectedStageId = optionalString(formData, "recommended_stage_id");
  const intake = await singleRow<{
    id: string;
    program_id: string;
    parent_email: string;
    participant_name: string;
    participant_birthdate: string | null;
    intake_type: string;
    preferred_days: string[];
    preferred_time_windows: string[];
    notes: string | null;
    recommendation_snapshot: Record<string, unknown>;
    stage_recommendation_decision_id: string | null;
  }>(
    supabase
      .from("intake_submissions")
      .select("id, program_id, parent_email, participant_name, participant_birthdate, intake_type, preferred_days, preferred_time_windows, notes, recommendation_snapshot, stage_recommendation_decision_id")
      .eq("id", intakeId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const recommendedStageId = typeof intake.recommendation_snapshot.recommended_stage_id === "string" ? intake.recommendation_snapshot.recommended_stage_id : null;
  const overrideReason = optionalString(formData, "override_reason");

  if (selectedStageId && recommendedStageId && selectedStageId !== recommendedStageId && !overrideReason) {
    throw new Error("Geef een override-reden wanneer je afwijkt van het smart advies.");
  }

  const waitlistResult = await supabase
    .from("waitlist_entries")
    .upsert(
      {
        tenant_id: tenantId,
        intake_submission_id: intake.id,
        program_id: intake.program_id,
        recommended_stage_id: selectedStageId,
        status: "queued",
        priority_date: optionalString(formData, "priority_date") ?? todayInput(),
        preferred_days: intake.preferred_days ?? [],
        preferred_time_windows: intake.preferred_time_windows ?? [],
        source: "intake",
        notes: optionalString(formData, "notes") ?? intake.notes
      },
      { onConflict: "intake_submission_id" }
    )
    .select("id")
    .single();

  if (waitlistResult.error || !waitlistResult.data) {
    throw new Error(waitlistResult.error?.message ?? "Wachtlijstregel kon niet worden opgeslagen.");
  }

  const waitlistEntryId = (waitlistResult.data as { id: string }).id;
  await insertWaitlistEvent(supabase, tenantId, waitlistEntryId, "created", "Intake is omgezet naar een wachtlijstregel.", actorProfileId, { intake_submission_id: intake.id, intake_type: intake.intake_type });
  await refreshWaitlistScore(supabase, tenantId, waitlistEntryId, actorProfileId, "Wachtlijstscore berekend na intake-review.");

  await throwOnError(
    supabase
      .from("intake_submissions")
      .update({
        status: "reviewing",
        reviewed_at: new Date().toISOString(),
        reviewed_by_profile_id: actorProfileId,
        review_note: optionalString(formData, "notes") ?? null
      })
      .eq("id", intake.id)
      .eq("tenant_id", tenantId)
  );
  await throwOnError(
    supabase.from("intake_submission_events").insert({
      tenant_id: tenantId,
      submission_id: intake.id,
      status: "reviewing",
      note: selectedStageId && selectedStageId !== recommendedStageId ? `Naar wachtlijst met override: ${overrideReason}` : "Naar wachtlijst gezet op basis van smart advies."
    })
  );

  if (intake.stage_recommendation_decision_id) {
    await updateSmartDecisionLifecycle(supabase, {
      tenantId,
      engineKey: "intake_recommendation",
      subjectType: "intake_submission",
      subjectId: intake.id,
      decisionStatus: selectedStageId && selectedStageId !== recommendedStageId ? "overridden" : "applied",
      humanDecision: selectedStageId && selectedStageId !== recommendedStageId ? "overridden" : "applied",
      overrideReason,
      result: {
        waitlist_status: "queued",
        selected_stage_id: selectedStageId,
        recommended_stage_id: recommendedStageId
      },
      decidedByProfileId: actorProfileId
    });
  }

  revalidatePlacementWorkflow();
}

export async function refreshIntakeDuplicateMatchesAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const intakeId = requiredString(formData, "intake_submission_id");
  const intake = await singleRow<{ id: string; parent_email: string; participant_name: string; participant_birthdate: string | null }>(
    supabase.from("intake_submissions").select("id, parent_email, participant_name, participant_birthdate").eq("id", intakeId).eq("tenant_id", tenantId).single()
  );

  await detectAndStoreIntakeDuplicates(supabase, {
    tenantId,
    intakeSubmissionId: intake.id,
    participantName: intake.participant_name,
    participantBirthdate: intake.participant_birthdate,
    parentEmail: intake.parent_email
  });
  await throwOnError(
    supabase.from("intake_submission_events").insert({
      tenant_id: tenantId,
      submission_id: intake.id,
      status: "reviewing",
      note: "Duplicaatcontrole opnieuw uitgevoerd door admin."
    })
  );
  revalidatePlacementWorkflow();
}

export async function createPlacementSuggestionAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const waitlistEntryId = requiredString(formData, "waitlist_entry_id");
  const groupId = requiredString(formData, "group_id");
  const startDate = optionalString(formData, "start_date") ?? todayInput();
  const rationale = optionalString(formData, "rationale");

  await createPlacementSuggestionForMatch(supabase, tenantId, actorProfileId, {
    waitlistEntryId,
    groupId,
    assistantMode: "candidate_to_groups",
    startDate,
    rationale
  });

  revalidatePlacementWorkflow();
}

export async function createBatchPlacementSuggestionsAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const batchId = crypto.randomUUID();
  const startDate = optionalString(formData, "start_date") ?? todayInput();
  const assistantMode = optionalString(formData, "assistant_mode") === "group_to_candidates" ? "group_to_candidates" : "candidate_to_groups";
  const pairs = formData
    .getAll("match_pair")
    .flatMap((value) => (typeof value === "string" ? [value] : []))
    .map((value) => {
      const [waitlistEntryId, groupId] = value.split("::");

      return { waitlistEntryId, groupId };
    })
    .filter((pair) => pair.waitlistEntryId && pair.groupId);

  if (pairs.length === 0) {
    throw new Error("Selecteer minimaal één match voor batch-aanmaak.");
  }

  for (const pair of pairs.slice(0, 10)) {
    await createPlacementSuggestionForMatch(supabase, tenantId, actorProfileId, {
      waitlistEntryId: pair.waitlistEntryId,
      groupId: pair.groupId,
      assistantMode,
      startDate,
      batchId,
      eventType: "batch_created"
    });
  }

  revalidatePlacementWorkflow();
}

export async function rejectPlacementSuggestionAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const suggestionId = requiredString(formData, "placement_suggestion_id");
  const overrideReason = optionalString(formData, "override_reason");
  const suggestion = await singleRow<{ id: string; waitlist_entry_id: string; intake_submission_id: string | null }>(
    supabase.from("placement_suggestions").select("id, waitlist_entry_id, intake_submission_id").eq("id", suggestionId).eq("tenant_id", tenantId).single()
  );

  await throwOnError(
    supabase
      .from("placement_suggestions")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by_profile_id: actorProfileId,
        override_reason: overrideReason
      })
      .eq("id", suggestion.id)
      .eq("tenant_id", tenantId)
  );
  await throwOnError(supabase.from("waitlist_entries").update({ status: "queued" }).eq("id", suggestion.waitlist_entry_id).eq("tenant_id", tenantId));
  await insertWaitlistEvent(supabase, tenantId, suggestion.waitlist_entry_id, "placement_rejected", "Plaatsingsvoorstel afgewezen; kandidaat terug naar wachtrij.", actorProfileId, { placement_suggestion_id: suggestion.id });
  await insertPlacementSuggestionEvent(supabase, tenantId, suggestion.id, overrideReason ? "overridden" : "rejected", overrideReason ?? "Plaatsingsvoorstel afgewezen door admin.", actorProfileId, { waitlist_entry_status: "queued" });

  if (suggestion.intake_submission_id) {
    await throwOnError(supabase.from("intake_submissions").update({ status: "reviewing" }).eq("id", suggestion.intake_submission_id).eq("tenant_id", tenantId));
  }

  await updateSmartDecisionLifecycle(supabase, {
    tenantId,
    engineKey: "placement",
    subjectType: "placement_suggestion",
    subjectId: suggestion.id,
    decisionStatus: "rejected",
    humanDecision: "rejected",
    overrideReason,
    result: { waitlist_entry_status: "queued" },
    decidedByProfileId: actorProfileId
  });

  revalidatePlacementWorkflow();
}

export async function approvePlacementSuggestionAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const suggestionId = requiredString(formData, "placement_suggestion_id");
  const suggestion = await singleRow<{
    id: string;
    waitlist_entry_id: string;
    intake_submission_id: string | null;
    program_id: string;
    stage_id: string | null;
    group_id: string;
    suggested_action: string;
  }>(
    supabase
      .from("placement_suggestions")
      .select("id, waitlist_entry_id, intake_submission_id, program_id, stage_id, group_id, suggested_action")
      .eq("id", suggestionId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const existingOffer = await maybeRow<{ id: string }>(supabase.from("slot_offers").select("id").eq("placement_suggestion_id", suggestion.id).eq("tenant_id", tenantId).maybeSingle());
  const { group, snapshot } = await loadGroupCapacitySnapshot(supabase, tenantId, suggestion.group_id, existingOffer?.id ?? null);

  if (suggestion.suggested_action !== "offer_slot") {
    throw new Error("Deze suggestie heeft nog geen advies 'lesplek aanbieden'. Gebruik eerst handmatige review of maak een betere match.");
  }

  if (group.program_id !== suggestion.program_id) {
    throw new Error("Deze groep hoort niet bij het programma van het plaatsingsvoorstel.");
  }

  if (!snapshot.isAvailable) {
    throw new Error(capacityUnavailableMessage(snapshot));
  }

  const token = crypto.randomUUID().replaceAll("-", "");
  const offerExpiresAt = expiresAt(14);
  let offerId = existingOffer?.id ?? null;

  if (existingOffer) {
    await throwOnError(
      supabase
        .from("slot_offers")
        .update({
          offer_token: token,
          status: "sent",
          sent_at: new Date().toISOString(),
          expires_at: offerExpiresAt,
          parent_responded_at: null,
          parent_response_note: null
        })
        .eq("id", existingOffer.id)
        .eq("tenant_id", tenantId)
    );
  } else {
    const offerResult = await supabase
      .from("slot_offers")
      .insert({
        tenant_id: tenantId,
        placement_suggestion_id: suggestion.id,
        waitlist_entry_id: suggestion.waitlist_entry_id,
        intake_submission_id: suggestion.intake_submission_id,
        program_id: suggestion.program_id,
        stage_id: suggestion.stage_id,
        group_id: suggestion.group_id,
        offer_token: token,
        status: "sent",
        expires_at: offerExpiresAt
      })
      .select("id")
      .single();

    if (offerResult.error || !offerResult.data) {
      throw new Error(offerResult.error?.message ?? "Slot offer kon niet worden aangemaakt.");
    }

    offerId = offerResult.data.id as string;
  }

  if (!offerId) {
    const offer = await singleRow<{ id: string }>(supabase.from("slot_offers").select("id").eq("placement_suggestion_id", suggestion.id).eq("tenant_id", tenantId).single());
    offerId = offer.id;
  }

  await upsertCapacityHoldForSlotOffer(supabase, tenantId, {
    offerId,
    suggestionId: suggestion.id,
    groupId: suggestion.group_id,
    expiresAt: offerExpiresAt,
    actorProfileId,
    capacitySnapshot: snapshot
  });

  await throwOnError(supabase.from("placement_suggestions").update({ status: "offered", reviewed_at: new Date().toISOString(), reviewed_by_profile_id: actorProfileId }).eq("id", suggestion.id).eq("tenant_id", tenantId));
  await throwOnError(supabase.from("waitlist_entries").update({ status: "offered" }).eq("id", suggestion.waitlist_entry_id).eq("tenant_id", tenantId));
  await insertWaitlistEvent(supabase, tenantId, suggestion.waitlist_entry_id, "slot_offered", "Lesplek-aanbod is verstuurd; capaciteit wordt tijdelijk vastgehouden.", actorProfileId, { placement_suggestion_id: suggestion.id, slot_offer_id: offerId });
  await insertPlacementSuggestionEvent(supabase, tenantId, suggestion.id, "approved", "Plaatsingsvoorstel goedgekeurd door admin.", actorProfileId, { slot_offer_id: offerId });
  await insertPlacementSuggestionEvent(supabase, tenantId, suggestion.id, "offer_sent", "Lesplek-aanbod verstuurd naar ouder.", actorProfileId, { slot_offer_id: offerId, expires_at: offerExpiresAt });

  if (suggestion.intake_submission_id) {
    await throwOnError(supabase.from("intake_submissions").update({ status: "slot_offered" }).eq("id", suggestion.intake_submission_id).eq("tenant_id", tenantId));
  }

  await maybeInsertEvent(supabase, tenantId, suggestion.id, "sent", "Slot offer sent from admin approval.");
  await maybeQueueSlotOfferMessage(supabase, tenantId, offerId, token, suggestion.intake_submission_id);
  await updateSmartDecisionLifecycle(supabase, {
    tenantId,
    engineKey: "placement",
    subjectType: "placement_suggestion",
    subjectId: suggestion.id,
    decisionStatus: "approved",
    humanDecision: "approved",
    result: { slot_offer_id: offerId, slot_offer_status: "sent" },
    decidedByProfileId: actorProfileId
  });
  revalidatePlacementWorkflow();
}

export async function cancelSlotOfferAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const offerId = requiredString(formData, "slot_offer_id");
  const offer = await singleRow<{ waitlist_entry_id: string }>(supabase.from("slot_offers").select("waitlist_entry_id").eq("id", offerId).eq("tenant_id", tenantId).single());

  await throwOnError(supabase.from("slot_offers").update({ status: "cancelled" }).eq("id", offerId).eq("tenant_id", tenantId));
  await releaseCapacityHoldForSlotOffer(supabase, tenantId, offerId, "cancelled", "slot offer cancelled by admin");
  await insertWaitlistEvent(supabase, tenantId, offer.waitlist_entry_id, "cancelled", "Lesplek-aanbod geannuleerd; capaciteitshold vrijgegeven.", actorProfileId, { slot_offer_id: offerId });
  revalidatePlacementWorkflow();
}

export async function updateWaitlistPriorityAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const waitlistEntryId = requiredString(formData, "waitlist_entry_id");
  const adminPriority = requiredString(formData, "admin_priority") as WaitlistAdminPriority;
  const priorityReason = optionalString(formData, "priority_reason");
  const urgencyReason = optionalString(formData, "urgency_reason");
  const tenantReasonCode = optionalString(formData, "tenant_reason_code");

  if (!["low", "normal", "high", "urgent"].includes(adminPriority)) {
    throw new Error("Onbekende prioriteit.");
  }

  if (adminPriority !== "normal" && !priorityReason) {
    throw new Error("Geef een prioriteitsreden bij een handmatige override.");
  }

  await throwOnError(
    supabase
      .from("waitlist_entries")
      .update({
        admin_priority: adminPriority,
        priority_reason: priorityReason,
        urgency_reason: urgencyReason,
        tenant_reason_code: tenantReasonCode
      })
      .eq("tenant_id", tenantId)
      .eq("id", waitlistEntryId)
  );

  await insertWaitlistEvent(supabase, tenantId, waitlistEntryId, "priority_updated", "Admin-prioriteit aangepast.", actorProfileId, { admin_priority: adminPriority, priority_reason: priorityReason, urgency_reason: urgencyReason, tenant_reason_code: tenantReasonCode });
  await refreshWaitlistScore(supabase, tenantId, waitlistEntryId, actorProfileId, "Wachtlijstscore herberekend na prioriteitswijziging.");

  if (adminPriority !== "normal") {
    await updateSmartDecisionLifecycle(supabase, {
      tenantId,
      engineKey: "waitlist",
      subjectType: "waitlist_entry",
      subjectId: waitlistEntryId,
      decisionStatus: "overridden",
      humanDecision: "overridden",
      overrideReason: priorityReason,
      result: {
        admin_priority: adminPriority,
        urgency_reason: urgencyReason,
        tenant_reason_code: tenantReasonCode
      },
      decidedByProfileId: actorProfileId
    });
  }

  revalidatePlacementWorkflow();
}

export async function recordWaitlistContactAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const waitlistEntryId = requiredString(formData, "waitlist_entry_id");
  const channel = requiredString(formData, "last_contact_channel");
  const note = optionalString(formData, "contact_note");

  if (!["internal", "email", "phone", "sms", "whatsapp", "manual"].includes(channel)) {
    throw new Error("Onbekend contactkanaal.");
  }

  await throwOnError(
    supabase
      .from("waitlist_entries")
      .update({
        last_contacted_at: new Date().toISOString(),
        last_contact_channel: channel
      })
      .eq("tenant_id", tenantId)
      .eq("id", waitlistEntryId)
  );
  await insertWaitlistEvent(supabase, tenantId, waitlistEntryId, "contacted", note ?? "Contactmoment geregistreerd.", actorProfileId, { channel });
  revalidatePlacementWorkflow();
}

export async function reevaluateWaitlistEntryAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const waitlistEntryId = requiredString(formData, "waitlist_entry_id");

  await refreshWaitlistScore(supabase, tenantId, waitlistEntryId, actorProfileId, "Wachtlijstscore handmatig herberekend.");
  revalidatePlacementWorkflow();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om deze tenantdata te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    actorProfileId: context.user.id
  };
}

async function createPlacementSuggestionForMatch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  actorProfileId: string,
  input: {
    waitlistEntryId: string;
    groupId: string;
    assistantMode: "candidate_to_groups" | "group_to_candidates";
    startDate: string;
    rationale?: string | null;
    batchId?: string | null;
    eventType?: "created" | "batch_created";
  }
) {
  const waitlistEntry = await singleRow<PlacementAssistantWaitlistEntry>(
    supabase
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, status, priority_date, preferred_days, preferred_time_windows, source, admin_priority, priority_reason, urgency_reason, tenant_reason_code, family_key, sibling_participant_id, duplicate_risk, waitlist_score, score_reasons, created_at")
      .eq("id", input.waitlistEntryId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const { group, resource, snapshot } = await loadGroupCapacitySnapshot(supabase, tenantId, input.groupId);
  const instructor = group.instructor_id ? await maybeRow<PlacementAssistantInstructor>(supabase.from("instructors").select("id, display_name, status").eq("tenant_id", tenantId).eq("id", group.instructor_id).maybeSingle()) : null;
  const match = scorePlacementMatch({
    mode: input.assistantMode,
    entry: waitlistEntry,
    group,
    capacity: snapshot,
    resource,
    instructor,
    startDate: input.startDate
  });
  const rationale = input.rationale ?? match.rationale;
  const suggestionResult = await supabase
    .from("placement_suggestions")
    .insert({
      tenant_id: tenantId,
      waitlist_entry_id: waitlistEntry.id,
      intake_submission_id: waitlistEntry.intake_submission_id,
      program_id: waitlistEntry.program_id,
      stage_id: group.stage_id,
      group_id: group.id,
      resource_id: group.resource_id,
      score: match.score,
      capacity_snapshot: capacitySnapshotToRecord(snapshot),
      rationale,
      status: "suggested",
      assistant_mode: input.assistantMode,
      suggested_action: match.suggestedAction,
      match_reasons: match.reasons,
      match_blockers: match.blockers,
      match_snapshot: match.snapshot,
      start_date: input.startDate,
      batch_id: input.batchId ?? null,
      assistant_metadata: {
        rule_version: placementAssistantRuleVersion,
        instructor_id: group.instructor_id,
        resource_status: resource?.status ?? null,
        source: "placement_assistant_2"
      }
    })
    .select("id")
    .single();

  if (suggestionResult.error || !suggestionResult.data) {
    throw new Error(suggestionResult.error?.message ?? "Plaatsingsvoorstel kon niet worden aangemaakt.");
  }

  const suggestionId = (suggestionResult.data as { id: string }).id;
  const preferredWeekday = weekdayToPreference(group.weekday);
  const dayMatch = waitlistEntry.preferred_days.includes(preferredWeekday);
  const stageMatch = !waitlistEntry.recommended_stage_id || waitlistEntry.recommended_stage_id === group.stage_id;
  const smartDecisionId = await createPlacementSmartDecision(supabase, {
    tenantId,
    suggestionId,
    waitlistEntryId: waitlistEntry.id,
    intakeSubmissionId: waitlistEntry.intake_submission_id,
    programId: waitlistEntry.program_id,
    recommendedStageId: waitlistEntry.recommended_stage_id,
    group,
    preferredWeekday,
    preferredDays: waitlistEntry.preferred_days,
    preferredTimeWindows: waitlistEntry.preferred_time_windows,
    dayMatch,
    stageMatch,
    activeMemberships: snapshot.activeMemberships,
    capacityLimit: snapshot.capacityLimit,
    availableSpots: snapshot.availableSpots,
    resourceCapacity: resource?.capacity ?? null,
    capacitySnapshot: snapshot,
    score: match.score,
    rationale,
    waitlistScore: waitlistEntry.waitlist_score,
    waitlistReasons: waitlistEntry.score_reasons,
    assistantMode: input.assistantMode,
    suggestedAction: match.suggestedAction,
    matchReasons: match.reasons,
    matchBlockers: match.blockers,
    matchSnapshot: match.snapshot
  });

  await throwOnError(supabase.from("placement_suggestions").update({ smart_decision_id: smartDecisionId }).eq("id", suggestionId).eq("tenant_id", tenantId));
  await insertPlacementSuggestionEvent(supabase, tenantId, suggestionId, input.eventType ?? "created", input.eventType === "batch_created" ? "Batch plaatsingsvoorstel aangemaakt." : "Plaatsingsvoorstel aangemaakt vanuit Placement Assistant 2.0.", actorProfileId, {
    group_id: group.id,
    waitlist_entry_id: waitlistEntry.id,
    score: match.score,
    suggested_action: match.suggestedAction,
    smart_decision_id: smartDecisionId,
    batch_id: input.batchId ?? null
  });
  await insertPlacementActionEvent(supabase, tenantId, suggestionId, match.suggestedAction, actorProfileId, { score: match.score });

  if (match.suggestedAction === "offer_slot" || match.suggestedAction === "manual_review") {
    await throwOnError(supabase.from("waitlist_entries").update({ status: "matched" }).eq("id", waitlistEntry.id).eq("tenant_id", tenantId));
    await insertWaitlistEvent(supabase, tenantId, waitlistEntry.id, "placement_suggested", "Plaatsingsvoorstel aangemaakt vanuit de wachtlijst.", actorProfileId, { placement_suggestion_id: suggestionId, group_id: group.id, score: match.score, suggested_action: match.suggestedAction });

    if (waitlistEntry.intake_submission_id) {
      await throwOnError(supabase.from("intake_submissions").update({ status: "matched" }).eq("id", waitlistEntry.intake_submission_id).eq("tenant_id", tenantId));
    }
  }

  return suggestionId;
}

async function insertPlacementActionEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  suggestionId: string,
  action: PlacementSuggestedAction,
  actorProfileId: string | null,
  metadata: Record<string, unknown>
) {
  if (action === "offer_slot") {
    return;
  }

  const eventType = action === "request_more_info" ? "request_more_info" : action === "keep_waiting" ? "keep_waiting" : "manual_review";
  const note = action === "request_more_info" ? "Assistant adviseert meer informatie te vragen." : action === "keep_waiting" ? "Assistant adviseert kandidaat te laten wachten." : "Assistant adviseert handmatige review.";

  await insertPlacementSuggestionEvent(supabase, tenantId, suggestionId, eventType, note, actorProfileId, metadata);
}

async function refreshWaitlistScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  waitlistEntryId: string,
  actorProfileId: string | null,
  note: string
) {
  const entry = await singleRow<
    WaitlistRankingEntryInput & {
      intake_submission_id: string | null;
      waitlist_score: number | null;
    }
  >(
    supabase
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, priority_date, preferred_days, preferred_time_windows, source, admin_priority, priority_reason, urgency_reason, tenant_reason_code, family_key, sibling_participant_id, duplicate_risk, created_at, waitlist_score")
      .eq("tenant_id", tenantId)
      .eq("id", waitlistEntryId)
      .single()
  );
  const intake = entry.intake_submission_id
    ? await maybeRow<{ intake_type: string }>(supabase.from("intake_submissions").select("intake_type").eq("tenant_id", tenantId).eq("id", entry.intake_submission_id).maybeSingle())
    : null;
  const duplicateMatches = entry.intake_submission_id
    ? await rows<{ severity: string; score: number }>(
        supabase
          .from("intake_duplicate_matches")
          .select("severity, score")
          .eq("tenant_id", tenantId)
          .eq("intake_submission_id", entry.intake_submission_id)
          .eq("status", "open")
      )
    : [];
  const duplicateRisk = duplicateRiskFromMatches(duplicateMatches, entry.duplicate_risk);
  const ranking = scoreWaitlistEntry({
    entry: {
      ...entry,
      duplicate_risk: duplicateRisk,
      intake_type: intake?.intake_type ?? entry.source
    }
  });
  const smartDecisionId = await upsertWaitlistSmartDecision(supabase, {
    tenantId,
    waitlistEntryId,
    ranking,
    result: {
      waitlist_score: ranking.score,
      duplicate_risk: duplicateRisk
    },
    metadata: {
      duplicate_match_count: duplicateMatches.length
    }
  });

  await throwOnError(
    supabase
      .from("waitlist_entries")
      .update({
        waitlist_score: ranking.score,
        score_reasons: ranking.reasons,
        score_snapshot: ranking.snapshot,
        smart_decision_id: smartDecisionId,
        duplicate_risk: duplicateRisk,
        evaluated_at: new Date().toISOString(),
        reevaluation_requested_at: null
      })
      .eq("tenant_id", tenantId)
      .eq("id", waitlistEntryId)
  );
  await insertWaitlistEvent(supabase, tenantId, waitlistEntryId, "scored", note, actorProfileId, {
    score: ranking.score,
    confidence: ranking.confidence,
    duplicate_risk: duplicateRisk,
    smart_decision_id: smartDecisionId
  });

  return ranking;
}

function duplicateRiskFromMatches(matches: { severity: string }[], currentRisk: string | null | undefined): WaitlistDuplicateRisk {
  if (matches.some((match) => match.severity === "blocking")) {
    return "blocking";
  }

  if (matches.length > 0) {
    return "warning";
  }

  if (currentRisk === "blocking" || currentRisk === "warning") {
    return normalizeDuplicateRisk(currentRisk);
  }

  return "none";
}

async function insertWaitlistEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  waitlistEntryId: string,
  eventType: string,
  note: string,
  actorProfileId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await throwOnError(
    supabase.from("waitlist_entry_events").insert({
      tenant_id: tenantId,
      waitlist_entry_id: waitlistEntryId,
      event_type: eventType,
      note,
      created_by_profile_id: actorProfileId,
      metadata
    })
  );
}

async function insertPlacementSuggestionEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  placementSuggestionId: string,
  eventType: string,
  note: string,
  actorProfileId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await throwOnError(
    supabase.from("placement_suggestion_events").insert({
      tenant_id: tenantId,
      placement_suggestion_id: placementSuggestionId,
      event_type: eventType,
      note,
      created_by_profile_id: actorProfileId,
      metadata
    })
  );
}

async function maybeInsertEvent(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, suggestionId: string, eventType: string, note: string) {
  const offer = await maybeRow<{ id: string }>(supabase.from("slot_offers").select("id").eq("placement_suggestion_id", suggestionId).eq("tenant_id", tenantId).maybeSingle());

  if (offer) {
    await throwOnError(supabase.from("slot_offer_events").insert({ tenant_id: tenantId, slot_offer_id: offer.id, event_type: eventType, note }));
  }
}

async function maybeQueueSlotOfferMessage(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, offerId: string, offerToken: string, intakeSubmissionId: string | null) {
  if (!intakeSubmissionId) {
    return;
  }

  const intake = await maybeRow<{ parent_name: string; parent_email: string; participant_name: string }>(
    supabase
      .from("intake_submissions")
      .select("parent_name, parent_email, participant_name")
      .eq("tenant_id", tenantId)
      .eq("id", intakeSubmissionId)
      .maybeSingle()
  );

  if (!intake?.parent_email) {
    return;
  }

  const slotOfferUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://staging.nxttrack.nl"}/slot-offers/${offerToken}`;
  await queueDirectEventMessage(supabase, {
    tenantId,
    recipientEmail: intake.parent_email,
    recipientName: intake.parent_name,
    eventKey: "slot_offer_sent",
    templateCode: "slot-offer-sent",
    context: {
      parent_name: intake.parent_name,
      participant_name: intake.participant_name,
      slot_offer_url: slotOfferUrl
    },
    sourceTable: "slot_offers",
    sourceRecordId: offerId,
    fallbackSubject: `Er is een plek beschikbaar voor ${intake.participant_name}`,
    fallbackBody: `Hallo ${intake.parent_name},\n\nEr is een plek beschikbaar. Bevestig via ${slotOfferUrl}.\n\nNXTTRACK`
  });
}

type CapacityGroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  reserved_spots: number;
  trial_spots: number;
  makeup_spots: number;
  overbooking_policy: string;
  status: string;
};

type CapacityResourceRow = {
  id: string;
  name?: string;
  capacity: number;
  status: string;
};

async function loadGroupCapacitySnapshot(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, groupId: string, excludeHoldSlotOfferId: string | null = null) {
  await releaseExpiredCapacity(supabase, tenantId);

  const group = await singleRow<CapacityGroupRow>(
    supabase
      .from("groups")
      .select("id, program_id, stage_id, resource_id, instructor_id, weekday, starts_at, ends_at, capacity, reserved_spots, trial_spots, makeup_spots, overbooking_policy, status")
      .eq("id", groupId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const [resource, memberships, holds, slotOffers] = await Promise.all([
    group.resource_id ? maybeRow<CapacityResourceRow>(supabase.from("resources").select("id, name, capacity, status").eq("id", group.resource_id).eq("tenant_id", tenantId).maybeSingle()) : Promise.resolve(null),
    rows<CapacityMembershipInput>(supabase.from("group_memberships").select("id, group_id, status, starts_on, ends_on").eq("group_id", group.id).eq("tenant_id", tenantId)),
    rows<CapacityHoldInput>(supabase.from("capacity_holds").select("id, group_id, hold_type, status, quantity, starts_on, ends_on, expires_at, slot_offer_id, release_reason").eq("group_id", group.id).eq("tenant_id", tenantId)),
    rows<{ id: string; group_id: string; status: string; expires_at: string }>(supabase.from("slot_offers").select("id, group_id, status, expires_at").eq("group_id", group.id).eq("tenant_id", tenantId))
  ]);
  const snapshot = buildCapacitySnapshot({
    group,
    resource,
    memberships,
    holds,
    slotOffers,
    excludeHoldSlotOfferId
  });

  return { group, resource, snapshot };
}

async function upsertCapacityHoldForSlotOffer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  input: {
    offerId: string;
    suggestionId: string;
    groupId: string;
    expiresAt: string;
    actorProfileId: string;
    capacitySnapshot: CapacitySnapshot;
  }
) {
  const existingHold = await maybeRow<{ id: string }>(supabase.from("capacity_holds").select("id").eq("tenant_id", tenantId).eq("slot_offer_id", input.offerId).eq("status", "active").maybeSingle());
  const payload = {
    tenant_id: tenantId,
    group_id: input.groupId,
    placement_suggestion_id: input.suggestionId,
    slot_offer_id: input.offerId,
    hold_type: "slot_offer",
    status: "active",
    quantity: 1,
    starts_on: todayInput(),
    expires_at: input.expiresAt,
    released_at: null,
    release_reason: null,
    created_by_profile_id: input.actorProfileId,
    metadata: {
      source: "placement_approval",
      capacity_snapshot: capacitySnapshotToRecord(input.capacitySnapshot)
    }
  };

  if (existingHold) {
    await throwOnError(supabase.from("capacity_holds").update(payload).eq("tenant_id", tenantId).eq("id", existingHold.id));
    return;
  }

  await throwOnError(supabase.from("capacity_holds").insert(payload));
}

async function releaseCapacityHoldForSlotOffer(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, offerId: string, status: "released" | "expired" | "cancelled" | "converted", reason: string) {
  await throwOnError(
    supabase
      .from("capacity_holds")
      .update({
        status,
        released_at: new Date().toISOString(),
        release_reason: reason
      })
      .eq("tenant_id", tenantId)
      .eq("slot_offer_id", offerId)
      .eq("status", "active")
  );
}

function capacityUnavailableMessage(snapshot: CapacitySnapshot) {
  const blocker = snapshot.blockers.find((entry) => entry.severity === "blocking");

  return blocker ? `${blocker.label}: ${blocker.detail}` : `Deze groep heeft geen beschikbare capaciteit (${capacitySummaryText(snapshot)}).`;
}

function revalidatePlacementWorkflow() {
  for (const path of ["/admin/intake", "/admin/wachtlijst", "/admin/plaatsingsvoorstellen", "/admin/slot-offers", "/admin/enrollments", "/admin/leerlingen"]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

async function singleRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Record niet gevonden.");
  }

  return data as Row;
}

async function maybeRow<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row | null> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  return data ? (data as Row) : null;
}

async function rows<Row>(builder: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await builder;

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as Row[]) : [];
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

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function expiresAt(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString();
}

function weekdayToPreference(weekday: number) {
  const values = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  return values[weekday - 1] ?? "monday";
}
