"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { buildDiplomaReadinessDraft, type DiplomaReadinessDraft } from "@/lib/afzwem/diploma-readiness-engine";
import { queueParentEventMessages } from "@/lib/communication/event-hooks";
import { updateSmartDecisionLifecycle } from "@/lib/smart-flow/decision";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

export async function createAfzwemEventAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("milestone_events").insert({
      tenant_id: tenantId,
      program_id: requiredString(formData, "program_id"),
      stage_id: optionalString(formData, "stage_id"),
      resource_id: optionalString(formData, "resource_id"),
      event_type: "afzwem",
      title: requiredString(formData, "title"),
      description: optionalString(formData, "description"),
      starts_at: requiredDateTime(formData, "starts_at"),
      ends_at: requiredDateTime(formData, "ends_at"),
      capacity: intValue(formData, "capacity", 1, 1),
      status: enumValue(formData, "status", ["draft", "scheduled", "completed", "cancelled"], "scheduled")
    })
  );

  revalidateAfzwem();
}

export async function evaluateDiplomaReadinessRadarAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const requestedEnrollmentId = optionalString(formData, "enrollment_id");
  const enrollments = requestedEnrollmentId
    ? [{ id: requestedEnrollmentId }]
    : await rows<{ id: string }>(
        supabase
          .from("enrollments")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("status", ["active", "paused"])
          .order("started_on", { ascending: true })
          .limit(80)
      );

  if (enrollments.length === 0) {
    throw new Error("Geen actieve inschrijvingen gevonden voor de afzwem radar.");
  }

  for (const enrollment of enrollments) {
    const draft = await buildDiplomaReadinessDraft(supabase, {
      tenantId,
      enrollmentId: enrollment.id
    });
    const radarId = await upsertDiplomaReadinessRadar(supabase, tenantId, profileId, draft);

    await throwOnError(
      supabase
        .from("afzwem_event_candidate_suggestions")
        .update({ suggested_status: "expired", reviewed_by_profile_id: profileId, reviewed_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("readiness_radar_id", radarId)
        .eq("suggested_status", "candidate")
    );

    if (draft.candidateSuggestions.length > 0) {
      await throwOnError(
        supabase.from("afzwem_event_candidate_suggestions").upsert(
          draft.candidateSuggestions.map((suggestion) => ({
            tenant_id: tenantId,
            readiness_radar_id: radarId,
            milestone_event_id: suggestion.milestoneEventId,
            enrollment_id: draft.enrollment.id,
            participant_id: draft.enrollment.participant_id,
            program_id: draft.enrollment.program_id,
            score: suggestion.score,
            confidence: suggestion.confidence,
            capacity_snapshot: suggestion.capacitySnapshot,
            reasons: suggestion.reasons,
            blockers: suggestion.blockers,
            suggested_status: suggestion.suggestedStatus,
            reviewed_by_profile_id: null,
            reviewed_at: null
          })),
          { onConflict: "tenant_id,readiness_radar_id,milestone_event_id" }
        )
      );
    }

    await insertReadinessEvent(supabase, tenantId, radarId, "evaluated", "Afzwem radar opnieuw berekend.", profileId, {
      enrollment_id: draft.enrollment.id,
      score: draft.score,
      readiness_status: draft.readinessStatus,
      recommended_event_id: draft.recommendedEventId
    });
  }

  revalidateAfzwem();
}

export async function reviewDiplomaReadinessAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const radarId = requiredString(formData, "readiness_radar_id");
  const readinessStatus = enumValue(formData, "readiness_status", ["not_ready", "almost_ready", "ready_for_review"], "ready_for_review");
  const reviewNote = optionalString(formData, "review_note");

  if (readinessStatus === "not_ready" && !reviewNote) {
    throw new Error("Een afwijzing naar niet klaar heeft verplicht een reviewreden nodig.");
  }

  const radar = await singleRow<{ id: string; enrollment_id: string; smart_decision_id: string | null }>(
    supabase
      .from("diploma_readiness_radar")
      .select("id, enrollment_id, smart_decision_id")
      .eq("tenant_id", tenantId)
      .eq("id", radarId)
      .single()
  );

  await throwOnError(
    supabase
      .from("diploma_readiness_radar")
      .update({
        readiness_status: readinessStatus,
        review_note: reviewNote,
        reviewed_by_profile_id: profileId,
        reviewed_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", radar.id)
  );

  await updateSmartDecisionLifecycle(supabase, {
    tenantId,
    engineKey: "diploma_readiness",
    subjectType: "enrollment",
    subjectId: radar.enrollment_id,
    decisionStatus: readinessStatus === "not_ready" ? "rejected" : readinessStatus === "ready_for_review" ? "approved" : "recommended",
    humanDecision: readinessStatus === "not_ready" ? "rejected" : readinessStatus === "ready_for_review" ? "approved" : undefined,
    overrideReason: readinessStatus === "not_ready" ? reviewNote : null,
    decidedByProfileId: profileId,
    result: {
      readiness_status: readinessStatus,
      review_note: reviewNote
    }
  });
  await insertReadinessEvent(supabase, tenantId, radar.id, "reviewed", reviewNote ?? `Radarstatus aangepast naar ${readinessStatus}.`, profileId, {
    readiness_status: readinessStatus
  });

  revalidateAfzwem();
}

export async function inviteReadinessCandidateAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const radarId = requiredString(formData, "readiness_radar_id");
  const milestoneEventId = requiredString(formData, "milestone_event_id");
  const candidateSuggestionId = optionalString(formData, "candidate_suggestion_id");
  const note = optionalString(formData, "note");
  const radar = await singleRow<{
    id: string;
    enrollment_id: string;
    participant_id: string;
    program_id: string;
    readiness_criteria_id: string | null;
    readiness_status: string;
    score: number | null;
  }>(
    supabase
      .from("diploma_readiness_radar")
      .select("id, enrollment_id, participant_id, program_id, readiness_criteria_id, readiness_status, score")
      .eq("tenant_id", tenantId)
      .eq("id", radarId)
      .single()
  );

  if (!["almost_ready", "ready_for_review", "invited"].includes(radar.readiness_status) && !note) {
    throw new Error("Deze leerling is nog niet klaar voor uitnodiging. Vul een override reden in om toch uit te nodigen.");
  }

  const reminderAt = addDaysIso(7);
  const { data, error } = await supabase
    .from("milestone_event_participants")
    .upsert(
      {
        tenant_id: tenantId,
        milestone_event_id: milestoneEventId,
        enrollment_id: radar.enrollment_id,
        participant_id: radar.participant_id,
        readiness_criteria_id: radar.readiness_criteria_id,
        diploma_readiness_radar_id: radar.id,
        invited_by_profile_id: profileId,
        status: "invited",
        note,
        invited_at: new Date().toISOString(),
        invitation_reminder_at: reminderAt,
        invitation_reminder_status: "scheduled"
      },
      { onConflict: "tenant_id,milestone_event_id,enrollment_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Afzwemuitnodiging kon niet worden opgeslagen.");
  }

  const eventParticipantId = (data as { id: string }).id;
  await throwOnError(
    supabase
      .from("diploma_readiness_radar")
      .update({
        readiness_status: "invited",
        recommended_event_id: milestoneEventId,
        milestone_event_participant_id: eventParticipantId,
        reviewed_by_profile_id: profileId,
        reviewed_at: new Date().toISOString(),
        review_note: note
      })
      .eq("tenant_id", tenantId)
      .eq("id", radar.id)
  );

  if (candidateSuggestionId) {
    await throwOnError(
      supabase
        .from("afzwem_event_candidate_suggestions")
        .update({
          suggested_status: "invited",
          review_note: note,
          reviewed_by_profile_id: profileId,
          reviewed_at: new Date().toISOString()
        })
        .eq("tenant_id", tenantId)
        .eq("id", candidateSuggestionId)
    );
  }

  await maybeQueueAfzwemInvitationMessage(supabase, tenantId, milestoneEventId, radar.enrollment_id, radar.participant_id, profileId);
  await updateSmartDecisionLifecycle(supabase, {
    tenantId,
    engineKey: "diploma_readiness",
    subjectType: "enrollment",
    subjectId: radar.enrollment_id,
    decisionStatus: note && !["almost_ready", "ready_for_review", "invited"].includes(radar.readiness_status) ? "overridden" : "approved",
    humanDecision: note && !["almost_ready", "ready_for_review", "invited"].includes(radar.readiness_status) ? "overridden" : "approved",
    overrideReason: note && !["almost_ready", "ready_for_review", "invited"].includes(radar.readiness_status) ? note : null,
    decidedByProfileId: profileId,
    result: {
      readiness_status: "invited",
      milestone_event_id: milestoneEventId,
      milestone_event_participant_id: eventParticipantId
    }
  });
  await insertReadinessEvent(supabase, tenantId, radar.id, "invited", note ?? "Leerling uitgenodigd voor afzwemmoment.", profileId, {
    milestone_event_id: milestoneEventId,
    milestone_event_participant_id: eventParticipantId,
    readiness_score: radar.score
  });
  await insertReadinessEvent(supabase, tenantId, radar.id, "reminder_scheduled", "Herinnering voor afzwemuitnodiging gepland.", profileId, {
    reminder_at: reminderAt
  });

  revalidateAfzwem();
}

export async function inviteAfzwemParticipantAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const enrollmentId = requiredString(formData, "enrollment_id");
  const eventId = requiredString(formData, "milestone_event_id");
  const enrollmentResult = await supabase.from("enrollments").select("participant_id").eq("tenant_id", tenantId).eq("id", enrollmentId).single();

  if (enrollmentResult.error || !enrollmentResult.data) {
    throw new Error(enrollmentResult.error?.message ?? "Enrollment niet gevonden.");
  }

  await throwOnError(
    supabase.from("milestone_event_participants").upsert(
      {
        tenant_id: tenantId,
        milestone_event_id: eventId,
        enrollment_id: enrollmentId,
        participant_id: enrollmentResult.data.participant_id,
        readiness_criteria_id: optionalString(formData, "readiness_criteria_id"),
        invited_by_profile_id: profileId,
        status: enumValue(formData, "status", ["invited", "confirmed", "declined", "attended", "no_show", "cancelled"], "invited"),
        note: optionalString(formData, "note"),
        invited_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,milestone_event_id,enrollment_id" }
    )
  );
  await maybeQueueAfzwemInvitationMessage(supabase, tenantId, eventId, enrollmentId, enrollmentResult.data.participant_id, profileId);

  revalidateAfzwem();
}

export async function registerAfzwemResultAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const eventParticipantId = requiredString(formData, "milestone_event_participant_id");
  const participantResult = await supabase
    .from("milestone_event_participants")
    .select("milestone_event_id, enrollment_id, participant_id, status, diploma_readiness_radar_id")
    .eq("tenant_id", tenantId)
    .eq("id", eventParticipantId)
    .single();

  if (participantResult.error || !participantResult.data) {
    throw new Error(participantResult.error?.message ?? "Afzwemdeelnemer niet gevonden.");
  }

  const eventResult = await supabase.from("milestone_events").select("program_id").eq("tenant_id", tenantId).eq("id", participantResult.data.milestone_event_id).single();

  if (eventResult.error || !eventResult.data) {
    throw new Error(eventResult.error?.message ?? "Afzwemmoment niet gevonden.");
  }

  const resultStatus = enumValue(formData, "result_status", ["pending", "passed", "failed", "absent", "needs_retry"], "pending");
  const guardrailOverride = optionalString(formData, "guardrail_override_reason");
  const radarId = participantResult.data.diploma_readiness_radar_id as string | null;
  const radar = radarId
    ? await singleRow<{
        id: string;
        readiness_status: string;
        score: number | null;
        missing_criteria: unknown[];
        blockers: unknown[];
      }>(
        supabase
          .from("diploma_readiness_radar")
          .select("id, readiness_status, score, missing_criteria, blockers")
          .eq("tenant_id", tenantId)
          .eq("id", radarId)
          .single()
      )
    : null;

  if (resultStatus === "passed") {
    const invalidEventParticipantStatus = ["declined", "cancelled", "no_show"].includes(String(participantResult.data.status));
    const readinessStatus = radar?.readiness_status ?? null;
    const missingRadar = !radar;
    const notReady = radar ? !["ready_for_review", "invited", "completed"].includes(readinessStatus ?? "") : false;

    if ((invalidEventParticipantStatus || missingRadar || notReady) && !guardrailOverride) {
      await insertReadinessGuardrailEvent(supabase, tenantId, radar?.id ?? null, profileId, {
        milestone_event_participant_id: eventParticipantId,
        participant_status: participantResult.data.status,
        readiness_status: readinessStatus,
        missing_radar: missingRadar,
        result_status: resultStatus
      });
      throw new Error("Geslaagd registreren is geblokkeerd: de radar is niet klaar, ontbreekt of de deelnemerstatus klopt niet. Vul een guardrail override reden in als dit bewust is.");
    }
  }

  const guardrailSnapshot = {
    readiness_radar_id: radar?.id ?? null,
    readiness_status: radar?.readiness_status ?? null,
    score: radar?.score ?? null,
    missing_criteria: radar?.missing_criteria ?? [],
    blockers: radar?.blockers ?? [],
    override_reason: guardrailOverride,
    checked_at: new Date().toISOString()
  };
  const { error: upsertError } = await supabase.from("milestone_results").upsert(
      {
        tenant_id: tenantId,
        milestone_event_participant_id: eventParticipantId,
        milestone_event_id: participantResult.data.milestone_event_id,
        enrollment_id: participantResult.data.enrollment_id,
        participant_id: participantResult.data.participant_id,
        program_id: eventResult.data.program_id,
        diploma_readiness_radar_id: radar?.id ?? null,
        guardrail_snapshot: guardrailSnapshot,
        result_status: resultStatus,
        score: optionalScore(formData, "score"),
        note: optionalString(formData, "note"),
        registered_by_profile_id: profileId,
        registered_at: new Date().toISOString()
      },
      { onConflict: "tenant_id,milestone_event_participant_id" }
    );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  await throwOnError(
    supabase
      .from("milestone_event_participants")
      .update({
        status: resultStatus === "absent" ? "no_show" : resultStatus === "pending" ? "confirmed" : "attended"
      })
      .eq("tenant_id", tenantId)
      .eq("id", eventParticipantId)
  );

  const savedResult = await singleRow<{ id: string; certificate_id: string | null }>(
    supabase
      .from("milestone_results")
      .select("id, certificate_id")
      .eq("tenant_id", tenantId)
      .eq("milestone_event_participant_id", eventParticipantId)
      .single()
  );

  if (radar) {
    const nextReadinessStatus = resultStatus === "passed" ? "completed" : resultStatus === "needs_retry" || resultStatus === "failed" ? "almost_ready" : radar.readiness_status;

    await throwOnError(
      supabase
        .from("diploma_readiness_radar")
        .update({
          readiness_status: nextReadinessStatus,
          certificate_id: savedResult.certificate_id,
          reviewed_by_profile_id: profileId,
          reviewed_at: new Date().toISOString(),
          review_note: guardrailOverride ?? optionalString(formData, "note"),
          last_evaluated_at: new Date().toISOString()
        })
        .eq("tenant_id", tenantId)
        .eq("id", radar.id)
    );

    await updateSmartDecisionLifecycle(supabase, {
      tenantId,
      engineKey: "diploma_readiness",
      subjectType: "enrollment",
      subjectId: participantResult.data.enrollment_id,
      decisionStatus: resultStatus === "passed" ? "applied" : "recommended",
      humanDecision: resultStatus === "passed" ? (guardrailOverride ? "overridden" : "applied") : undefined,
      overrideReason: guardrailOverride,
      decidedByProfileId: profileId,
      result: {
        result_status: resultStatus,
        milestone_result_id: savedResult.id,
        certificate_id: savedResult.certificate_id
      }
    });
    await insertReadinessEvent(supabase, tenantId, radar.id, "result_registered", optionalString(formData, "note") ?? `Resultaat geregistreerd: ${resultStatus}.`, profileId, {
      milestone_result_id: savedResult.id,
      result_status: resultStatus,
      certificate_id: savedResult.certificate_id,
      guardrail_override: Boolean(guardrailOverride)
    });

    if (resultStatus === "passed") {
      await insertReadinessEvent(supabase, tenantId, radar.id, "completed", "Diploma readiness afgerond via resultaatregistratie.", profileId, {
        milestone_result_id: savedResult.id,
        certificate_id: savedResult.certificate_id
      });
    }
  }

  revalidateAfzwem();
}

export async function updateCertificateVaultAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const certificateId = requiredString(formData, "certificate_id");
  const downloadStatus = enumValue(formData, "download_status", ["pending", "ready", "blocked"], "pending");
  const vaultStatus = enumValue(formData, "vault_status", ["draft", "available", "archived"], "draft");

  await throwOnError(
    supabase
      .from("certificates")
      .update({
        file_path: optionalString(formData, "file_path"),
        download_status: downloadStatus,
        share_enabled: formData.get("share_enabled") === "on",
        share_expires_at: optionalDateTime(formData, "share_expires_at"),
        vault_status: vaultStatus
      })
      .eq("tenant_id", tenantId)
      .eq("id", certificateId)
  );

  if (downloadStatus === "ready" && vaultStatus === "available") {
    await maybeQueueDiplomaIssuedMessage(supabase, tenantId, certificateId);
  }

  revalidateAfzwem();
}

async function upsertDiplomaReadinessRadar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  profileId: string,
  draft: DiplomaReadinessDraft
) {
  const { data, error } = await supabase
    .from("diploma_readiness_radar")
    .upsert(
      {
        tenant_id: tenantId,
        enrollment_id: draft.enrollment.id,
        participant_id: draft.enrollment.participant_id,
        program_id: draft.enrollment.program_id,
        stage_id: draft.enrollment.current_stage_id,
        readiness_criteria_id: draft.criteria?.id ?? null,
        smart_decision_id: draft.smartDecisionId,
        recommended_event_id: draft.recommendedEventId,
        milestone_event_participant_id: draft.milestoneEventParticipantId,
        certificate_id: draft.certificateId,
        readiness_status: draft.readinessStatus,
        score: draft.score,
        confidence: draft.confidence,
        progress_snapshot: draft.progressSnapshot,
        attendance_snapshot: draft.attendanceSnapshot,
        badge_snapshot: draft.badgeSnapshot,
        period_snapshot: draft.periodSnapshot,
        criteria_results: draft.criteriaResults,
        missing_criteria: draft.missingCriteria,
        reasons: draft.reasons,
        blockers: draft.blockers,
        last_evaluated_at: new Date().toISOString(),
        created_by_profile_id: profileId
      },
      { onConflict: "tenant_id,enrollment_id,program_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Afzwem radar kon niet worden opgeslagen.");
  }

  return (data as { id: string }).id;
}

async function insertReadinessEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  radarId: string,
  eventType:
    | "evaluated"
    | "reviewed"
    | "candidate_suggested"
    | "invited"
    | "reminder_scheduled"
    | "result_registered"
    | "certificate_created"
    | "completed"
    | "dismissed"
    | "guardrail_blocked",
  note: string,
  profileId: string | null,
  metadata: Record<string, unknown> = {}
) {
  await throwOnError(
    supabase.from("diploma_readiness_events").insert({
      tenant_id: tenantId,
      readiness_radar_id: radarId,
      event_type: eventType,
      note,
      metadata,
      created_by_profile_id: profileId
    })
  );
}

async function insertReadinessGuardrailEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  radarId: string | null,
  profileId: string,
  metadata: Record<string, unknown>
) {
  if (!radarId) {
    return;
  }

  await insertReadinessEvent(supabase, tenantId, radarId, "guardrail_blocked", "Resultaatregistratie geblokkeerd door afzwem guardrail.", profileId, metadata);
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om afzwemdata te wijzigen.");
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

async function maybeQueueAfzwemInvitationMessage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  eventId: string,
  enrollmentId: string,
  participantId: string,
  profileId: string
) {
  const [eventResult, participantResult] = await Promise.all([
    supabase.from("milestone_events").select("title, starts_at").eq("tenant_id", tenantId).eq("id", eventId).maybeSingle(),
    supabase.from("participants").select("display_name").eq("tenant_id", tenantId).eq("id", participantId).maybeSingle()
  ]);

  if (eventResult.error || participantResult.error) {
    throw new Error(eventResult.error?.message ?? participantResult.error?.message ?? "Afzwembericht kon niet worden voorbereid.");
  }

  const event = eventResult.data as { title?: string; starts_at?: string } | null;
  const participant = participantResult.data as { display_name?: string } | null;

  await queueParentEventMessages(supabase, {
    tenantId,
    participantId,
    enrollmentId,
    eventKey: "afzwem_invited",
    templateCode: "afzwem-invited",
    context: {
      participant_name: participant?.display_name ?? "De leerling",
      event_title: event?.title ?? "Afzwemmen",
      event_date: event?.starts_at ? formatDateTime(event.starts_at) : "datum volgt"
    },
    sourceTable: "milestone_events",
    sourceRecordId: eventId,
    createdByProfileId: profileId,
    fallbackSubject: "Uitnodiging afzwemmen",
    fallbackBody: "Er staat een afzwemuitnodiging klaar in het ouderportaal."
  });
}

async function maybeQueueDiplomaIssuedMessage(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, certificateId: string) {
  const certificateResult = await supabase
    .from("certificates")
    .select("id, enrollment_id, participant_id, title")
    .eq("tenant_id", tenantId)
    .eq("id", certificateId)
    .maybeSingle();

  if (certificateResult.error) {
    throw new Error(certificateResult.error.message);
  }

  if (!certificateResult.data) {
    return;
  }

  const certificate = certificateResult.data as { id: string; enrollment_id: string | null; participant_id: string; title: string };
  const participantResult = await supabase.from("participants").select("display_name").eq("tenant_id", tenantId).eq("id", certificate.participant_id).maybeSingle();

  if (participantResult.error) {
    throw new Error(participantResult.error.message);
  }

  await queueParentEventMessages(supabase, {
    tenantId,
    participantId: certificate.participant_id,
    enrollmentId: certificate.enrollment_id,
    eventKey: "diploma_issued",
    templateCode: "diploma-issued",
    context: {
      participant_name: (participantResult.data as { display_name?: string } | null)?.display_name ?? "De leerling",
      certificate_title: certificate.title
    },
    sourceTable: "certificates",
    sourceRecordId: certificate.id,
    fallbackSubject: `Diploma beschikbaar: ${certificate.title}`,
    fallbackBody: "Er staat een diploma klaar in de digitale diploma kluis."
  });
}

function revalidateAfzwem() {
  for (const path of ["/admin", "/admin/afzwemmen", "/parent", "/parent/diplomas", "/parent/documenten", "/parent/notificaties"]) {
    revalidatePath(path);
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
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

function addDaysIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function intValue(formData: FormData, key: string, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
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

function requiredDateTime(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}

function optionalDateTime(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}
