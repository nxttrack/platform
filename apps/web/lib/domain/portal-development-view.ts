import { childAssessmentCompliment } from "./child-assessment-compliment";
import { childJourneyView, parentJourneyView, type PortalJourneyViewNode } from "./portal-journey-view";
import { compareAssessmentRecency, latestJourneyObservations } from "./swim-assessment-order";
import type { CanonicalJourneyChapterSnapshot, CanonicalSwimJourney } from "./swim-progress";
import type { PortalJourneyView } from "./portal-journey-view";

export type PortalDevelopmentItem = PortalJourneyViewNode & { stageId: string; stageName: string; current: boolean; masteryThreshold: number };
export type PortalAssessmentHistory = Readonly<{
  id: string; itemId: string; label: string; at: string; finalizedAt: string; rating: 1 | 2 | 3 | 4 | 5; previousRating: 1 | 2 | 3 | 4 | 5 | null;
  status: "recorded" | "corrected" | "retracted"; correction: boolean; current: boolean; positiveLabel: string | null;
}>;
export type PortalDevelopmentView = Readonly<{
  stageId: string | null; stageName: string | null;
  stages: readonly { id: string; name: string }[];
  items: readonly PortalDevelopmentItem[];
  history: readonly PortalAssessmentHistory[];
}>;

/** Separate explicit projections; notes, actors, sessions, correction reasons and source JSON stay on the server. */
export function parentDevelopmentView(journey: CanonicalSwimJourney): PortalDevelopmentView { return project(journey, "parent"); }
export function childDevelopmentView(journey: CanonicalSwimJourney): PortalDevelopmentView { return project(journey, "child"); }

/** Historical numbers come only from the frozen chapter payload, never today's observations. */
export function chapterJourneyView(journey: CanonicalSwimJourney, snapshot: CanonicalJourneyChapterSnapshot): PortalJourneyView {
  const raw = Array.isArray(snapshot.completion_data_json.items) ? snapshot.completion_data_json.items : [];
  const saved = new Map(raw.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)).flatMap((row) => typeof row.stableKey === "string" ? [[row.stableKey, row] as const] : []));
  const metadata = new Map(journey.items.filter((item) => item.curriculum_stage_id === snapshot.curriculum_stage_id).map((item) => [item.stable_key, item]));
  const date = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
  const text = (value: unknown) => typeof value === "string" && value.length <= 2000 ? value : null;
  const nodes = snapshot.route_order_json.flatMap((id, index): PortalJourneyViewNode[] => {
    const item = metadata.get(id), row = saved.get(id);
    const publicSnapshot = snapshot.completion_data_json.visibility === "parent_visible" || row?.visibility === "parent_visible";
    const curriculumItemId = text(row?.itemId) ?? item?.id, criterionIdentity = text(row?.identityId) ?? item?.identity_id;
    if (!curriculumItemId || !criterionIdentity) return [];
    const value = publicSnapshot ? row?.rating : null, rating = typeof value === "number" && [1, 2, 3, 4, 5].includes(value) ? value as 1 | 2 | 3 | 4 | 5 : null;
    const threshold = Number.isInteger(row?.masteryThreshold) && Number(row?.masteryThreshold) >= 1 && Number(row?.masteryThreshold) <= 5 ? Number(row?.masteryThreshold) : item?.mastery_threshold;
    const completed = rating !== null && threshold !== undefined && rating >= threshold;
    return [{ id, curriculumItemId, criterionIdentity, label: text(row?.name) ?? item?.name ?? "Historisch onderdeel",
      description: text(row?.description) ?? item?.description ?? null, rating, progressPercent: rating === null ? null : rating / 5 * 100,
      state: completed ? "completed" : rating === null ? "not_assessed" : "in_progress", assessed: rating !== null, completed,
      completedAt: publicSnapshot ? date(row?.completedAt) : null,
      completionSequence: publicSnapshot && Number.isSafeInteger(row?.completionSequence) && Number(row?.completionSequence) > 0 ? Number(row?.completionSequence) : null,
      completionOrderStatus: publicSnapshot && (row?.completionOrderStatus === "event_sequence" || row?.completionOrderStatus === "legacy_inferred") ? row.completionOrderStatus : null,
      curriculumOrder: index, lastUpdatedAt: publicSnapshot ? date(row?.lastUpdatedAt) : null, positiveLabel: null }];
  });
  return { curriculumVersionId: snapshot.curriculum_version_id, programId: text(snapshot.completion_data_json.programId) ?? journey.version.program_id, stageId: snapshot.curriculum_stage_id,
    stageName: text(snapshot.completion_data_json.stageName) ?? journey.stages.find((stage) => stage.id === snapshot.curriculum_stage_id)?.name ?? "Afgerond hoofdstuk", nodes, rings: [] };
}

function project(journey: CanonicalSwimJourney, audience: "parent" | "child"): PortalDevelopmentView {
  const view = (audience === "child" ? childJourneyView : parentJourneyView)({ ...journey, currentStageItems: journey.items })!;
  const currentIds = new Set((audience === "child" ? childJourneyView : parentJourneyView)(journey)!.nodes.map((item) => item.curriculumItemId));
  const metadata = new Map(journey.items.map((item) => [item.id, item])), stages = journey.stages.map((stage) => ({ id: stage.id, name: stage.name }));
  const items = view.nodes.map((item): PortalDevelopmentItem => {
    const source = metadata.get(item.curriculumItemId)!;
    return { ...item, stageId: source.curriculum_stage_id, stageName: stages.find((stage) => stage.id === source.curriculum_stage_id)?.name ?? "Niveau", current: currentIds.has(source.id), masteryThreshold: source.mastery_threshold };
  }).sort((left, right) => stages.findIndex((stage) => stage.id === left.stageId) - stages.findIndex((stage) => stage.id === right.stageId) || left.curriculumOrder - right.curriculumOrder || left.label.localeCompare(right.label, "nl"));
  const visible = (journey.assessmentHistory ?? journey.effectiveObservations.map((row) => ({ ...row, historyStatus: "recorded" as const })))
    .filter((row) => row.visibility === "parent_visible" && metadata.has(row.curriculum_item_id)).sort(compareAssessmentRecency);
  const byId = new Map(visible.map((row) => [row.id, row]));
  const current = new Set(latestJourneyObservations(journey.effectiveObservations.filter((row) => row.visibility === "parent_visible")).map((row) => row.id));
  const history = visible.map((row, index): PortalAssessmentHistory => {
    const item = metadata.get(row.curriculum_item_id)!;
    const previous = row.corrects_observation_id ? byId.get(row.corrects_observation_id)
      : visible.slice(index + 1).find((other) => other.curriculum_item_id === row.curriculum_item_id && other.historyStatus === "recorded");
    return { id: row.id, itemId: item.stable_key, label: item.name, at: row.observed_at, finalizedAt: row.finalized_at,
      rating: row.rating, previousRating: previous?.rating ?? null, status: row.historyStatus, correction: row.corrects_observation_id !== null,
      current: current.has(row.id), positiveLabel: audience === "parent" ? row.positive_label : childAssessmentCompliment(row) };
  });
  return { stageId: journey.currentStage?.id ?? null, stageName: journey.currentStage?.name ?? null, stages, items, history };
}
