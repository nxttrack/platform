import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { evaluateAutomationSafety, normalizeSafetyLimits, type AutomationLevel, type AutomationSafetyLimits } from "@/lib/smart-flow/automation";
import type { SmartDecisionConfidence, SmartEngineKey } from "@/lib/smart-flow/decision";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type AutomationEngineSettingsRow = {
  id: string;
  engine_key: SmartEngineKey;
  mode: string;
  automation_level: AutomationLevel;
  rule_version: string;
  weights: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  safety_limits: Partial<AutomationSafetyLimits>;
  feature_flags: Record<string, boolean>;
  expiry_settings: Record<string, unknown>;
  hold_settings: Record<string, unknown>;
  notification_settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: string;
  last_automation_reviewed_at: string | null;
  updated_at: string;
};

export type TenantFeatureFlagRow = {
  id: string;
  flag_key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  rollout_state: string;
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type AutomationExecutionLogRow = {
  id: string;
  engine_key: SmartEngineKey;
  automation_level: AutomationLevel;
  trigger_source: string;
  subject_type: string | null;
  subject_id: string | null;
  smart_decision_id: string | null;
  action_key: string;
  action_status: string;
  input_snapshot: Record<string, unknown>;
  safety_result: Record<string, unknown>;
  result: Record<string, unknown>;
  rollback_available: boolean;
  rollback_status: string;
  rollback_reference_table: string | null;
  rollback_reference_id: string | null;
  failure_reason: string | null;
  executed_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
};

export type AutomationDecisionRow = {
  id: string;
  engine_key: SmartEngineKey;
  subject_type: string;
  subject_id: string;
  score: number | null;
  confidence: SmartDecisionConfidence;
  decision_status: string;
  blockers_json: Array<Record<string, unknown>>;
  created_at: string;
};

export type AutomationEngineHealth = {
  engineKey: SmartEngineKey;
  level: AutomationLevel;
  safeForAutomatic: boolean;
  blockers: string[];
  warnings: string[];
  recentAutomaticActions: number;
  blockedLogs: number;
};

export type AdminAutomationData = {
  engineSettings: AutomationEngineSettingsRow[];
  featureFlags: TenantFeatureFlagRow[];
  executionLogs: AutomationExecutionLogRow[];
  recentDecisions: AutomationDecisionRow[];
  engineHealth: AutomationEngineHealth[];
};

export type AdminAutomationSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminAutomationData;
  errors: string[];
};

export async function getAdminAutomationSnapshot(): Promise<AdminAutomationSnapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor automatisering."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;
  const [settingsResult, flagsResult, logsResult, decisionsResult] = await Promise.all([
    supabase
      .from("tenant_smart_engine_settings")
      .select("id, engine_key, mode, automation_level, rule_version, weights, thresholds, safety_limits, feature_flags, expiry_settings, hold_settings, notification_settings, metadata, status, last_automation_reviewed_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("engine_key", { ascending: true }),
    supabase
      .from("tenant_feature_flags")
      .select("id, flag_key, label, description, enabled, rollout_state, metadata, updated_at")
      .eq("tenant_id", tenantId)
      .order("flag_key", { ascending: true }),
    supabase
      .from("automation_execution_logs")
      .select("id, engine_key, automation_level, trigger_source, subject_type, subject_id, smart_decision_id, action_key, action_status, input_snapshot, safety_result, result, rollback_available, rollback_status, rollback_reference_table, rollback_reference_id, failure_reason, executed_at, rolled_back_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("smart_decisions")
      .select("id, engine_key, subject_type, subject_id, score, confidence, decision_status, blockers_json, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(120)
  ]);

  const errors = collectErrors({
    tenant_smart_engine_settings: settingsResult.error,
    tenant_feature_flags: flagsResult.error,
    automation_execution_logs: logsResult.error,
    smart_decisions: decisionsResult.error
  });
  const engineSettings = asRows<AutomationEngineSettingsRow>(settingsResult.data);
  const featureFlags = asRows<TenantFeatureFlagRow>(flagsResult.data);
  const executionLogs = asRows<AutomationExecutionLogRow>(logsResult.data);
  const recentDecisions = asRows<AutomationDecisionRow>(decisionsResult.data);

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      engineSettings,
      featureFlags,
      executionLogs,
      recentDecisions,
      engineHealth: buildEngineHealth(engineSettings, featureFlags, executionLogs, recentDecisions)
    }
  };
}

function buildEngineHealth(settings: AutomationEngineSettingsRow[], flags: TenantFeatureFlagRow[], logs: AutomationExecutionLogRow[], decisions: AutomationDecisionRow[]): AutomationEngineHealth[] {
  const flagMap = Object.fromEntries(flags.map((flag) => [flag.flag_key, flag.enabled]));

  return settings.map((setting) => {
    const latestDecision = decisions.find((decision) => decision.engine_key === setting.engine_key);
    const safety = evaluateAutomationSafety({
      engineKey: setting.engine_key,
      automationLevel: setting.automation_level,
      safetyLimits: normalizeSafetyLimits(setting.safety_limits),
      featureFlags: { ...flagMap, ...setting.feature_flags },
      confidence: latestDecision?.confidence ?? "unknown",
      score: latestDecision?.score ?? null,
      duplicateRisk: "none",
      availableTargetGroup: true,
      registeredResult: setting.engine_key === "diploma_readiness" ? false : true,
      autoOffersToday: logs.filter((log) => log.engine_key === "slot_offer" && log.action_status === "executed" && isToday(log.created_at)).length,
      blockingReasons: latestDecision?.blockers_json.some((blocker) => blocker.severity === "blocking") ? ["Laatste smart decision bevat een blocking blocker."] : []
    });

    return {
      engineKey: setting.engine_key,
      level: setting.automation_level,
      safeForAutomatic: safety.allowed,
      blockers: safety.blockers,
      warnings: safety.warnings,
      recentAutomaticActions: logs.filter((log) => log.engine_key === setting.engine_key && ["executed", "prepared", "approval_required"].includes(log.action_status)).length,
      blockedLogs: logs.filter((log) => log.engine_key === setting.engine_key && ["blocked", "failed"].includes(log.action_status)).length
    };
  });
}

function createEmptyData(): AdminAutomationData {
  return {
    engineSettings: [],
    featureFlags: [],
    executionLogs: [],
    recentDecisions: [],
    engineHealth: []
  };
}

function isToday(value: string) {
  return value.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}
