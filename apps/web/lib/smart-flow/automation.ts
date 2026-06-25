import type { SupabaseClient } from "@supabase/supabase-js";

import { type SmartDecisionConfidence, type SmartEngineKey, smartEngineKeys } from "@/lib/smart-flow/decision";

export const automationLevels = ["disabled", "recommend_only", "recommend_and_prepare", "execute_with_approval", "execute_automatically"] as const;

export type AutomationLevel = (typeof automationLevels)[number];

export type AutomationSafetyLimits = {
  max_auto_offers_per_day: number;
  min_confidence: SmartDecisionConfidence;
  min_score: number;
  block_on_duplicate_risk: boolean;
  require_available_target_group: boolean;
  require_registered_result_for_diploma: boolean;
  rollback_window_minutes: number;
};

export type AutomationSafetyInput = {
  engineKey: SmartEngineKey;
  automationLevel: AutomationLevel;
  safetyLimits?: Partial<AutomationSafetyLimits>;
  featureFlags?: Record<string, boolean>;
  confidence?: SmartDecisionConfidence | null;
  score?: number | null;
  duplicateRisk?: string | null;
  availableTargetGroup?: boolean | null;
  registeredResult?: boolean | null;
  autoOffersToday?: number | null;
  blockingReasons?: string[];
};

export type AutomationSafetyResult = {
  allowed: boolean;
  blockers: string[];
  warnings: string[];
  effectiveLimits: AutomationSafetyLimits;
};

type AutomationLogClient = Pick<SupabaseClient, "from">;

export function isSmartEngineKey(value: string | null | undefined): value is SmartEngineKey {
  return smartEngineKeys.includes(value as SmartEngineKey);
}

export function isAutomationLevel(value: string | null | undefined): value is AutomationLevel {
  return automationLevels.includes(value as AutomationLevel);
}

export function defaultSafetyLimits(): AutomationSafetyLimits {
  return {
    max_auto_offers_per_day: 5,
    min_confidence: "high",
    min_score: 80,
    block_on_duplicate_risk: true,
    require_available_target_group: true,
    require_registered_result_for_diploma: true,
    rollback_window_minutes: 1440
  };
}

export function normalizeSafetyLimits(value: unknown): AutomationSafetyLimits {
  const defaults = defaultSafetyLimits();
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    max_auto_offers_per_day: numberLimit(raw.max_auto_offers_per_day, defaults.max_auto_offers_per_day, 0, 100),
    min_confidence: confidenceLimit(raw.min_confidence, defaults.min_confidence),
    min_score: numberLimit(raw.min_score, defaults.min_score, 0, 100),
    block_on_duplicate_risk: booleanLimit(raw.block_on_duplicate_risk, defaults.block_on_duplicate_risk),
    require_available_target_group: booleanLimit(raw.require_available_target_group, defaults.require_available_target_group),
    require_registered_result_for_diploma: booleanLimit(raw.require_registered_result_for_diploma, defaults.require_registered_result_for_diploma),
    rollback_window_minutes: numberLimit(raw.rollback_window_minutes, defaults.rollback_window_minutes, 0, 10080)
  };
}

export function automationLevelToLegacyMode(level: AutomationLevel) {
  if (level === "disabled" || level === "recommend_only") {
    return "manual";
  }

  if (level === "execute_automatically") {
    return "automatic";
  }

  return "semi_automatic";
}

export function evaluateAutomationSafety(input: AutomationSafetyInput): AutomationSafetyResult {
  const effectiveLimits = normalizeSafetyLimits(input.safetyLimits);
  const blockers = [...(input.blockingReasons ?? [])];
  const warnings: string[] = [];
  const featureFlags = input.featureFlags ?? {};

  if (input.automationLevel === "disabled") {
    blockers.push("Engine automation is uitgeschakeld.");
  }

  if (input.automationLevel !== "execute_automatically") {
    warnings.push("Engine voert nog niet automatisch uit; admin review blijft nodig.");
  }

  if (input.automationLevel === "execute_automatically" && featureFlags.auto_execution !== true) {
    blockers.push("Globale auto-execution feature flag staat uit.");
  }

  if (input.engineKey === "placement" && input.automationLevel === "execute_automatically" && featureFlags.auto_placement !== true) {
    blockers.push("Automatische plaatsing staat voor deze tenant uit.");
  }

  if (input.engineKey === "slot_offer" && input.automationLevel === "execute_automatically") {
    if (featureFlags.auto_slot_offers !== true) {
      blockers.push("Automatische slot offers staan voor deze tenant uit.");
    }

    if ((input.autoOffersToday ?? 0) >= effectiveLimits.max_auto_offers_per_day) {
      blockers.push(`Daglimiet voor automatische slot offers is bereikt (${effectiveLimits.max_auto_offers_per_day}).`);
    }
  }

  if (input.engineKey === "flow_through" && input.automationLevel === "execute_automatically") {
    if (featureFlags.auto_flow_through !== true) {
      blockers.push("Automatische doorstroom staat voor deze tenant uit.");
    }

    if (effectiveLimits.require_available_target_group && input.availableTargetGroup !== true) {
      blockers.push("Geen beschikbare doelgroep voor automatische doorstroom.");
    }
  }

  if (input.engineKey === "diploma_readiness" && input.automationLevel === "execute_automatically") {
    if (featureFlags.auto_diploma !== true) {
      blockers.push("Automatische diploma-acties staan voor deze tenant uit.");
    }

    if (effectiveLimits.require_registered_result_for_diploma && input.registeredResult !== true) {
      blockers.push("Geen geregistreerd afzwemresultaat voor automatische diploma-actie.");
    }
  }

  if (input.automationLevel === "execute_automatically") {
    if (confidenceRank(input.confidence ?? "unknown") < confidenceRank(effectiveLimits.min_confidence)) {
      blockers.push(`Confidence is lager dan ${effectiveLimits.min_confidence}.`);
    }

    if (typeof input.score === "number" && input.score < effectiveLimits.min_score) {
      blockers.push(`Score is lager dan ${effectiveLimits.min_score}.`);
    }

    if (effectiveLimits.block_on_duplicate_risk && input.duplicateRisk && input.duplicateRisk !== "none") {
      blockers.push("Duplicaatrisico blokkeert automatische uitvoering.");
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    effectiveLimits
  };
}

export async function logAutomationExecution(
  client: AutomationLogClient,
  input: {
    tenantId: string;
    engineKey: SmartEngineKey;
    automationLevel: AutomationLevel;
    actionKey: string;
    actionStatus: "planned" | "prepared" | "approval_required" | "executed" | "blocked" | "failed" | "rolled_back" | "rollback_unavailable";
    triggerSource?: "manual_review" | "scheduled_worker" | "event_hook" | "system";
    subjectType?: string | null;
    subjectId?: string | null;
    smartDecisionId?: string | null;
    inputSnapshot?: Record<string, unknown>;
    safetyResult?: AutomationSafetyResult | Record<string, unknown>;
    result?: Record<string, unknown>;
    rollbackAvailable?: boolean;
    rollbackReferenceTable?: string | null;
    rollbackReferenceId?: string | null;
    failureReason?: string | null;
    createdByProfileId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await client.from("automation_execution_logs").insert({
    tenant_id: input.tenantId,
    engine_key: input.engineKey,
    automation_level: input.automationLevel,
    trigger_source: input.triggerSource ?? "manual_review",
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    smart_decision_id: input.smartDecisionId ?? null,
    action_key: input.actionKey,
    action_status: input.actionStatus,
    input_snapshot: input.inputSnapshot ?? {},
    safety_result: input.safetyResult ?? {},
    result: input.result ?? {},
    rollback_available: input.rollbackAvailable ?? false,
    rollback_status: input.rollbackAvailable ? "available" : "not_available",
    rollback_reference_table: input.rollbackReferenceTable ?? null,
    rollback_reference_id: input.rollbackReferenceId ?? null,
    failure_reason: input.failureReason ?? null,
    created_by_profile_id: input.createdByProfileId ?? null,
    executed_at: input.actionStatus === "executed" ? new Date().toISOString() : null,
    metadata: input.metadata ?? {}
  });

  if (error) {
    throw new Error(error.message);
  }
}

function confidenceRank(confidence: SmartDecisionConfidence) {
  const ranks: Record<SmartDecisionConfidence, number> = {
    unknown: 0,
    low: 1,
    manual: 2,
    medium: 3,
    high: 4
  };

  return ranks[confidence] ?? 0;
}

function numberLimit(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  return Number.isFinite(numberValue) ? Math.max(min, Math.min(max, Math.round(numberValue))) : fallback;
}

function booleanLimit(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function confidenceLimit(value: unknown, fallback: SmartDecisionConfidence): SmartDecisionConfidence {
  const allowed: SmartDecisionConfidence[] = ["unknown", "low", "medium", "high", "manual"];
  return allowed.includes(value as SmartDecisionConfidence) ? (value as SmartDecisionConfidence) : fallback;
}
