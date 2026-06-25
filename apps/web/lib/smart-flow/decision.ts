import type { SupabaseClient } from "@supabase/supabase-js";

export const smartEngineKeys = [
  "intake_recommendation",
  "stage_recommendation",
  "capacity",
  "waitlist",
  "placement",
  "slot_offer",
  "lesson",
  "progress",
  "badge",
  "flow_through",
  "diploma_readiness",
  "milestone_event",
  "certificate",
  "notification",
  "task",
  "reporting"
] as const;

export type SmartEngineKey = (typeof smartEngineKeys)[number];
export type SmartAutomationMode = "manual" | "semi_automatic" | "automatic";
export type SmartDecisionConfidence = "unknown" | "low" | "medium" | "high" | "manual";
export type SmartDecisionStatus = "recommended" | "approved" | "rejected" | "overridden" | "applied" | "cancelled" | "expired";
export type SmartHumanDecision = "approved" | "rejected" | "overridden" | "applied" | "cancelled";

export type SmartDecisionReason = {
  code: string;
  label: string;
  detail?: string;
  weight?: number;
  evidence?: Record<string, unknown>;
  visibleToParent?: boolean;
};

export type SmartDecisionBlocker = {
  code: string;
  label: string;
  detail?: string;
  severity?: "warning" | "blocking";
  evidence?: Record<string, unknown>;
};

export type SmartDecisionUpsertInput = {
  tenantId: string;
  engineKey: SmartEngineKey;
  subjectType: string;
  subjectId: string;
  inputSnapshot: Record<string, unknown>;
  ruleVersion?: string;
  score?: number | null;
  confidence?: SmartDecisionConfidence;
  reasons: SmartDecisionReason[];
  blockers?: SmartDecisionBlocker[];
  recommendation: Record<string, unknown>;
  decisionStatus?: SmartDecisionStatus;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type SmartDecisionLifecycleInput = {
  tenantId: string;
  engineKey: SmartEngineKey;
  subjectType: string;
  subjectId: string;
  decisionStatus: SmartDecisionStatus;
  humanDecision?: SmartHumanDecision;
  overrideReason?: string | null;
  result?: Record<string, unknown>;
  decidedByProfileId?: string | null;
};

type SmartDecisionClient = Pick<SupabaseClient, "from">;

export function smartReason(input: SmartDecisionReason): SmartDecisionReason {
  return {
    code: input.code,
    label: input.label,
    detail: input.detail,
    weight: input.weight,
    evidence: input.evidence,
    visibleToParent: input.visibleToParent === true
  };
}

export function smartBlocker(input: SmartDecisionBlocker): SmartDecisionBlocker {
  return {
    code: input.code,
    label: input.label,
    detail: input.detail,
    severity: input.severity ?? "blocking",
    evidence: input.evidence
  };
}

export function confidenceFromScore(score: number | null | undefined, blockers: SmartDecisionBlocker[] = []): SmartDecisionConfidence {
  if (blockers.some((blocker) => blocker.severity !== "warning")) {
    return "low";
  }

  if (typeof score !== "number") {
    return "unknown";
  }

  if (score >= 80) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

export async function upsertSmartDecision(client: SmartDecisionClient, input: SmartDecisionUpsertInput) {
  const blockers = input.blockers ?? [];
  const ruleVersion = input.ruleVersion ?? "v1";
  const decisionStatus = input.decisionStatus ?? "recommended";
  const confidence = input.confidence ?? confidenceFromScore(input.score, blockers);

  const { data, error } = await client
    .from("smart_decisions")
    .upsert(
      {
        tenant_id: input.tenantId,
        engine_key: input.engineKey,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        input_snapshot: input.inputSnapshot,
        rule_version: ruleVersion,
        score: typeof input.score === "number" ? input.score : null,
        confidence,
        reasons_json: input.reasons,
        blockers_json: blockers,
        recommendation: input.recommendation,
        decision_status: decisionStatus,
        result: input.result ?? {},
        metadata: input.metadata ?? {}
      },
      { onConflict: "tenant_id,engine_key,subject_type,subject_id,rule_version" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Smart decision kon niet worden opgeslagen.");
  }

  return (data as { id: string }).id;
}

export async function updateSmartDecisionLifecycle(client: SmartDecisionClient, input: SmartDecisionLifecycleInput) {
  if (input.humanDecision === "overridden" && !input.overrideReason?.trim()) {
    throw new Error("Een override heeft verplicht een reden nodig.");
  }

  const update: Record<string, unknown> = {
    decision_status: input.decisionStatus,
    human_decision: input.humanDecision ?? null,
    override_reason: input.overrideReason ?? null,
    result: input.result ?? {},
    decided_at: new Date().toISOString()
  };

  if (input.decidedByProfileId) {
    update.decided_by_profile_id = input.decidedByProfileId;
  }

  const { error } = await client
    .from("smart_decisions")
    .update(update)
    .eq("tenant_id", input.tenantId)
    .eq("engine_key", input.engineKey)
    .eq("subject_type", input.subjectType)
    .eq("subject_id", input.subjectId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }
}

export function smartAuditMetadata(lifecycleEvent: string, metadata: Record<string, unknown> = {}) {
  return {
    lifecycle_event: lifecycleEvent,
    smart_flow: true,
    ...metadata
  };
}
