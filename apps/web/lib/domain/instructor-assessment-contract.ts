import { messageComposerUuid, messageComposerRevision } from "./message-composer-contract";

export type InstructorAssessmentContext = { actorId: string; tenantId: string; participantId: string; enrollmentId: string; itemId: string; sessionId: string | null };
export type InstructorAssessmentInput = { rating: number; visibility: "parent_visible" | "internal"; baseObservationId: string | null; correctionReason: string };
export type InstructorAssessmentDraft = { id: string; rating: number; visibility: "parent_visible" | "internal"; draft_revision: number; client_operation_id: string;
  review_owned: boolean; review_base_observation_id: string | null; review_correction_reason: string | null; review_session_id: string | null; expires_at: string };
export type InstructorAssessmentView = { draft: InstructorAssessmentDraft | null;
  current: { id: string; rating: number; visibility: "parent_visible" | "internal"; observedAt: string; finalizedAt: string } | null;
  item: { id: string; name: string; description: string | null; masteryThreshold: number; versionId: string };
  compliment: { id: string; message: string; publishedAt: string } | null;
};
export type InstructorAssessmentResult<T> = { ok: true; value: T } | { ok: false; code: "access" | "conflict" | "invalid" | "unavailable"; message: string };
export function parseInstructorAssessmentContext(value: InstructorAssessmentContext): InstructorAssessmentContext {
  if (!value || typeof value !== "object") throw new Error("assessment_review_input_invalid");
  return { actorId: messageComposerUuid(value.actorId), tenantId: messageComposerUuid(value.tenantId), participantId: messageComposerUuid(value.participantId),
    enrollmentId: messageComposerUuid(value.enrollmentId), itemId: messageComposerUuid(value.itemId), sessionId: value.sessionId === null ? null : messageComposerUuid(value.sessionId) };
}
export function parseInstructorAssessmentInput(value: InstructorAssessmentInput): InstructorAssessmentInput {
  if (!value || !Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5 || !["internal", "parent_visible"].includes(value.visibility)
    || typeof value.correctionReason !== "string" || value.correctionReason.length > 2000) throw new Error("assessment_review_input_invalid");
  return { rating: value.rating, visibility: value.visibility, correctionReason: value.correctionReason,
    baseObservationId: value.baseObservationId === null ? null : messageComposerUuid(value.baseObservationId) };
}
export { messageComposerUuid as assessmentUuid, messageComposerRevision as assessmentRevision };
