import "server-only";

import { randomUUID } from "node:crypto";

import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  automationRecipeCatalog,
  buildReviewTask,
  decideAutomationRecipeCandidate,
  getAutomationRecipeDefinition,
  normalizeAutomationRecipeSettings,
  type AutomationRecipeCandidate,
  type AutomationRecipeExecutionMode,
  type AutomationRecipeKey,
  type AutomationRecipeSettings
} from "./automation-recipe-contract";
import { detectAttendanceRisks } from "./learning-intelligence";

export type TenantAutomationRecipeConfig = {
  id: string;
  recipe_key: AutomationRecipeKey;
  recipe_version: number;
  enabled: boolean;
  settings_json: Partial<AutomationRecipeSettings>;
  enabled_at: string | null;
  updated_at: string;
};

export type AutomationRecipeRunRow = {
  id: string;
  recipe_key: AutomationRecipeKey;
  status: "running" | "completed" | "skipped" | "failed";
  execution_mode: AutomationRecipeExecutionMode;
  trigger_entity_type: string | null;
  trigger_entity_id: string | null;
  participant_id: string | null;
  review_task_id: string | null;
  actions_taken_json: string[];
  source_data_json: Record<string, boolean | number | string | null>;
  reasons_json: string[];
  confidence: number | null;
  skipped_reason: string | null;
  error_code: string | null;
  is_test: boolean;
  journey_run_id: string | null;
  started_at: string;
  completed_at: string | null;
};

export type AutomationRecipeExecutionResult = {
  action: "duplicate" | "review_task_created" | "simulation_only" | "skipped" | "failed";
  runId: string | null;
  taskId: string | null;
  decision: ReturnType<typeof decideAutomationRecipeCandidate>;
};

export async function getAutomationRecipeDashboard(tenantId: string) {
  const admin = createAdminClient();
  const [configsResult, runsResult] = await Promise.all([
    admin
      .from("tenant_automation_recipes")
      .select("id, recipe_key, recipe_version, enabled, settings_json, enabled_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at"),
    admin
      .from("automation_recipe_runs")
      .select("id, recipe_key, status, execution_mode, trigger_entity_type, trigger_entity_id, participant_id, review_task_id, actions_taken_json, source_data_json, reasons_json, confidence, skipped_reason, error_code, is_test, journey_run_id, started_at, completed_at")
      .eq("tenant_id", tenantId)
      .order("started_at", { ascending: false })
      .limit(100)
  ]);
  assertResult(configsResult.error, "automation recipe configurations");
  assertResult(runsResult.error, "automation recipe runs");

  return {
    catalog: automationRecipeCatalog,
    configs: (configsResult.data ?? []) as TenantAutomationRecipeConfig[],
    runs: (runsResult.data ?? []) as AutomationRecipeRunRow[]
  };
}

export async function evaluateAutomationRecipe(input: {
  tenantId: string;
  recipeKey: AutomationRecipeKey;
  settings?: Partial<AutomationRecipeSettings>;
}) {
  const definition = getAutomationRecipeDefinition(input.recipeKey);
  const settings = normalizeAutomationRecipeSettings(input.settings ?? {}, definition);
  const candidate = await findCandidate(input.tenantId, input.recipeKey, settings);
  return {
    decision: decideAutomationRecipeCandidate(candidate),
    settings
  };
}

export async function executeAutomationRecipe(input: {
  tenantId: string;
  recipeKey: AutomationRecipeKey;
  executionMode: AutomationRecipeExecutionMode;
  initiatedByUserId: string | null;
  tenantRecipeId?: string | null;
  settings?: Partial<AutomationRecipeSettings>;
}): Promise<AutomationRecipeExecutionResult> {
  const definition = getAutomationRecipeDefinition(input.recipeKey);
  const evaluated = await evaluateAutomationRecipe(input);
  const decision = evaluated.decision;
  const now = new Date().toISOString();
  const admin = createAdminClient();
  const idempotencyKey = input.executionMode === "test"
    ? `test:${input.recipeKey}:${randomUUID()}`
    : decision.candidate
      ? `live:${input.recipeKey}:${decision.candidate.dedupeKey}`
      : `live:${input.recipeKey}:empty:${now.slice(0, 10)}`;

  if (input.executionMode === "live" && decision.eligible && decision.candidate) {
    const cooldownBoundary = new Date(Date.now() - evaluated.settings.cooldownDays * dayMs).toISOString();
    const recentResult = await admin
      .from("automation_recipe_runs")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("recipe_key", input.recipeKey)
      .eq("execution_mode", "live")
      .eq("status", "completed")
      .eq("trigger_entity_type", decision.candidate.entityType)
      .eq("trigger_entity_id", decision.candidate.entityId)
      .gte("completed_at", cooldownBoundary)
      .limit(1)
      .maybeSingle();
    assertResult(recentResult.error, "automation recipe cooldown");
    if (recentResult.data) {
      const cooldownDecision = {
        ...decision,
        eligible: false,
        reasons: [...decision.reasons, `Er is binnen ${evaluated.settings.cooldownDays} dagen al een controletaak gemaakt.`],
        skippedReason: "cooldown_active"
      };
      const runId = await insertFinishedRun({
        ...input,
        decision: cooldownDecision,
        idempotencyKey: `${idempotencyKey}:cooldown:${now.slice(0, 10)}`,
        settings: evaluated.settings,
        status: "skipped"
      });
      return { action: "skipped", runId, taskId: null, decision: cooldownDecision };
    }
  }

  if (!decision.eligible || !decision.candidate) {
    const runId = await insertFinishedRun({
      ...input,
      decision,
      idempotencyKey,
      settings: evaluated.settings,
      status: "skipped"
    });
    return { action: "skipped", runId, taskId: null, decision };
  }

  if (input.executionMode === "test") {
    const runId = await insertFinishedRun({
      ...input,
      decision,
      idempotencyKey,
      settings: evaluated.settings,
      status: "completed",
      actions: ["simulation_only"]
    });
    return { action: "simulation_only", runId, taskId: null, decision };
  }

  const runInsert = await admin
    .from("automation_recipe_runs")
    .insert(toRunInsert({
      ...input,
      decision,
      idempotencyKey,
      settings: evaluated.settings,
      status: "running",
      completedAt: null,
      actions: []
    }))
    .select("id")
    .single();
  if (runInsert.error?.code === "23505") {
    const existing = await admin
      .from("automation_recipe_runs")
      .select("id, review_task_id")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    return {
      action: "duplicate",
      runId: existing.data?.id ?? null,
      taskId: existing.data?.review_task_id ?? null,
      decision
    };
  }
  assertResult(runInsert.error, "automation recipe run claim");
  const runId = runInsert.data!.id as string;
  const task = buildReviewTask({
    candidate: decision.candidate,
    recipeName: definition.name
  });
  const classification = classifyContent(
    { title: task.title, description: task.description },
    decision.candidate.participantId ? "personal" : "operational"
  );
  const taskResult = await admin
    .from("tenant_tasks")
    .insert({
      tenant_id: input.tenantId,
      created_by_user_id: input.initiatedByUserId,
      related_participant_id: decision.candidate.participantId,
      title: task.title,
      description: `${task.description}\n\nAutomation run: ${runId}`,
      priority: task.priority,
      status: "open",
      is_test: false,
      journey_run_id: null,
      content_classification: classification.classification,
      classification_reasons: [...classification.reasons, "automation_review_only"]
    })
    .select("id")
    .single();

  if (taskResult.error || !taskResult.data) {
    await admin
      .from("automation_recipe_runs")
      .update({
        status: "failed",
        error_code: "review_task_insert_failed",
        completed_at: new Date().toISOString()
      })
      .eq("tenant_id", input.tenantId)
      .eq("id", runId);
    return { action: "failed", runId, taskId: null, decision };
  }

  const taskId = taskResult.data.id as string;
  const completeResult = await admin
    .from("automation_recipe_runs")
    .update({
      status: "completed",
      review_task_id: taskId,
      actions_taken_json: ["review_task_created"],
      completed_at: new Date().toISOString()
    })
    .eq("tenant_id", input.tenantId)
    .eq("id", runId)
    .eq("status", "running");
  assertResult(completeResult.error, "automation recipe completion");

  return { action: "review_task_created", runId, taskId, decision };
}

export async function runEnabledAutomationRecipes(input: { tenantId?: string } = {}) {
  const admin = createAdminClient();
  let query = admin
    .from("tenant_automation_recipes")
    .select("id, tenant_id, recipe_key, settings_json")
    .eq("enabled", true)
    .order("tenant_id")
    .limit(250);
  if (input.tenantId) query = query.eq("tenant_id", input.tenantId);
  const configsResult = await query;
  assertResult(configsResult.error, "enabled automation recipes");

  const results = [];
  for (const config of configsResult.data ?? []) {
    const recipeKey = config.recipe_key as AutomationRecipeKey;
    results.push({
      tenantId: config.tenant_id,
      recipeKey,
      result: await executeAutomationRecipe({
        tenantId: config.tenant_id,
        recipeKey,
        executionMode: "live",
        initiatedByUserId: null,
        tenantRecipeId: config.id,
        settings: config.settings_json as Partial<AutomationRecipeSettings>
      })
    });
  }
  return results;
}

async function insertFinishedRun(input: {
  tenantId: string;
  recipeKey: AutomationRecipeKey;
  executionMode: AutomationRecipeExecutionMode;
  initiatedByUserId: string | null;
  tenantRecipeId?: string | null;
  decision: ReturnType<typeof decideAutomationRecipeCandidate>;
  idempotencyKey: string;
  settings: AutomationRecipeSettings;
  status: "completed" | "skipped";
  actions?: string[];
}) {
  const admin = createAdminClient();
  const insert = await admin
    .from("automation_recipe_runs")
    .insert(toRunInsert({
      ...input,
      completedAt: new Date().toISOString(),
      actions: input.actions ?? [],
    }))
    .select("id")
    .single();
  if (insert.error?.code === "23505") {
    const existing = await admin
      .from("automation_recipe_runs")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle();
    return existing.data?.id ?? null;
  }
  assertResult(insert.error, "automation recipe run");
  return insert.data?.id as string;
}

function toRunInsert(input: {
  tenantId: string;
  recipeKey: AutomationRecipeKey;
  executionMode: AutomationRecipeExecutionMode;
  initiatedByUserId: string | null;
  tenantRecipeId?: string | null;
  decision: ReturnType<typeof decideAutomationRecipeCandidate>;
  idempotencyKey: string;
  settings: AutomationRecipeSettings;
  status: "running" | "completed" | "skipped";
  completedAt: string | null;
  actions: string[];
}) {
  const candidate = input.decision.candidate;
  return {
    tenant_id: input.tenantId,
    tenant_recipe_id: input.tenantRecipeId ?? null,
    recipe_key: input.recipeKey,
    recipe_version: 1,
    status: input.status,
    execution_mode: input.executionMode,
    idempotency_key: input.idempotencyKey,
    trigger_entity_type: candidate?.entityType ?? null,
    trigger_entity_id: candidate?.entityId ?? null,
    participant_id: candidate?.participantId ?? null,
    actions_taken_json: input.actions,
    source_data_json: {
      ...candidate?.sourceData,
      cooldownDays: input.settings.cooldownDays,
      daysAhead: input.settings.daysAhead,
      lookbackDays: input.settings.lookbackDays,
      minimumOccurrences: input.settings.minimumOccurrences,
      minimumConfidence: input.settings.minimumConfidence
    },
    reasons_json: input.decision.reasons,
    confidence: input.decision.confidence,
    skipped_reason: input.status === "skipped" ? input.decision.skippedReason ?? "not_eligible" : null,
    error_code: null,
    is_test: candidate?.isTest ?? false,
    journey_run_id: candidate?.journeyRunId ?? null,
    initiated_by_user_id: input.initiatedByUserId,
    completed_at: input.completedAt,
    content_classification: candidate?.participantId ? "personal" : "operational",
    classification_reasons: candidate?.participantId
      ? ["automation_review_audit", "participant_reference"]
      : ["automation_review_audit"]
  };
}

async function findCandidate(
  tenantId: string,
  recipeKey: AutomationRecipeKey,
  settings: AutomationRecipeSettings
): Promise<AutomationRecipeCandidate | null> {
  switch (recipeKey) {
    case "no_show_follow_up":
      return findNoShowCandidate(tenantId, settings);
    case "birthday_message":
      return findBirthdayCandidate(tenantId, settings);
    case "offer_expiring":
      return findExpiringOfferCandidate(tenantId, settings);
    case "long_absence":
      return findLongAbsenceCandidate(tenantId);
    case "diploma_achieved":
      return findDiplomaCandidate(tenantId, settings);
    case "payment_failed":
      return findPaymentFailureCandidate(tenantId, settings);
    case "makeup_credit_expiring":
      return findExpiringCreditCandidate(tenantId, settings);
    case "graduation_reminder":
      return findGraduationReminderCandidate(tenantId, settings);
    case "trial_lesson_follow_up":
      return findTrialFollowUpCandidate(tenantId);
    case "waitlist_capacity_available":
      return findCapacityCandidate(tenantId, settings);
  }
}

async function findNoShowCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const since = new Date(Date.now() - settings.lookbackDays * dayMs).toISOString();
  const result = await createAdminClient()
    .from("smart_events")
    .select("id, participant_id, group_id, occurred_at, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("event_type", "participant_absent")
    .eq("is_test", false)
    .is("journey_run_id", null)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(500);
  assertResult(result.error, "absence smart events");
  const byParticipant = groupBy(
    (result.data ?? []).filter((row) => row.participant_id),
    (row) => row.participant_id as string
  );
  const match = [...byParticipant.entries()]
    .map(([participantId, rows]) => ({ participantId, rows }))
    .filter(({ rows }) => rows.length >= settings.minimumOccurrences)
    .sort((left, right) => right.rows.length - left.rows.length || right.rows[0]!.occurred_at.localeCompare(left.rows[0]!.occurred_at))[0];
  if (!match) return null;
  const latest = match.rows[0]!;
  return candidate({
    confidence: Math.min(0.95, 0.7 + match.rows.length * 0.08),
    dedupeKey: `${match.participantId}:${latest.id}`,
    entityId: latest.id,
    entityType: "smart_event",
    isTest: latest.is_test,
    journeyRunId: latest.journey_run_id,
    participantId: match.participantId,
    label: "Herhaalde afwezigheid vraagt om menselijke controle.",
    reasons: [
      `${match.rows.length} afwezigheidsregistraties in ${settings.lookbackDays} dagen.`,
      "Een medewerker controleert eerst of dit werkelijk een no-showpatroon is."
    ],
    sourceData: { eventType: "participant_absent", occurrenceCount: match.rows.length }
  });
}

async function findBirthdayCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const admin = createAdminClient();
  const [participantsResult, settingsResult] = await Promise.all([
    admin
      .from("participants")
      .select("id, birth_date, is_test, journey_run_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .eq("is_test", false)
      .is("journey_run_id", null)
      .not("birth_date", "is", null)
      .limit(1000),
    admin.from("tenant_settings").select("timezone").eq("tenant_id", tenantId).maybeSingle()
  ]);
  assertResult(participantsResult.error, "birthday participants");
  assertResult(settingsResult.error, "birthday timezone");
  const today = localDateParts(new Date(), settingsResult.data?.timezone ?? "Europe/Amsterdam");
  const matches = (participantsResult.data ?? [])
    .map((row) => ({ row, days: daysUntilAnnualDate(row.birth_date!, today) }))
    .filter(({ days }) => days >= 0 && days <= settings.daysAhead)
    .sort((left, right) => left.days - right.days);
  const match = matches[0];
  if (!match) return null;
  return candidate({
    confidence: 1,
    dedupeKey: `${match.row.id}:${today.year}`,
    entityId: match.row.id,
    entityType: "participant",
    isTest: match.row.is_test,
    journeyRunId: match.row.journey_run_id,
    participantId: match.row.id,
    label: "Optionele verjaardagsopvolging staat klaar voor controle.",
    reasons: [
      match.days === 0 ? "De verjaardag valt vandaag." : `De verjaardag valt binnen ${match.days} dag(en).`,
      "Controleer occasion-consent voordat je een bericht opstelt."
    ],
    sourceData: { daysUntilBirthday: match.days, occasionConsentRequired: true }
  });
}

async function findExpiringOfferCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const admin = createAdminClient();
  const now = new Date();
  const horizon = new Date(now.getTime() + settings.daysAhead * dayMs).toISOString();
  const offersResult = await admin
    .from("slot_offers")
    .select("id, waitlist_entry_id, expires_at")
    .eq("tenant_id", tenantId)
    .eq("status", "sent")
    .gte("expires_at", now.toISOString())
    .lte("expires_at", horizon)
    .order("expires_at")
    .limit(100);
  assertResult(offersResult.error, "expiring offers");
  const waitlistIds = (offersResult.data ?? []).map((row) => row.waitlist_entry_id);
  if (waitlistIds.length === 0) return null;
  const waitlistResult = await admin
    .from("waitlist_entries")
    .select("id, participant_id, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("id", waitlistIds);
  assertResult(waitlistResult.error, "offer waitlist source");
  const liveById = new Map((waitlistResult.data ?? []).map((row) => [row.id, row]));
  const offer = (offersResult.data ?? []).find((row) => {
    const entry = liveById.get(row.waitlist_entry_id);
    return entry && !entry.is_test && !entry.journey_run_id;
  });
  if (!offer) return null;
  const entry = liveById.get(offer.waitlist_entry_id)!;
  const hours = Math.max(0, Math.ceil((new Date(offer.expires_at).getTime() - now.getTime()) / hourMs));
  return candidate({
    confidence: 0.98,
    dedupeKey: `${offer.id}:${offer.expires_at}`,
    entityId: offer.id,
    entityType: "slot_offer",
    isTest: entry.is_test,
    journeyRunId: entry.journey_run_id,
    participantId: entry.participant_id,
    label: "Een open plaatsingsaanbod nadert de vervaldatum.",
    reasons: [`Nog ongeveer ${hours} uur geldig.`, "Status is opnieuw als openstaand gecontroleerd."],
    sourceData: { hoursUntilExpiry: hours, status: "sent" }
  });
}

async function findLongAbsenceCandidate(tenantId: string) {
  const risks = await detectAttendanceRisks(tenantId);
  const risk = risks
    .filter((row) =>
      row.signal_type === "long_absence_without_contact"
      && !row.is_test
      && !row.journey_run_id
    )
    .sort((left, right) => confidenceRank(right.confidence) - confidenceRank(left.confidence))[0];
  if (!risk) return null;
  return candidate({
    confidence: confidenceValue(risk.confidence),
    dedupeKey: `${risk.participant_id}:${risk.group_id}:${new Date().toISOString().slice(0, 7)}`,
    entityId: risk.participant_id,
    entityType: "participant",
    isTest: risk.is_test,
    journeyRunId: risk.journey_run_id,
    participantId: risk.participant_id,
    label: "Langere afwezigheid zonder recent zichtbaar contact.",
    reasons: [risk.reason, ...risk.evidence],
    sourceData: { riskLevel: risk.risk_level, signalType: risk.signal_type }
  });
}

async function findDiplomaCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const since = new Date(Date.now() - settings.lookbackDays * dayMs).toISOString().slice(0, 10);
  const result = await createAdminClient()
    .from("certificate_records")
    .select("id, participant_id, issued_on, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("status", "issued")
    .eq("is_test", false)
    .is("journey_run_id", null)
    .gte("issued_on", since)
    .order("issued_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertResult(result.error, "issued certificates");
  const row = result.data;
  if (!row) return null;
  return candidate({
    confidence: 1,
    dedupeKey: row.id,
    entityId: row.id,
    entityType: "certificate",
    isTest: row.is_test,
    journeyRunId: row.journey_run_id,
    participantId: row.participant_id,
    label: "Een recent uitgegeven diploma staat klaar voor gecontroleerde opvolging.",
    reasons: ["Diplomastatus is uitgegeven.", "Controleer de bestaande communicatiehistorie om dubbele felicitatie te voorkomen."],
    sourceData: { status: "issued" }
  });
}

async function findPaymentFailureCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const since = new Date(Date.now() - settings.lookbackDays * dayMs).toISOString();
  const result = await createAdminClient()
    .from("smart_events")
    .select("id, entity_type, entity_id, participant_id, occurred_at, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("event_type", "payment_failed")
    .eq("is_test", false)
    .is("journey_run_id", null)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assertResult(result.error, "payment failure events");
  const row = result.data;
  if (!row) return null;
  return candidate({
    confidence: 1,
    dedupeKey: row.id,
    entityId: row.entity_id,
    entityType: row.entity_type,
    isTest: row.is_test,
    journeyRunId: row.journey_run_id,
    participantId: row.participant_id,
    label: "Een mislukte betaling vraagt om financiële controle.",
    reasons: ["De providerstatus is als mislukt geregistreerd.", "Er wordt geen incasso of nieuwe betaalpoging gestart."],
    sourceData: { eventType: "payment_failed", paymentAction: false }
  });
}

async function findExpiringCreditCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + settings.daysAhead * dayMs).toISOString().slice(0, 10);
  const creditsResult = await admin
    .from("catch_up_credits")
    .select("id, participant_id, expires_on")
    .eq("tenant_id", tenantId)
    .eq("status", "available")
    .gte("expires_on", today)
    .lte("expires_on", horizon)
    .order("expires_on")
    .limit(100);
  assertResult(creditsResult.error, "expiring make-up credits");
  const participantIds = (creditsResult.data ?? []).map((row) => row.participant_id);
  if (participantIds.length === 0) return null;
  const participantsResult = await admin
    .from("participants")
    .select("id, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("id", participantIds);
  assertResult(participantsResult.error, "credit participants");
  const participantById = new Map((participantsResult.data ?? []).map((row) => [row.id, row]));
  const credit = (creditsResult.data ?? []).find((row) => {
    const participant = participantById.get(row.participant_id);
    return participant && !participant.is_test && !participant.journey_run_id;
  });
  if (!credit) return null;
  const participant = participantById.get(credit.participant_id)!;
  const days = dateDifference(today, credit.expires_on);
  return candidate({
    confidence: 1,
    dedupeKey: `${credit.id}:${credit.expires_on}`,
    entityId: credit.id,
    entityType: "catch_up_credit",
    isTest: participant.is_test,
    journeyRunId: participant.journey_run_id,
    participantId: credit.participant_id,
    label: "Een beschikbare inhaalcredit nadert de vervaldatum.",
    reasons: [`Nog ${days} dag(en) geldig.`, "De credit is opnieuw als beschikbaar gecontroleerd."],
    sourceData: { daysUntilExpiry: days, status: "available" }
  });
}

async function findGraduationReminderCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const admin = createAdminClient();
  const now = new Date();
  const eventsResult = await admin
    .from("graduation_events")
    .select("id, starts_at, status, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("status", ["planned", "published"])
    .eq("is_test", false)
    .is("journey_run_id", null)
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + settings.daysAhead * dayMs).toISOString())
    .order("starts_at")
    .limit(100);
  assertResult(eventsResult.error, "upcoming graduation events");
  const eventIds = (eventsResult.data ?? []).map((row) => row.id);
  if (eventIds.length === 0) return null;
  const participantResult = await admin
    .from("graduation_event_participants")
    .select("id, event_id, participant_id, invite_status, status, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .in("event_id", eventIds)
    .in("invite_status", ["sent", "confirmed"])
    .in("status", ["invited", "confirmed"])
    .eq("is_test", false)
    .is("journey_run_id", null)
    .limit(100);
  assertResult(participantResult.error, "graduation reminder participants");
  const row = participantResult.data?.[0];
  if (!row) return null;
  const event = (eventsResult.data ?? []).find((item) => item.id === row.event_id)!;
  const days = Math.max(0, Math.ceil((new Date(event.starts_at).getTime() - now.getTime()) / dayMs));
  return candidate({
    confidence: 1,
    dedupeKey: `${row.id}:${event.starts_at}`,
    entityId: row.id,
    entityType: "graduation_event_participant",
    isTest: row.is_test,
    journeyRunId: row.journey_run_id,
    participantId: row.participant_id,
    label: "Een actief afzwemmoment nadert.",
    reasons: [`Afzwemevent over ongeveer ${days} dag(en).`, `Uitnodiging is ${row.invite_status}.`],
    sourceData: { daysUntilEvent: days, inviteStatus: row.invite_status }
  });
}

async function findTrialFollowUpCandidate(tenantId: string) {
  const result = await createAdminClient()
    .from("crm_follow_up_items")
    .select("id, participant_id, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("signal_type", "trial_unfollowed")
    .eq("status", "open")
    .eq("is_test", false)
    .is("journey_run_id", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  assertResult(result.error, "trial follow-up signals");
  const row = result.data;
  if (!row) return null;
  return candidate({
    confidence: 0.9,
    dedupeKey: row.id,
    entityId: row.id,
    entityType: "crm_follow_up_item",
    isTest: row.is_test,
    journeyRunId: row.journey_run_id,
    participantId: row.participant_id,
    label: "Een afgeronde proefles heeft nog geen vastgelegde opvolging.",
    reasons: ["CRM-signaal is nog open.", "Controleer de geldige contactrechtsgrond vóór persoonlijk contact."],
    sourceData: { marketingConsentRequired: true, signalType: "trial_unfollowed" }
  });
}

async function findCapacityCandidate(tenantId: string, settings: AutomationRecipeSettings) {
  const result = await createAdminClient()
    .from("placement_suggestions")
    .select("id, participant_id, confidence, blockers_json, expires_at, is_test, journey_run_id")
    .eq("tenant_id", tenantId)
    .eq("status", "suggested")
    .eq("is_test", false)
    .is("journey_run_id", null)
    .gte("confidence", settings.minimumConfidence)
    .gt("expires_at", new Date().toISOString())
    .order("confidence", { ascending: false })
    .limit(100);
  assertResult(result.error, "placement suggestions");
  const row = (result.data ?? []).find((item) => Array.isArray(item.blockers_json) && item.blockers_json.length === 0);
  if (!row) return null;
  return candidate({
    confidence: Number(row.confidence),
    dedupeKey: row.id,
    entityId: row.id,
    entityType: "placement_suggestion",
    isTest: row.is_test,
    journeyRunId: row.journey_run_id,
    participantId: row.participant_id,
    label: "Een actuele blocker-vrije plaatsingssuggestie staat klaar.",
    reasons: [
      `${Math.round(Number(row.confidence) * 100)}% confidence op basis van de huidige brondata.`,
      "Een beheerder kiest en bevestigt iedere vervolgstap zelf."
    ],
    sourceData: { blockerCount: 0, confidence: Number(row.confidence), status: "suggested" }
  });
}

function candidate(input: AutomationRecipeCandidate) {
  return input;
}

function groupBy<Row, Key>(rows: Row[], getKey: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) grouped.set(getKey(row), [...(grouped.get(getKey(row)) ?? []), row]);
  return grouped;
}

function localDateParts(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: Number(value.day),
    month: Number(value.month),
    year: Number(value.year)
  };
}

function daysUntilAnnualDate(date: string, today: { day: number; month: number; year: number }) {
  const [, monthValue, dayValue] = date.split("-").map(Number);
  const current = Date.UTC(today.year, today.month - 1, today.day);
  let target = Date.UTC(today.year, monthValue - 1, dayValue);
  if (target < current) target = Date.UTC(today.year + 1, monthValue - 1, dayValue);
  return Math.round((target - current) / dayMs);
}

function dateDifference(from: string, to: string) {
  return Math.max(0, Math.ceil((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / dayMs));
}

function confidenceValue(value: "laag" | "middel" | "hoog") {
  return value === "hoog" ? 0.9 : value === "middel" ? 0.75 : 0.6;
}

function confidenceRank(value: "laag" | "middel" | "hoog") {
  return value === "hoog" ? 3 : value === "middel" ? 2 : 1;
}

function assertResult(error: { code?: string; message: string } | null, label: string) {
  if (error) throw new Error(`Could not process ${label}: ${error.message}`);
}

const dayMs = 86_400_000;
const hourMs = 3_600_000;
