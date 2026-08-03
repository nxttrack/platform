import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type CanonicalCurriculumVersion = {
  id: string;
  program_id: string;
  version_number: number;
  name: string;
  formula_version: "swim_progress_v3";
  weighting_enabled: boolean;
  status: "published";
};

export type CanonicalCurriculumStage = {
  id: string;
  curriculum_version_id: string;
  stable_key: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  sort_order: number;
};

export type CanonicalCurriculumItem = {
  id: string;
  curriculum_version_id: string;
  curriculum_stage_id: string;
  identity_id: string;
  stable_key: string;
  name: string;
  description: string | null;
  context_json: Record<string, unknown>;
  weight: number;
  mastery_threshold: number;
  contributes_to_stage: boolean;
  contributes_to_diploma: boolean;
  required_for_transition: boolean;
  required_for_graduation: boolean;
  sort_order: number;
};

export type CanonicalStageAssignment = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  curriculum_version_id: string;
  curriculum_stage_id: string;
  status: "active";
  starts_at: string;
};

export type CanonicalAssessmentObservation = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  curriculum_version_id: string;
  curriculum_item_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  positive_label: string;
  note: string | null;
  visibility: "internal" | "parent_visible";
  context_json: Record<string, unknown>;
  source: string;
  observed_at: string;
  finalized_at: string;
  corrects_observation_id: string | null;
  correction_reason: string | null;
  session_id: string | null;
};

export type CanonicalProgressProjection = {
  enrollment_id: string;
  participant_id: string;
  curriculum_version_id: string;
  scope_kind: "item" | "stage" | "competency" | "diploma";
  scope_key: string;
  scope_id: string | null;
  progress_fraction: number | null;
  coverage_fraction: number | null;
  assessed_count: number;
  contributing_count: number;
  formula_version: "swim_progress_v3";
  calculated_at: string;
};

export type CanonicalItemCarryover = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  curriculum_item_id: string;
  curriculum_item_identity_id: string;
  from_stage_id: string;
  to_stage_id: string;
  transition_case_id: string;
  status: "open" | "completed" | "waived";
  completed_observation_id: string | null;
  completed_at: string | null;
};

export type SwimJourneyRing = {
  key: string;
  kind: "stage" | "diploma";
  label: string;
  progressPercent: number;
  coveragePercent: number;
  assessedCount: number;
  contributingCount: number;
  formulaVersion: "swim_progress_v3";
};

export type CanonicalSwimJourney = {
  enrollmentId: string;
  participantId: string;
  version: CanonicalCurriculumVersion;
  stages: CanonicalCurriculumStage[];
  currentStage: CanonicalCurriculumStage | null;
  items: CanonicalCurriculumItem[];
  currentStageItems: CanonicalCurriculumItem[];
  effectiveObservations: CanonicalAssessmentObservation[];
  carryovers: CanonicalItemCarryover[];
  projectionByScopeKey: Map<string, CanonicalProgressProjection>;
  rings: SwimJourneyRing[];
};

export type CanonicalSwimJourneyData = {
  versions: CanonicalCurriculumVersion[];
  stages: CanonicalCurriculumStage[];
  items: CanonicalCurriculumItem[];
  assignments: CanonicalStageAssignment[];
  observations: CanonicalAssessmentObservation[];
  projections: CanonicalProgressProjection[];
  carryovers: CanonicalItemCarryover[];
  byEnrollmentId: Map<string, CanonicalSwimJourney>;
};

export async function loadCanonicalSwimJourneys(input: {
  tenantId: string;
  enrollments: Array<{
    id: string;
    participant_id: string;
    curriculum_version_id: string | null;
  }>;
  parentVisibleOnly?: boolean;
}): Promise<CanonicalSwimJourneyData> {
  const versionedEnrollments = input.enrollments.filter(
    (enrollment): enrollment is typeof enrollment & { curriculum_version_id: string } =>
      Boolean(enrollment.curriculum_version_id)
  );
  const enrollmentIds = unique(versionedEnrollments.map((enrollment) => enrollment.id));
  const versionIds = unique(versionedEnrollments.map((enrollment) => enrollment.curriculum_version_id));

  if (enrollmentIds.length === 0 || versionIds.length === 0) {
    return emptyJourneyData();
  }

  const admin = createAdminClient();
  const observationsQuery = admin
    .from("swim_assessment_observations")
    .select("id, participant_id, enrollment_id, curriculum_version_id, curriculum_item_id, rating, positive_label, note, visibility, context_json, source, observed_at, finalized_at, corrects_observation_id, correction_reason, session_id")
    .eq("tenant_id", input.tenantId)
    .in("enrollment_id", enrollmentIds)
    .order("observed_at", { ascending: false })
    .order("finalized_at", { ascending: false });

  const [versionsResult, stagesResult, itemsResult, identitiesResult, assignmentsResult, observationsResult, retractionsResult, projectionsResult, carryoversResult] =
    await Promise.all([
      admin
        .from("curriculum_versions")
        .select("id, program_id, version_number, name, formula_version, weighting_enabled, status")
        .eq("tenant_id", input.tenantId)
        .eq("status", "published")
        .in("id", versionIds),
      admin
        .from("curriculum_stages")
        .select("id, curriculum_version_id, stable_key, name, description, color_hex, sort_order")
        .eq("tenant_id", input.tenantId)
        .in("curriculum_version_id", versionIds)
        .order("sort_order"),
      admin
        .from("curriculum_items")
        .select("id, curriculum_version_id, curriculum_stage_id, identity_id, name, description, context_json, weight, mastery_threshold, contributes_to_stage, contributes_to_diploma, required_for_transition, required_for_graduation, sort_order")
        .eq("tenant_id", input.tenantId)
        .in("curriculum_version_id", versionIds)
        .order("sort_order"),
      admin
        .from("curriculum_item_identities")
        .select("id, stable_key")
        .eq("tenant_id", input.tenantId),
      admin
        .from("enrollment_stage_assignments")
        .select("id, enrollment_id, participant_id, curriculum_version_id, curriculum_stage_id, status, starts_at")
        .eq("tenant_id", input.tenantId)
        .eq("status", "active")
        .in("enrollment_id", enrollmentIds),
      observationsQuery,
      admin
        .from("swim_assessment_retractions")
        .select("observation_id")
        .eq("tenant_id", input.tenantId),
      admin
        .from("swim_progress_projections")
        .select("enrollment_id, participant_id, curriculum_version_id, scope_kind, scope_key, scope_id, progress_fraction, coverage_fraction, assessed_count, contributing_count, formula_version, calculated_at")
        .eq("tenant_id", input.tenantId)
        .in("enrollment_id", enrollmentIds),
      admin
        .from("swim_item_carryovers")
        .select("id, participant_id, enrollment_id, curriculum_item_id, curriculum_item_identity_id, from_stage_id, to_stage_id, transition_case_id, status, completed_observation_id, completed_at")
        .eq("tenant_id", input.tenantId)
        .in("enrollment_id", enrollmentIds)
    ]);

  assertResult(versionsResult.error, "curriculumversies");
  assertResult(stagesResult.error, "curriculumstappen");
  assertResult(itemsResult.error, "curriculumonderdelen");
  assertResult(identitiesResult.error, "onderdeelidentiteiten");
  assertResult(assignmentsResult.error, "actieve badjes");
  assertResult(observationsResult.error, "beoordelingen");
  assertResult(retractionsResult.error, "beoordelingsintrekkingen");
  assertResult(projectionsResult.error, "voortgangsprojecties");
  assertResult(carryoversResult.error, "carryoveronderdelen");

  const versions = (versionsResult.data ?? []) as CanonicalCurriculumVersion[];
  const stages = (stagesResult.data ?? []) as CanonicalCurriculumStage[];
  const identityKeyById = new Map(
    ((identitiesResult.data ?? []) as Array<{ id: string; stable_key: string }>).map((identity) => [
      identity.id,
      identity.stable_key
    ])
  );
  const items = ((itemsResult.data ?? []) as Omit<CanonicalCurriculumItem, "stable_key">[]).map((item) => ({
    ...item,
    context_json: asObject(item.context_json),
    stable_key: identityKeyById.get(item.identity_id) ?? item.id,
    weight: Number(item.weight)
  }));
  const assignments = (assignmentsResult.data ?? []) as CanonicalStageAssignment[];
  const allObservations = ((observationsResult.data ?? []) as CanonicalAssessmentObservation[]).map((observation) => ({
    ...observation,
    context_json: asObject(observation.context_json)
  }));
  const retractedIds = new Set(
    ((retractionsResult.data ?? []) as Array<{ observation_id: string }>).map((retraction) => retraction.observation_id)
  );
  const activeCorrections = new Set(
    allObservations
      .filter((observation) => !retractedIds.has(observation.id) && observation.corrects_observation_id)
      .map((observation) => observation.corrects_observation_id as string)
  );
  const allEffectiveObservations = allObservations.filter(
    (observation) => !retractedIds.has(observation.id) && !activeCorrections.has(observation.id)
  );
  const effectiveObservations = input.parentVisibleOnly
    ? allEffectiveObservations.filter((observation) => observation.visibility === "parent_visible")
    : allEffectiveObservations;
  const projections = ((projectionsResult.data ?? []) as CanonicalProgressProjection[]).map((projection) => ({
    ...projection,
    progress_fraction: projection.progress_fraction === null ? null : Number(projection.progress_fraction),
    coverage_fraction: projection.coverage_fraction === null ? null : Number(projection.coverage_fraction)
  }));
  const carryovers = (carryoversResult.data ?? []) as CanonicalItemCarryover[];
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const assignmentByEnrollmentId = new Map(assignments.map((assignment) => [assignment.enrollment_id, assignment]));
  const byEnrollmentId = new Map<string, CanonicalSwimJourney>();

  for (const enrollment of versionedEnrollments) {
    const version = versionById.get(enrollment.curriculum_version_id);
    if (!version) {
      continue;
    }
    const journeyStages = stages.filter((stage) => stage.curriculum_version_id === version.id);
    const assignment = assignmentByEnrollmentId.get(enrollment.id);
    const currentStage = assignment
      ? journeyStages.find((stage) => stage.id === assignment.curriculum_stage_id) ?? null
      : journeyStages[0] ?? null;
    const journeyItems = items.filter((item) => item.curriculum_version_id === version.id);
    const journeyProjections = projections.filter((projection) => projection.enrollment_id === enrollment.id);
    const projectionByScopeKey = new Map(
      journeyProjections.map((projection) => [`${projection.scope_kind}:${projection.scope_key}`, projection])
    );
    const currentStageItems = currentStage
      ? journeyItems.filter((item) => item.curriculum_stage_id === currentStage.id)
      : [];
    const rings: SwimJourneyRing[] = [];

    if (journeyStages.length > 1 && currentStage) {
      rings.push(
        projectionRing({
          fallbackCount: currentStageItems.filter((item) => item.contributes_to_stage).length,
          key: currentStage.stable_key,
          kind: "stage",
          label: currentStage.name,
          projection: projectionByScopeKey.get(`stage:${currentStage.id}`)
        })
      );
    }
    rings.push(
      projectionRing({
        fallbackCount: journeyItems.filter((item) => item.contributes_to_diploma).length,
        key: "diploma",
        kind: "diploma",
        label: "Reis naar diploma",
        projection: projectionByScopeKey.get("diploma:diploma")
      })
    );

    byEnrollmentId.set(enrollment.id, {
      enrollmentId: enrollment.id,
      participantId: enrollment.participant_id,
      version,
      stages: journeyStages,
      currentStage,
      items: journeyItems,
      currentStageItems,
      effectiveObservations: effectiveObservations.filter(
        (observation) => observation.enrollment_id === enrollment.id
      ),
      carryovers: carryovers.filter((carryover) => carryover.enrollment_id === enrollment.id),
      projectionByScopeKey,
      rings
    });
  }

  return {
    versions,
    stages,
    items,
    assignments,
    observations: effectiveObservations,
    projections,
    carryovers,
    byEnrollmentId
  };
}

export function getJourneyForEnrollment(
  data: CanonicalSwimJourneyData,
  enrollmentId: string | null | undefined
) {
  return enrollmentId ? data.byEnrollmentId.get(enrollmentId) ?? null : null;
}

function projectionRing(input: {
  fallbackCount: number;
  key: string;
  kind: "stage" | "diploma";
  label: string;
  projection?: CanonicalProgressProjection;
}): SwimJourneyRing {
  return {
    key: input.key,
    kind: input.kind,
    label: input.label,
    progressPercent: percent(input.projection?.progress_fraction ?? 0),
    coveragePercent: percent(input.projection?.coverage_fraction ?? 0),
    assessedCount: input.projection?.assessed_count ?? 0,
    contributingCount: input.projection?.contributing_count ?? input.fallbackCount,
    formulaVersion: "swim_progress_v3"
  };
}

function percent(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10;
}

function emptyJourneyData(): CanonicalSwimJourneyData {
  return {
    versions: [],
    stages: [],
    items: [],
    assignments: [],
    observations: [],
    projections: [],
    carryovers: [],
    byEnrollmentId: new Map()
  };
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function assertResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Kon ${label} niet laden: ${error.message}`);
  }
}
