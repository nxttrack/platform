import type { SupabaseClient } from "@supabase/supabase-js";

import { confidenceFromScore, smartBlocker, smartReason, upsertSmartDecision, type SmartDecisionBlocker, type SmartDecisionReason } from "@/lib/smart-flow/decision";

export const waitlistRuleVersion = "waitlist-v1";

export type WaitlistDuplicateRisk = "unknown" | "none" | "warning" | "blocking";
export type WaitlistAdminPriority = "low" | "normal" | "high" | "urgent";

export type WaitlistRankingEntryInput = {
  id: string;
  program_id: string;
  recommended_stage_id: string | null;
  priority_date: string;
  preferred_days: string[];
  preferred_time_windows: string[];
  source: string;
  admin_priority?: WaitlistAdminPriority | string | null;
  priority_reason?: string | null;
  urgency_reason?: string | null;
  tenant_reason_code?: string | null;
  family_key?: string | null;
  sibling_participant_id?: string | null;
  duplicate_risk?: WaitlistDuplicateRisk | string | null;
  intake_type?: string | null;
  created_at?: string | null;
};

export type WaitlistRankingGroupInput = {
  id: string;
  stage_id: string;
  weekday: number;
  starts_at: string;
  ends_at?: string | null;
};

export type WaitlistRankingInput = {
  entry: WaitlistRankingEntryInput;
  targetGroup?: WaitlistRankingGroupInput | null;
  now?: Date;
};

export type WaitlistRankingResult = {
  score: number;
  confidence: ReturnType<typeof confidenceFromScore>;
  reasons: SmartDecisionReason[];
  blockers: SmartDecisionBlocker[];
  snapshot: Record<string, unknown>;
  recommendation: Record<string, unknown>;
};

type SmartDecisionClient = Pick<SupabaseClient, "from">;

export function scoreWaitlistEntry(input: WaitlistRankingInput): WaitlistRankingResult {
  const entry = input.entry;
  const now = input.now ?? new Date();
  const targetGroup = input.targetGroup ?? null;
  const priorityDays = Math.max(0, daysBetween(entry.priority_date, now));
  const priorityScore = Math.min(30, Math.floor(priorityDays / 2));
  const adminPriority = normalizePriority(entry.admin_priority);
  const duplicateRisk = normalizeDuplicateRisk(entry.duplicate_risk);
  const targetWeekday = targetGroup ? weekdayToPreference(targetGroup.weekday) : null;
  const targetTimeBucket = targetGroup ? timeBucketForGroup(targetGroup) : null;
  const stageMatch = targetGroup ? entry.recommended_stage_id === targetGroup.stage_id : Boolean(entry.recommended_stage_id);
  const dayMatch = targetWeekday ? entry.preferred_days.includes(targetWeekday) : entry.preferred_days.length > 0;
  const timeMatch = targetTimeBucket ? entry.preferred_time_windows.includes(targetTimeBucket) || Boolean(targetGroup && targetGroup.weekday >= 6 && entry.preferred_time_windows.includes("weekend")) : entry.preferred_time_windows.length > 0;
  const familyMatch = Boolean(entry.family_key || entry.sibling_participant_id);
  const registrationPreferenceScore = registrationPreferenceWeight(entry.intake_type ?? entry.source);
  const adminPriorityScore = adminPriorityWeight(adminPriority);
  const urgencyScore = entry.urgency_reason || entry.tenant_reason_code ? 5 : 0;
  const duplicateScore = duplicateRiskWeight(duplicateRisk);

  const reasons = [
    smartReason({
      code: "priority_date",
      label: "Prioriteitsdatum",
      detail: `${priorityDays} dagen sinds prioriteitsdatum; eerlijkheidsgewicht telt mee.`,
      weight: priorityScore,
      evidence: { priority_date: entry.priority_date, priority_days: priorityDays }
    }),
    smartReason({
      code: stageMatch ? "stage_match" : "stage_review_needed",
      label: stageMatch ? "Niveau matcht" : "Niveau vraagt review",
      detail: targetGroup ? (stageMatch ? "Aanbevolen niveau past bij de gekozen groep." : "Aanbevolen niveau wijkt af van de gekozen groep of ontbreekt.") : entry.recommended_stage_id ? "Aanbevolen niveau is bekend voor ranking." : "Er is nog geen aanbevolen niveau.",
      weight: targetGroup ? (stageMatch ? 20 : 0) : entry.recommended_stage_id ? 10 : 0,
      evidence: { recommended_stage_id: entry.recommended_stage_id, target_stage_id: targetGroup?.stage_id ?? null }
    }),
    smartReason({
      code: dayMatch ? "preferred_day_match" : "preferred_day_missing",
      label: dayMatch ? "Voorkeursdag matcht" : "Geen voorkeursdag-match",
      detail: targetWeekday ? (dayMatch ? "De groep valt op een opgegeven voorkeursdag." : "De groep valt niet op een opgegeven voorkeursdag.") : "Voorkeursdagen zijn meegenomen in de wachtrijranking.",
      weight: dayMatch ? 15 : 0,
      evidence: { preferred_days: entry.preferred_days, target_weekday: targetWeekday }
    }),
    smartReason({
      code: timeMatch ? "preferred_time_match" : "preferred_time_missing",
      label: timeMatch ? "Voorkeurstijd matcht" : "Geen tijdmatch",
      detail: targetTimeBucket ? (timeMatch ? "Het lestijdvak past bij de opgegeven voorkeur." : "Het lestijdvak valt buiten de opgegeven voorkeur.") : "Tijdvoorkeuren zijn meegenomen in de wachtrijranking.",
      weight: timeMatch ? 10 : 0,
      evidence: { preferred_time_windows: entry.preferred_time_windows, target_time_bucket: targetTimeBucket }
    }),
    smartReason({
      code: familyMatch ? "family_policy" : "no_family_signal",
      label: familyMatch ? "Gezinsbeleid" : "Geen gezinsvoordeel",
      detail: familyMatch ? "Er is een gezins- of sibling-signaal aanwezig." : "Er is geen gezins- of sibling-signaal ingesteld.",
      weight: familyMatch ? 8 : 0,
      evidence: { family_key: entry.family_key, sibling_participant_id: entry.sibling_participant_id }
    }),
    smartReason({
      code: "registration_preference",
      label: "Aanmeldtype",
      detail: registrationPreferenceLabel(entry.intake_type ?? entry.source),
      weight: registrationPreferenceScore,
      evidence: { source: entry.source, intake_type: entry.intake_type }
    }),
    smartReason({
      code: `admin_priority_${adminPriority}`,
      label: "Admin-prioriteit",
      detail: adminPriority === "normal" ? "Geen handmatige prioriteitsverhoging." : `Prioriteit: ${adminPriority}.`,
      weight: adminPriorityScore,
      evidence: { admin_priority: adminPriority, priority_reason: entry.priority_reason }
    }),
    smartReason({
      code: urgencyScore > 0 ? "tenant_urgency" : "no_tenant_urgency",
      label: urgencyScore > 0 ? "Urgentie/tenantreden" : "Geen urgentiereden",
      detail: entry.urgency_reason || entry.tenant_reason_code || "Geen tenant-specifieke urgentiereden ingesteld.",
      weight: urgencyScore,
      evidence: { urgency_reason: entry.urgency_reason, tenant_reason_code: entry.tenant_reason_code }
    }),
    smartReason({
      code: `duplicate_${duplicateRisk}`,
      label: "Duplicaatveiligheid",
      detail: duplicateRiskDetail(duplicateRisk),
      weight: duplicateScore,
      evidence: { duplicate_risk: duplicateRisk }
    })
  ];

  const blockers = duplicateRisk === "blocking"
    ? [
        smartBlocker({
          code: "duplicate_blocking",
          label: "Mogelijk bestaand actief dossier",
          detail: "Controleer de duplicaatwaarschuwing voordat je deze kandidaat plaatst.",
          severity: "blocking"
        })
      ]
    : duplicateRisk === "warning"
      ? [
          smartBlocker({
            code: "duplicate_warning",
            label: "Duplicaatwaarschuwing",
            detail: "Er is een mogelijke match gevonden; controleer voor plaatsing.",
            severity: "warning"
          })
        ]
      : [];

  const stageScore = targetGroup ? (stageMatch ? 20 : 0) : entry.recommended_stage_id ? 10 : 0;
  const dayScore = dayMatch ? 15 : 0;
  const timeScore = timeMatch ? 10 : 0;
  const familyScore = familyMatch ? 8 : 0;
  const rawScore = 20 + priorityScore + stageScore + dayScore + timeScore + familyScore + registrationPreferenceScore + adminPriorityScore + urgencyScore + duplicateScore;
  const score = clampScore(rawScore);
  const confidence = confidenceFromScore(score, blockers);
  const snapshot = {
    rule_version: waitlistRuleVersion,
    waitlist_entry_id: entry.id,
    program_id: entry.program_id,
    recommended_stage_id: entry.recommended_stage_id,
    target_group_id: targetGroup?.id ?? null,
    target_stage_id: targetGroup?.stage_id ?? null,
    target_weekday: targetWeekday,
    target_time_bucket: targetTimeBucket,
    priority_date: entry.priority_date,
    priority_days: priorityDays,
    preferred_days: entry.preferred_days,
    preferred_time_windows: entry.preferred_time_windows,
    source: entry.source,
    intake_type: entry.intake_type ?? null,
    admin_priority: adminPriority,
    duplicate_risk: duplicateRisk,
    calculated_at: now.toISOString()
  };

  return {
    score,
    confidence,
    reasons,
    blockers,
    snapshot,
    recommendation: {
      action: targetGroup ? "consider_for_group" : "rank_waitlist_candidate",
      score,
      confidence,
      target_group_id: targetGroup?.id ?? null,
      parent_summary: "De zwemschool beoordeelt de wachtrij op voorkeuren, niveau, capaciteit en eerlijkheid.",
      admin_summary: "Ranking is gebaseerd op prioriteitsdatum, niveau, voorkeuren, gezinsbeleid, aanmeldtype, admin-prioriteit, urgentie en duplicaatrisico."
    }
  };
}

export async function upsertWaitlistSmartDecision(
  client: SmartDecisionClient,
  input: {
    tenantId: string;
    waitlistEntryId: string;
    ranking: WaitlistRankingResult;
    result?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
) {
  return upsertSmartDecision(client, {
    tenantId: input.tenantId,
    engineKey: "waitlist",
    subjectType: "waitlist_entry",
    subjectId: input.waitlistEntryId,
    inputSnapshot: input.ranking.snapshot,
    ruleVersion: waitlistRuleVersion,
    score: input.ranking.score,
    confidence: input.ranking.confidence,
    reasons: input.ranking.reasons,
    blockers: input.ranking.blockers,
    recommendation: input.ranking.recommendation,
    result: input.result,
    metadata: {
      source: "waitlist_ranking",
      automation_mode: "semi_automatic",
      ...input.metadata
    }
  });
}

export function normalizeDuplicateRisk(value: string | null | undefined): WaitlistDuplicateRisk {
  if (value === "none" || value === "warning" || value === "blocking") {
    return value;
  }

  return "unknown";
}

function normalizePriority(value: string | null | undefined): WaitlistAdminPriority {
  if (value === "low" || value === "high" || value === "urgent") {
    return value;
  }

  return "normal";
}

function daysBetween(dateValue: string, now: Date) {
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00.000Z`);
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return Math.floor((current.getTime() - date.getTime()) / 86_400_000);
}

function weekdayToPreference(weekday: number) {
  const values = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

  return values[weekday - 1] ?? "monday";
}

function timeBucketForGroup(group: WaitlistRankingGroupInput) {
  if (group.weekday >= 6) {
    return "weekend";
  }

  const hour = Number(group.starts_at.slice(0, 2));

  if (Number.isNaN(hour)) {
    return "afternoon";
  }

  if (hour < 12) {
    return "morning";
  }

  if (hour < 18) {
    return "afternoon";
  }

  return "evening";
}

function registrationPreferenceWeight(value: string | null | undefined) {
  if (value === "registration") {
    return 7;
  }

  if (value === "trial") {
    return 5;
  }

  if (value === "waitlist") {
    return 3;
  }

  if (value === "manual") {
    return 4;
  }

  return 2;
}

function registrationPreferenceLabel(value: string | null | undefined) {
  if (value === "registration") {
    return "Reguliere inschrijving krijgt licht voorrang boven vrijblijvende signalen.";
  }

  if (value === "trial") {
    return "Proeflesaanvraag is meegenomen als plaatsingssignaal.";
  }

  if (value === "waitlist") {
    return "Wachtlijstaanvraag is meegenomen.";
  }

  if (value === "manual") {
    return "Handmatige regel krijgt een lichte beheerweging.";
  }

  return "Aanmeldtype onbekend; neutrale weging toegepast.";
}

function adminPriorityWeight(priority: WaitlistAdminPriority) {
  if (priority === "urgent") {
    return 18;
  }

  if (priority === "high") {
    return 10;
  }

  if (priority === "low") {
    return -5;
  }

  return 0;
}

function duplicateRiskWeight(risk: WaitlistDuplicateRisk) {
  if (risk === "none") {
    return 4;
  }

  if (risk === "warning") {
    return -6;
  }

  if (risk === "blocking") {
    return -15;
  }

  return 0;
}

function duplicateRiskDetail(risk: WaitlistDuplicateRisk) {
  if (risk === "none") {
    return "Geen open duplicaatwaarschuwing gevonden.";
  }

  if (risk === "warning") {
    return "Mogelijke duplicaatmatch; controle aanbevolen.";
  }

  if (risk === "blocking") {
    return "Sterke duplicaatmatch; plaatsing niet zonder review.";
  }

  return "Duplicaatstatus onbekend.";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
