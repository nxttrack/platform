import type { PublicProgram } from "@/lib/public-site/tenant-site";
import type { IntakeQuestion, StageRecommendationCondition, StageRecommendationRule } from "@/lib/public-site/tenant-site";
import { smartBlocker, smartReason, upsertSmartDecision } from "@/lib/smart-flow/decision";
import type { SupabaseClient } from "@supabase/supabase-js";

type IntakeSubmissionSnapshot = {
  id: string;
  tenantId: string;
  program: PublicProgram;
  intakeType: string;
  participantBirthdate: string | null;
  preferredDays: string[];
  preferredTimeWindows: string[];
  answers: Record<string, unknown>;
  intakeFormConfigId: string;
  intakeConfigVersion: number;
  questions: IntakeQuestion[];
  stageRecommendationRules: StageRecommendationRule[];
};

type SmartDecisionClient = Pick<SupabaseClient, "from">;

export async function createIntakeRecommendationDecision(client: SmartDecisionClient, input: IntakeSubmissionSnapshot) {
  const orderedStages = [...input.program.stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const evaluatedRules = evaluateStageRules(input.stageRecommendationRules, orderedStages, input.answers);
  const bestRule = evaluatedRules.sort((left, right) => right.score - left.score)[0] ?? null;
  const defaultStage = bestRule?.stage ?? orderedStages[0] ?? null;
  const age = ageInYears(input.participantBirthdate);
  const missingInformation = requiredMissingInformation(input.questions, input.answers);
  const blockers = defaultStage
    ? []
    : [
        smartBlocker({
          code: "no_active_stage",
          label: "Geen actief niveau beschikbaar",
          detail: "Het programma heeft nog geen actief niveau om als startpunt te adviseren."
        })
      ];
  const answerKeys = Object.keys(input.answers);
  const score = defaultStage
    ? Math.min(100, Math.max(bestRule?.score ?? 0, 45) + (input.preferredDays.length > 0 ? 6 : 0) + (input.preferredTimeWindows.length > 0 ? 4 : 0) + (age && age >= 4 ? 5 : 0) - Math.min(20, missingInformation.length * 5))
    : 0;
  const reasons = [
    smartReason({
      code: "program_selected",
      label: "Programma gekozen",
      detail: `${input.program.name} is gekozen als zwemroute.`,
      weight: 20,
      evidence: { program_id: input.program.id, program_code: input.program.code }
    }),
    defaultStage
      ? smartReason({
          code: "default_start_stage",
          label: bestRule ? "Startniveau op basis van intake-regels" : "Startniveau op basis van programma",
          detail: bestRule ? `${defaultStage.name} scoort het beste op de ingestelde intake-regels.` : `${defaultStage.name} is het eerste actieve niveau in dit programma.`,
          weight: 25,
          evidence: { stage_id: defaultStage.id, stage_code: defaultStage.code, matched_rule: bestRule?.label ?? null }
        })
      : smartReason({
          code: "manual_stage_review",
          label: "Handmatige niveaubeoordeling nodig",
          detail: "Er is geen standaardniveau beschikbaar."
        }),
    smartReason({
      code: "preferences_captured",
      label: "Voorkeuren vastgelegd",
      detail: `${input.preferredDays.length} voorkeursdagen en ${input.preferredTimeWindows.length} tijdsvoorkeuren zijn opgeslagen.`,
      weight: 10,
      evidence: { preferred_days_count: input.preferredDays.length, preferred_time_windows_count: input.preferredTimeWindows.length }
    })
  ];

  for (const reason of bestRule?.reasons ?? []) {
    reasons.push(
      smartReason({
        code: "stage_rule_match",
        label: reason,
        weight: 10,
        evidence: { stage_id: bestRule.stage.id, stage_code: bestRule.stage.code }
      })
    );
  }

  for (const missing of missingInformation) {
    blockers.push(
      smartBlocker({
        code: "missing_information",
        label: "Ontbrekende intake-informatie",
        detail: missing,
        severity: "warning"
      })
    );
  }

  if (age !== null) {
    reasons.push(
      smartReason({
        code: "age_signal",
        label: "Leeftijdssignaal",
        detail: `De leerling is ongeveer ${age} jaar.`,
        weight: 10,
        evidence: { age_years: age }
      })
    );
  }

  const recommendation = {
    action: defaultStage ? "recommend_start_stage" : "manual_review",
    recommended_stage_id: defaultStage?.id ?? null,
    recommended_stage_label: defaultStage?.name ?? null,
    missing_information: missingInformation,
    parent_summary: defaultStage ? "We beoordelen de intake en gebruiken het eerste passende niveau als startpunt." : "We beoordelen de intake handmatig."
  };
  const decisionId = await upsertSmartDecision(client, {
    tenantId: input.tenantId,
    engineKey: "intake_recommendation",
    subjectType: "intake_submission",
    subjectId: input.id,
    inputSnapshot: {
      program_id: input.program.id,
      program_code: input.program.code,
      intake_type: input.intakeType,
      intake_form_config_id: input.intakeFormConfigId,
      intake_config_version: input.intakeConfigVersion,
      participant_age_years: age,
      preferred_days_count: input.preferredDays.length,
      preferred_time_windows_count: input.preferredTimeWindows.length,
      answer_keys: answerKeys,
      evaluated_rules: evaluatedRules.map((rule) => ({
        stage_id: rule.stage.id,
        stage_code: rule.stage.code,
        score: rule.score,
        matched_conditions: rule.matchedConditions
      }))
    },
    ruleVersion: "intake-recommendation-v1",
    score,
    reasons,
    blockers,
    recommendation,
    metadata: {
      source: "public_intake",
      automation_mode: "semi_automatic"
    }
  });

  return {
    decisionId,
    recommendationSnapshot: {
      ...recommendation,
      score,
      confidence: blockers.some((blocker) => blocker.severity !== "warning") ? "low" : score >= 80 ? "high" : score >= 55 ? "medium" : "low",
      rule_version: "intake-recommendation-v1",
      evaluated_rules: evaluatedRules.map((rule) => ({
        stage_id: rule.stage.id,
        stage_code: rule.stage.code,
        score: rule.score,
        matched_conditions: rule.matchedConditions
      }))
    },
    missingInformation
  };
}

type EvaluatedStageRule = {
  stage: PublicProgram["stages"][number];
  label: string | null;
  score: number;
  matchedConditions: number;
  reasons: string[];
};

function evaluateStageRules(rules: StageRecommendationRule[], stages: PublicProgram["stages"], answers: Record<string, unknown>): EvaluatedStageRule[] {
  return rules.flatMap((rule) => {
    const stage = stages.find((candidate) => (rule.stageId ? candidate.id === rule.stageId : false) || (rule.stageCode ? candidate.code === rule.stageCode : false));

    if (!stage) {
      return [];
    }

    let score = typeof rule.baseScore === "number" ? rule.baseScore : 40;
    let matchedConditions = 0;
    const reasons: string[] = [];

    for (const condition of rule.conditions ?? []) {
      if (matchesStageCondition(condition, answers)) {
        score += condition.points ?? 10;
        matchedConditions += 1;

        if (condition.reason) {
          reasons.push(condition.reason);
        }
      }
    }

    return [
      {
        stage,
        label: rule.label ?? null,
        score: Math.max(0, Math.min(100, score)),
        matchedConditions,
        reasons
      }
    ];
  });
}

function matchesStageCondition(condition: StageRecommendationCondition, answers: Record<string, unknown>) {
  const rawValue = answers[condition.question];
  const values = answerValues(rawValue);
  const expected = Array.isArray(condition.value) ? condition.value.map(String) : condition.value === null || typeof condition.value === "undefined" ? [] : [String(condition.value)];

  if (condition.operator === "exists") {
    return values.length > 0;
  }

  if (condition.operator === "equals") {
    return values.some((value) => expected.includes(value));
  }

  if (condition.operator === "not_equals") {
    return values.every((value) => !expected.includes(value));
  }

  if (condition.operator === "in") {
    return values.some((value) => expected.includes(value));
  }

  if (condition.operator === "contains") {
    return values.some((value) => expected.some((expectedValue) => value.toLowerCase().includes(expectedValue.toLowerCase())));
  }

  if (condition.operator === "gte" || condition.operator === "lte") {
    const numericValue = Number(values[0]);
    const numericExpected = Number(expected[0]);

    if (!Number.isFinite(numericValue) || !Number.isFinite(numericExpected)) {
      return false;
    }

    return condition.operator === "gte" ? numericValue >= numericExpected : numericValue <= numericExpected;
  }

  return false;
}

function requiredMissingInformation(questions: IntakeQuestion[], answers: Record<string, unknown>) {
  return questions.flatMap((question) => {
    if (!question.required || !questionIsActive(question, answers)) {
      return [];
    }

    return answerValues(answers[question.name]).length > 0 ? [] : [`${question.label} ontbreekt.`];
  });
}

function questionIsActive(question: IntakeQuestion, answers: Record<string, unknown>) {
  if (!question.condition) {
    return true;
  }

  const values = answerValues(answers[question.condition.question]);
  const expected = Array.isArray(question.condition.value) ? question.condition.value : question.condition.value ? [question.condition.value] : [];

  if (question.condition.operator === "exists") {
    return values.length > 0;
  }

  if (question.condition.operator === "equals") {
    return values.some((value) => expected.includes(value));
  }

  if (question.condition.operator === "not_equals") {
    return values.every((value) => !expected.includes(value));
  }

  if (question.condition.operator === "in") {
    return values.some((value) => expected.includes(value));
  }

  return true;
}

function answerValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
  }

  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function ageInYears(value: string | null) {
  if (!value) {
    return null;
  }

  const birthdate = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(birthdate.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birthdate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birthdate.getUTCMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < birthdate.getUTCDate())) {
    age -= 1;
  }

  return Math.max(0, age);
}
