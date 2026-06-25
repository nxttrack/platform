import type { PublicProgram } from "@/lib/public-site/tenant-site";
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
  answers: Record<string, string>;
  intakeFormConfigId: string;
};

type SmartDecisionClient = Pick<SupabaseClient, "from">;

export async function createIntakeRecommendationDecision(client: SmartDecisionClient, input: IntakeSubmissionSnapshot) {
  const orderedStages = [...input.program.stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const defaultStage = orderedStages[0] ?? null;
  const age = ageInYears(input.participantBirthdate);
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
  const score = defaultStage ? Math.min(100, 55 + (input.preferredDays.length > 0 ? 10 : 0) + (input.preferredTimeWindows.length > 0 ? 5 : 0) + (answerKeys.length > 0 ? 10 : 0) + (age && age >= 4 ? 10 : 0)) : 0;
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
          label: "Startniveau op basis van programma",
          detail: `${defaultStage.name} is het eerste actieve niveau in dit programma.`,
          weight: 25,
          evidence: { stage_id: defaultStage.id, stage_code: defaultStage.code }
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

  return upsertSmartDecision(client, {
    tenantId: input.tenantId,
    engineKey: "intake_recommendation",
    subjectType: "intake_submission",
    subjectId: input.id,
    inputSnapshot: {
      program_id: input.program.id,
      program_code: input.program.code,
      intake_type: input.intakeType,
      intake_form_config_id: input.intakeFormConfigId,
      participant_age_years: age,
      preferred_days_count: input.preferredDays.length,
      preferred_time_windows_count: input.preferredTimeWindows.length,
      answer_keys: answerKeys
    },
    ruleVersion: "intake-recommendation-v1",
    score,
    reasons,
    blockers,
    recommendation: {
      action: defaultStage ? "recommend_start_stage" : "manual_review",
      recommended_stage_id: defaultStage?.id ?? null,
      recommended_stage_label: defaultStage?.name ?? null,
      parent_summary: defaultStage ? "We beoordelen de intake en gebruiken het eerste passende niveau als startpunt." : "We beoordelen de intake handmatig."
    },
    metadata: {
      source: "public_intake",
      automation_mode: "semi_automatic"
    }
  });
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
