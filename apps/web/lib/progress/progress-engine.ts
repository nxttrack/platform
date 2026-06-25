import { confidenceFromScore, smartBlocker, smartReason, type SmartDecisionBlocker, type SmartDecisionReason } from "@/lib/smart-flow/decision";
import { createClient } from "@/lib/supabase/server";

type TenantSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type EnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
};

type BadgeRuleRow = {
  id: string;
  badge_id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string;
  name: string;
  trigger_type: string;
  min_score: number | null;
  required_module_ids: string[] | null;
  required_status: string;
  recommendation_copy: string | null;
};

type BadgeRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
};

type ModuleProgressRow = {
  id: string;
  stage_id: string;
  stage_module_id: string;
  status: string;
  score: number | null;
  assessed_at: string;
};

type StageModuleRow = {
  id: string;
  name: string;
  stage_id: string;
};

export type ProgressStatus = "observed" | "in_progress" | "passed" | "needs_attention";

export type ProgressEvidenceInput = {
  tenantId: string;
  participantId: string;
  enrollmentId: string;
  stageId?: string | null;
  stageModuleId?: string | null;
  progressId?: string | null;
  stageModuleProgressId?: string | null;
  badgeAwardId?: string | null;
  stageTransitionProposalId?: string | null;
  eventType: "progress_observation" | "module_assessment" | "badge_recommendation" | "badge_award" | "stage_transition_proposal" | "compliment";
  title: string;
  summary?: string | null;
  parentSummary?: string | null;
  evidenceSource?: "instructor" | "admin" | "system" | "parent";
  score?: number | null;
  createdByProfileId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function createProgressEvidenceEvent(supabase: TenantSupabaseClient, input: ProgressEvidenceInput) {
  const result = await supabase.from("progress_evidence_events").insert({
    tenant_id: input.tenantId,
    participant_id: input.participantId,
    enrollment_id: input.enrollmentId,
    stage_id: input.stageId ?? null,
    stage_module_id: input.stageModuleId ?? null,
    progress_id: input.progressId ?? null,
    stage_module_progress_id: input.stageModuleProgressId ?? null,
    badge_award_id: input.badgeAwardId ?? null,
    stage_transition_proposal_id: input.stageTransitionProposalId ?? null,
    event_type: input.eventType,
    title: input.title,
    summary: input.summary ?? null,
    parent_summary: input.parentSummary ?? input.summary ?? null,
    evidence_source: input.evidenceSource ?? "instructor",
    score: input.score ?? null,
    created_by_profile_id: input.createdByProfileId ?? null,
    metadata: input.metadata ?? {}
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export function buildParentProgressSummary(subject: string, status: ProgressStatus, score: number | null, note?: string | null) {
  const scoreText = score === null ? "" : ` (${score}%)`;
  const suffix = note?.trim() ? ` ${note.trim()}` : "";

  if (status === "passed") {
    return `${subject} is afgerond${scoreText}. Mooi zichtbaar stapje vooruit.${suffix}`;
  }

  if (status === "needs_attention") {
    return `${subject} vraagt nog extra aandacht${scoreText}. De instructeur blijft dit gericht volgen.${suffix}`;
  }

  if (status === "in_progress") {
    return `${subject} is in ontwikkeling${scoreText}. Er is vooruitgang zichtbaar, maar het onderdeel is nog niet afgerond.${suffix}`;
  }

  return `${subject} is geobserveerd${scoreText}. De instructeur heeft een update toegevoegd.${suffix}`;
}

export function buildEvidenceSnapshot(input: {
  status: ProgressStatus;
  score: number | null;
  note?: string | null;
  subject: string;
  source: "progress" | "module_progress" | "stage_transition";
  templateId?: string | null;
}) {
  return {
    source: input.source,
    subject: input.subject,
    status: input.status,
    score: input.score,
    note: input.note ?? null,
    template_id: input.templateId ?? null,
    captured_at: new Date().toISOString()
  };
}

export async function evaluateBadgeRecommendations(
  supabase: TenantSupabaseClient,
  input: {
    tenantId: string;
    participantId: string;
    enrollmentId: string;
  }
) {
  const enrollmentResult = await supabase
    .from("enrollments")
    .select("id, participant_id, program_id, current_stage_id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.enrollmentId)
    .maybeSingle();

  if (enrollmentResult.error) {
    throw new Error(enrollmentResult.error.message);
  }

  const enrollment = enrollmentResult.data as EnrollmentRow | null;

  if (!enrollment) {
    return [];
  }

  const [rulesResult, badgesResult, modulesResult, moduleProgressResult, awardsResult] = await Promise.all([
    supabase.from("badge_rules").select("id, badge_id, program_id, stage_id, code, name, trigger_type, min_score, required_module_ids, required_status, recommendation_copy").eq("tenant_id", input.tenantId).eq("status", "active"),
    supabase.from("badges").select("id, name, description, status").eq("tenant_id", input.tenantId).eq("status", "active"),
    supabase.from("stage_modules").select("id, name, stage_id").eq("tenant_id", input.tenantId),
    supabase
      .from("stage_module_progress")
      .select("id, stage_id, stage_module_id, status, score, assessed_at")
      .eq("tenant_id", input.tenantId)
      .eq("enrollment_id", input.enrollmentId),
    supabase
      .from("badge_awards")
      .select("badge_id")
      .eq("tenant_id", input.tenantId)
      .eq("participant_id", input.participantId)
      .eq("enrollment_id", input.enrollmentId)
      .eq("status", "awarded")
  ]);

  const firstError = rulesResult.error ?? badgesResult.error ?? modulesResult.error ?? moduleProgressResult.error ?? awardsResult.error;

  if (firstError) {
    throw new Error(firstError.message);
  }

  const badges = new Map(((badgesResult.data ?? []) as BadgeRow[]).map((badge) => [badge.id, badge]));
  const modules = new Map(((modulesResult.data ?? []) as StageModuleRow[]).map((module) => [module.id, module]));
  const moduleProgress = (moduleProgressResult.data ?? []) as ModuleProgressRow[];
  const awardedBadgeIds = new Set(((awardsResult.data ?? []) as { badge_id: string }[]).map((award) => award.badge_id));
  const recommendations = [];

  for (const rule of (rulesResult.data ?? []) as BadgeRuleRow[]) {
    if (rule.trigger_type !== "progress_recommendation" || awardedBadgeIds.has(rule.badge_id)) {
      continue;
    }

    if (rule.program_id && rule.program_id !== enrollment.program_id) {
      continue;
    }

    if (rule.stage_id && rule.stage_id !== enrollment.current_stage_id) {
      continue;
    }

    const badge = badges.get(rule.badge_id);

    if (!badge) {
      continue;
    }

    const requiredModuleIds = Array.isArray(rule.required_module_ids) ? rule.required_module_ids : [];
    const candidateProgress = requiredModuleIds.length > 0
      ? moduleProgress.filter((progress) => requiredModuleIds.includes(progress.stage_module_id))
      : moduleProgress.filter((progress) => !rule.stage_id || progress.stage_id === rule.stage_id);
    const completed = candidateProgress.filter((progress) => progress.status === rule.required_status || progress.status === "passed");
    const averageScore = average(candidateProgress.map((progress) => progress.score).filter((score): score is number => typeof score === "number"));
    const moduleFit = requiredModuleIds.length > 0 ? Math.round((completed.length / Math.max(requiredModuleIds.length, 1)) * 100) : completed.length > 0 ? 100 : 0;
    const score = Math.round((moduleFit * 0.6) + ((averageScore ?? moduleFit) * 0.4));
    const blockers: SmartDecisionBlocker[] = [];
    const reasons: SmartDecisionReason[] = [
      smartReason({
        code: "module_fit",
        label: `${completed.length}/${requiredModuleIds.length || candidateProgress.length || 1} onderdelen passend`,
        detail: "Gebaseerd op modulevoortgang binnen het huidige niveau.",
        weight: 60,
        visibleToParent: false
      })
    ];

    if (averageScore !== null) {
      reasons.push(
        smartReason({
          code: "average_score",
          label: `Gemiddelde score ${averageScore}%`,
          detail: "Scores uit de recente modulebeoordelingen tellen mee.",
          weight: 40,
          visibleToParent: false
        })
      );
    }

    if (requiredModuleIds.length > 0 && completed.length < requiredModuleIds.length) {
      blockers.push(
        smartBlocker({
          code: "missing_required_modules",
          label: "Nog niet alle verplichte onderdelen zijn afgerond.",
          severity: "warning",
          evidence: {
            completed: completed.length,
            required: requiredModuleIds.length
          }
        })
      );
    }

    if (typeof rule.min_score === "number" && score < rule.min_score) {
      blockers.push(
        smartBlocker({
          code: "score_below_threshold",
          label: `Score ${score}% is lager dan drempel ${rule.min_score}%.`,
          severity: "warning"
        })
      );
    }

    if (score < 75) {
      continue;
    }

    const evidenceSnapshot = {
      badge: {
        id: badge.id,
        name: badge.name
      },
      rule: {
        id: rule.id,
        code: rule.code,
        min_score: rule.min_score,
        approval_role: "either"
      },
      modules: candidateProgress.map((progress) => ({
        id: progress.stage_module_id,
        name: modules.get(progress.stage_module_id)?.name ?? "Module",
        status: progress.status,
        score: progress.score,
        assessed_at: progress.assessed_at
      }))
    };

    const { data, error } = await supabase
      .from("badge_recommendations")
      .upsert(
        {
          tenant_id: input.tenantId,
          badge_rule_id: rule.id,
          badge_id: rule.badge_id,
          participant_id: input.participantId,
          enrollment_id: input.enrollmentId,
          score,
          confidence: confidenceFromScore(score, blockers),
          reasons,
          blockers,
          evidence_snapshot: evidenceSnapshot,
          status: "recommended",
          review_note: rule.recommendation_copy ?? badge.description ?? null
        },
        { onConflict: "tenant_id,badge_id,participant_id,enrollment_id,status" }
      )
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? "Badge-aanbeveling kon niet worden opgeslagen.");
    }

    recommendations.push({ id: (data as { id: string }).id, badgeId: rule.badge_id, score, reasons, blockers, evidenceSnapshot });
  }

  return recommendations;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
