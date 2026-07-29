export const smartEventTypes = [
  "intake_received",
  "intake_needs_review",
  "waitlist_entry_created",
  "waitlist_entry_eligible",
  "slot_offer_sent",
  "slot_offer_expiring",
  "slot_offer_expired",
  "placement_completed",
  "group_capacity_full",
  "group_capacity_available",
  "participant_absent",
  "participant_no_show",
  "payment_failed",
  "payment_overdue",
  "progress_updated",
  "stage_completed",
  "stage_transfer_needed",
  "afzwem_ready",
  "certificate_issued",
  "data_quality_issue_created"
] as const;

export type SmartEventType = (typeof smartEventTypes)[number];
export type SmartEventSeverity = "info" | "warning" | "error" | "critical";

export type SmartActivityItem = {
  id: string;
  eventType: string;
  severity: SmartEventSeverity;
  occurredAt: string;
  source: string;
  isTest: boolean;
  metadata: Record<string, unknown>;
};

export function smartEventLabel(eventType: string) {
  return (
    {
      intake_received: "Intake ontvangen",
      intake_needs_review: "Intake vraagt beoordeling",
      waitlist_entry_created: "Wachtlijstpositie aangemaakt",
      waitlist_entry_eligible: "Kandidaat is plaatsbaar",
      slot_offer_sent: "Plaatsingsaanbod verstuurd",
      slot_offer_expiring: "Plaatsingsaanbod verloopt bijna",
      slot_offer_expired: "Plaatsingsaanbod verlopen",
      placement_completed: "Plaatsing afgerond",
      group_capacity_full: "Groep heeft capaciteit bereikt",
      group_capacity_available: "Groep heeft ruimte",
      participant_absent: "Afwezigheid geregistreerd",
      participant_no_show: "No-show geregistreerd",
      payment_failed: "Betaling mislukt",
      payment_overdue: "Betaling is achterstallig",
      progress_updated: "Voortgang bijgewerkt",
      stage_completed: "Niveau afgerond",
      stage_transfer_needed: "Vervolgstap beoordelen",
      afzwem_ready: "Klaar voor afzwemmen",
      certificate_issued: "Diploma uitgegeven",
      data_quality_issue_created: "Datakwaliteitsissue gevonden"
    } as Record<string, string>
  )[eventType] ?? eventType.replaceAll("_", " ");
}

export function smartEventDescription(event: Pick<SmartActivityItem, "eventType" | "metadata">) {
  const reason = typeof event.metadata.reason === "string" ? event.metadata.reason : null;
  const status = typeof event.metadata.status === "string" ? event.metadata.status.replaceAll("_", " ") : null;

  if (reason) return reason;
  if (status) return `Status: ${status}.`;
  return smartEventLabel(event.eventType);
}

export function toSmartActivityItem(event: {
  id: string;
  event_type: string;
  severity: SmartEventSeverity;
  occurred_at: string;
  source: string;
  is_test: boolean;
  metadata_json: Record<string, unknown>;
}): SmartActivityItem {
  return {
    id: event.id,
    eventType: event.event_type,
    severity: event.severity,
    occurredAt: event.occurred_at,
    source: event.source,
    isTest: event.is_test,
    metadata: event.metadata_json
  };
}
