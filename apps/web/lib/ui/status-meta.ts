export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

export type StatusMeta = {
  description: string;
  isTerminal: boolean;
  label: string;
  sortWeight: number;
  tone: StatusTone;
};

const fallback: StatusMeta = {
  description: "Status uit het bronsysteem.",
  isTerminal: false,
  label: "Onbekend",
  sortWeight: 50,
  tone: "neutral"
};

const intakeStatuses: Record<string, StatusMeta> = {
  received: { description: "Nieuw ontvangen en nog niet beoordeeld.", isTerminal: false, label: "Ontvangen", sortWeight: 10, tone: "info" },
  new: { description: "Nieuwe aanvraag.", isTerminal: false, label: "Nieuw", sortWeight: 10, tone: "info" },
  needs_review: { description: "Een beheerder moet de aanvraag beoordelen.", isTerminal: false, label: "Beoordelen", sortWeight: 20, tone: "warning" },
  reviewing: { description: "De aanvraag is in behandeling.", isTerminal: false, label: "In behandeling", sortWeight: 20, tone: "warning" },
  waitlist_pending: { description: "Wacht op goedkeuring voor de wachtlijst.", isTerminal: false, label: "Wachtlijst goedkeuren", sortWeight: 30, tone: "warning" },
  waitlisted: { description: "Opgenomen op de wachtlijst.", isTerminal: false, label: "Op wachtlijst", sortWeight: 40, tone: "info" },
  placement_ready: { description: "Klaar om in een passende groep te plaatsen.", isTerminal: false, label: "Klaar voor plaatsing", sortWeight: 45, tone: "success" },
  converted: { description: "Omgezet naar een leerling of plaatsing.", isTerminal: true, label: "Geconverteerd", sortWeight: 80, tone: "success" },
  declined: { description: "Aanvraag is gemotiveerd afgewezen.", isTerminal: true, label: "Geweigerd", sortWeight: 90, tone: "danger" },
  closed: { description: "Aanvraag is afgehandeld en gesloten.", isTerminal: true, label: "Afgesloten", sortWeight: 90, tone: "neutral" },
  archived: { description: "Aanvraag staat in het archief.", isTerminal: true, label: "Gearchiveerd", sortWeight: 100, tone: "neutral" }
};

const waitlistStatuses: Record<string, StatusMeta> = {
  pending_review: { description: "Wacht op acceptatie of weigering.", isTerminal: false, label: "Te beoordelen", sortWeight: 10, tone: "warning" },
  reviewing: { description: "Kandidaat wordt beoordeeld.", isTerminal: false, label: "In beoordeling", sortWeight: 10, tone: "warning" },
  accepted: { description: "Geaccepteerd voor de wachtlijst.", isTerminal: false, label: "Geaccepteerd", sortWeight: 20, tone: "info" },
  waiting: { description: "Kandidaat wacht volgens FIFO op plaatsing.", isTerminal: false, label: "Op wachtlijst", sortWeight: 20, tone: "info" },
  offered: { description: "Er is een plaatsingsaanbod verstuurd.", isTerminal: false, label: "Aanbod verstuurd", sortWeight: 30, tone: "warning" },
  placed: { description: "Kandidaat is in een groep geplaatst.", isTerminal: true, label: "Geplaatst", sortWeight: 80, tone: "success" },
  converted: { description: "Kandidaat is omgezet naar een inschrijving.", isTerminal: true, label: "Geconverteerd", sortWeight: 80, tone: "success" },
  declined: { description: "Kandidaat is geweigerd.", isTerminal: true, label: "Geweigerd", sortWeight: 90, tone: "danger" },
  rejected: { description: "Kandidaat is geweigerd.", isTerminal: true, label: "Geweigerd", sortWeight: 90, tone: "danger" },
  closed: { description: "Kandidaat is afgehandeld.", isTerminal: true, label: "Afgesloten", sortWeight: 95, tone: "neutral" },
  archived: { description: "Kandidaat staat in het archief.", isTerminal: true, label: "Gearchiveerd", sortWeight: 100, tone: "neutral" }
};

const participantStatuses: Record<string, StatusMeta> = {
  active: { description: "Actieve inschrijving.", isTerminal: false, label: "Actief", sortWeight: 10, tone: "success" },
  trial: { description: "Leerling volgt een proefles.", isTerminal: false, label: "Proefles", sortWeight: 20, tone: "info" },
  paused: { description: "Inschrijving is tijdelijk gepauzeerd.", isTerminal: false, label: "Gepauzeerd", sortWeight: 30, tone: "warning" },
  completed: { description: "Programma is afgerond.", isTerminal: true, label: "Afgerond", sortWeight: 80, tone: "success" },
  cancelled: { description: "Inschrijving is beëindigd.", isTerminal: true, label: "Uitgeschreven", sortWeight: 90, tone: "neutral" },
  archived: { description: "Inschrijving staat in het archief.", isTerminal: true, label: "Gearchiveerd", sortWeight: 100, tone: "neutral" }
};

const taskStatuses: Record<string, StatusMeta> = {
  open: { description: "Taak is nog niet gestart.", isTerminal: false, label: "Open", sortWeight: 10, tone: "warning" },
  in_progress: { description: "Taak is in uitvoering.", isTerminal: false, label: "Bezig", sortWeight: 20, tone: "info" },
  done: { description: "Taak is afgerond.", isTerminal: true, label: "Klaar", sortWeight: 80, tone: "success" },
  cancelled: { description: "Taak is geannuleerd.", isTerminal: true, label: "Geannuleerd", sortWeight: 90, tone: "neutral" }
};

const paymentStatuses: Record<string, StatusMeta> = {
  due: { description: "Betaling staat open.", isTerminal: false, label: "Openstaand", sortWeight: 10, tone: "warning" },
  overdue: { description: "Vervaldatum is verstreken.", isTerminal: false, label: "Achterstallig", sortWeight: 5, tone: "danger" },
  paid: { description: "Betaling is voldaan.", isTerminal: true, label: "Betaald", sortWeight: 80, tone: "success" },
  waived: { description: "Betaling is kwijtgescholden.", isTerminal: true, label: "Kwijtgescholden", sortWeight: 85, tone: "neutral" },
  cancelled: { description: "Betaling is geannuleerd.", isTerminal: true, label: "Geannuleerd", sortWeight: 90, tone: "neutral" },
  refunded: { description: "Betaling is terugbetaald.", isTerminal: true, label: "Terugbetaald", sortWeight: 90, tone: "warning" },
  chargeback: { description: "Betaling is gestorneerd.", isTerminal: true, label: "Stornering", sortWeight: 5, tone: "danger" }
};

export function getIntakeStatusMeta(status: string) {
  return resolveStatus(intakeStatuses, status);
}

export function getWaitlistStatusMeta(status: string) {
  return resolveStatus(waitlistStatuses, status);
}

export function getParticipantStatusMeta(status: string) {
  return resolveStatus(participantStatuses, status);
}

export function getTaskStatusMeta(status: string) {
  return resolveStatus(taskStatuses, status);
}

export function getPaymentStatusMeta(status: string) {
  return resolveStatus(paymentStatuses, status);
}

export function compareIntakeOperationalOrder(
  left: { is_test: boolean; received_at: string; status: string },
  right: { is_test: boolean; received_at: string; status: string }
) {
  return (
    getIntakeStatusMeta(left.status).sortWeight - getIntakeStatusMeta(right.status).sortWeight ||
    Number(left.is_test) - Number(right.is_test) ||
    right.received_at.localeCompare(left.received_at)
  );
}

export function compareWaitlistOperationalOrder(
  left: { is_test: boolean; priority_date: string; status: string },
  right: { is_test: boolean; priority_date: string; status: string }
) {
  return (
    getWaitlistStatusMeta(left.status).sortWeight - getWaitlistStatusMeta(right.status).sortWeight ||
    Number(left.is_test) - Number(right.is_test) ||
    left.priority_date.localeCompare(right.priority_date)
  );
}

function resolveStatus(collection: Record<string, StatusMeta>, status: string) {
  const normalized = status.trim().toLowerCase();
  return collection[normalized] ?? { ...fallback, label: humanize(normalized) };
}

function humanize(value: string) {
  if (!value) return fallback.label;
  return value.replaceAll("_", " ").replace(/^\w/, (character) => character.toUpperCase());
}
