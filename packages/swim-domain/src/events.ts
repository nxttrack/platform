export const swimDomainEventTypes = [
  "curriculum.published",
  "curriculum.migration.previewed",
  "curriculum.migration.executed",
  "assessment.finalized",
  "assessment.corrected",
  "transition.reviewed",
  "transition.approved",
  "transition.executed",
  "carryover.previous_item_completed",
  "badge.batch_awarded",
  "badge.award_revoked",
  "group.published",
  "schedule.occurrences_materialized",
  "holiday.published",
  "invoice.issued",
  "credit_note.issued",
  "payment.reconciled",
  "analytics.snapshot_completed",
  "forecast.snapshot_completed"
] as const;

export type SwimDomainEventType = (typeof swimDomainEventTypes)[number];

export interface DomainEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  tenantId: string;
  eventType: SwimDomainEventType;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  formulaVersion?: string;
  actorUserId?: string | null;
  correlationId?: string | null;
  causationId?: string | null;
  payload: TPayload;
}
