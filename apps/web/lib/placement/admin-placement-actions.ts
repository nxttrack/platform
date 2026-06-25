"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { queueDirectEventMessage } from "@/lib/communication/event-hooks";
import { detectAndStoreIntakeDuplicates } from "@/lib/smart-flow/intake-duplicates";
import { updateSmartDecisionLifecycle } from "@/lib/smart-flow/decision";
import { createPlacementSmartDecision } from "@/lib/smart-flow/placement-decision";
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
    preferred_days: string[];
    preferred_time_windows: string[];
    notes: string | null;
    recommendation_snapshot: Record<string, unknown>;
    stage_recommendation_decision_id: string | null;
  }>(
    supabase
      .from("intake_submissions")
      .select("id, program_id, parent_email, participant_name, participant_birthdate, preferred_days, preferred_time_windows, notes, recommendation_snapshot, stage_recommendation_decision_id")
      .eq("id", intakeId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const recommendedStageId = typeof intake.recommendation_snapshot.recommended_stage_id === "string" ? intake.recommendation_snapshot.recommended_stage_id : null;
  const overrideReason = optionalString(formData, "override_reason");

  if (selectedStageId && recommendedStageId && selectedStageId !== recommendedStageId && !overrideReason) {
    throw new Error("Geef een override-reden wanneer je afwijkt van het smart advies.");
  }

  await throwOnError(
    supabase.from("waitlist_entries").upsert(
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
  );

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
  const { supabase, tenantId } = await requireTenantWriter();
  const waitlistEntryId = requiredString(formData, "waitlist_entry_id");
  const groupId = requiredString(formData, "group_id");

  const waitlistEntry = await singleRow<{
    id: string;
    intake_submission_id: string | null;
    program_id: string;
    recommended_stage_id: string | null;
    preferred_days: string[];
    preferred_time_windows: string[];
  }>(
    supabase
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, preferred_days, preferred_time_windows")
      .eq("id", waitlistEntryId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const group = await singleRow<{ id: string; program_id: string; stage_id: string; resource_id: string | null; weekday: number; capacity: number; status: string }>(
    supabase.from("groups").select("id, program_id, stage_id, resource_id, weekday, capacity, status").eq("id", groupId).eq("tenant_id", tenantId).single()
  );

  if (group.status !== "active") {
    throw new Error("Deze groep is niet actief.");
  }

  if (group.program_id !== waitlistEntry.program_id) {
    throw new Error("Deze groep hoort niet bij het gekozen programma.");
  }

  const resource = group.resource_id
    ? await maybeRow<{ id: string; capacity: number }>(supabase.from("resources").select("id, capacity").eq("id", group.resource_id).eq("tenant_id", tenantId).maybeSingle())
    : null;
  const memberships = await rows<{ id: string; status: string; ends_on: string | null }>(
    supabase.from("group_memberships").select("id, status, ends_on").eq("group_id", group.id).eq("tenant_id", tenantId)
  );
  const today = todayInput();
  const activeMemberships = memberships.filter((membership) => ["planned", "active"].includes(membership.status) && (!membership.ends_on || membership.ends_on >= today)).length;
  const capacityLimit = Math.min(group.capacity, resource?.capacity ?? group.capacity);
  const availableSpots = Math.max(0, capacityLimit - activeMemberships);

  if (availableSpots <= 0) {
    throw new Error("Deze groep heeft geen beschikbare capaciteit.");
  }

  const preferredWeekday = weekdayToPreference(group.weekday);
  const dayMatch = waitlistEntry.preferred_days.includes(preferredWeekday);
  const stageMatch = !waitlistEntry.recommended_stage_id || waitlistEntry.recommended_stage_id === group.stage_id;
  const score = Math.min(100, 55 + (dayMatch ? 20 : 0) + (stageMatch ? 15 : 0) + Math.min(10, availableSpots * 2));
  const rationale = optionalString(formData, "rationale") ?? `Capaciteit beschikbaar (${availableSpots} plek${availableSpots === 1 ? "" : "ken"}).${dayMatch ? " Voorkeursdag matcht." : ""}${stageMatch ? " Stage matcht." : ""}`;

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
      score,
      capacity_snapshot: {
        group_capacity: group.capacity,
        resource_capacity: resource?.capacity ?? null,
        capacity_limit: capacityLimit,
        active_memberships: activeMemberships,
        available_spots: availableSpots
      },
      rationale,
      status: "suggested"
    })
    .select("id")
    .single();

  if (suggestionResult.error || !suggestionResult.data) {
    throw new Error(suggestionResult.error?.message ?? "Plaatsingsvoorstel kon niet worden aangemaakt.");
  }

  const suggestionId = (suggestionResult.data as { id: string }).id;
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
    activeMemberships,
    capacityLimit,
    availableSpots,
    resourceCapacity: resource?.capacity ?? null,
    score,
    rationale
  });

  await throwOnError(supabase.from("placement_suggestions").update({ smart_decision_id: smartDecisionId }).eq("id", suggestionId).eq("tenant_id", tenantId));

  await throwOnError(supabase.from("waitlist_entries").update({ status: "matched" }).eq("id", waitlistEntry.id).eq("tenant_id", tenantId));

  if (waitlistEntry.intake_submission_id) {
    await throwOnError(supabase.from("intake_submissions").update({ status: "matched" }).eq("id", waitlistEntry.intake_submission_id).eq("tenant_id", tenantId));
  }

  revalidatePlacementWorkflow();
}

export async function rejectPlacementSuggestionAction(formData: FormData) {
  const { supabase, tenantId, actorProfileId } = await requireTenantWriter();
  const suggestionId = requiredString(formData, "placement_suggestion_id");
  const suggestion = await singleRow<{ id: string; waitlist_entry_id: string; intake_submission_id: string | null }>(
    supabase.from("placement_suggestions").select("id, waitlist_entry_id, intake_submission_id").eq("id", suggestionId).eq("tenant_id", tenantId).single()
  );

  await throwOnError(supabase.from("placement_suggestions").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", suggestion.id).eq("tenant_id", tenantId));
  await throwOnError(supabase.from("waitlist_entries").update({ status: "queued" }).eq("id", suggestion.waitlist_entry_id).eq("tenant_id", tenantId));

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
  }>(
    supabase
      .from("placement_suggestions")
      .select("id, waitlist_entry_id, intake_submission_id, program_id, stage_id, group_id")
      .eq("id", suggestionId)
      .eq("tenant_id", tenantId)
      .single()
  );
  const token = crypto.randomUUID().replaceAll("-", "");
  const existingOffer = await maybeRow<{ id: string }>(supabase.from("slot_offers").select("id").eq("placement_suggestion_id", suggestion.id).eq("tenant_id", tenantId).maybeSingle());
  let offerId = existingOffer?.id ?? null;

  if (existingOffer) {
    await throwOnError(
      supabase
        .from("slot_offers")
        .update({
          offer_token: token,
          status: "sent",
          sent_at: new Date().toISOString(),
          expires_at: expiresAt(14),
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
        expires_at: expiresAt(14)
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

  await throwOnError(supabase.from("placement_suggestions").update({ status: "offered", reviewed_at: new Date().toISOString() }).eq("id", suggestion.id).eq("tenant_id", tenantId));
  await throwOnError(supabase.from("waitlist_entries").update({ status: "offered" }).eq("id", suggestion.waitlist_entry_id).eq("tenant_id", tenantId));

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
  const { supabase, tenantId } = await requireTenantWriter();
  const offerId = requiredString(formData, "slot_offer_id");

  await throwOnError(supabase.from("slot_offers").update({ status: "cancelled" }).eq("id", offerId).eq("tenant_id", tenantId));
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
