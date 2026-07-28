export type OperationalSignalPriority = "critical" | "high" | "medium" | "low";
export type OperationalSignalWindow = "now" | "today" | "this_week";

export type OperationalSignal = {
  key: string;
  type:
    | "crm_follow_up"
    | "session_without_instructor"
    | "empty_seat"
    | "missing_attendance"
    | "expiring_offer"
    | "failed_payment"
    | "parent_question"
    | "expiring_media"
    | "automation_failure"
    | "configuration_drift"
    | "retention_risk";
  entityType:
    | "intake"
    | "session"
    | "recovery_snapshot"
    | "slot_offer"
    | "payment_attempt"
    | "message_thread"
    | "participant_media"
    | "automation_run"
    | "tenant"
    | "participant";
  entityId: string | null;
  title: string;
  summary: string;
  evidence: string[];
  priority: OperationalSignalPriority;
  dueAt: string | null;
  href: string;
  actionLabel: string;
  fingerprint: string;
};

export type OperationalSignalState = {
  id: string;
  signalKey: string;
  sourceFingerprint: string;
  status: "open" | "acknowledged" | "snoozed" | "resolved";
  snoozedUntil: string | null;
  assignedToUserId: string | null;
};

export type PrioritizedOperationalSignal = OperationalSignal & {
  window: OperationalSignalWindow;
  urgencyScore: number;
  stateId: string | null;
  stateStatus: OperationalSignalState["status"] | "new";
  assignedToUserId: string | null;
};

export function prioritizeOperationalSignals(input: {
  signals: OperationalSignal[];
  states: OperationalSignalState[];
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const states = new Map(input.states.map((state) => [state.signalKey, state]));
  return input.signals
    .flatMap((signal): PrioritizedOperationalSignal[] => {
      const state = states.get(signal.key);
      const sameVersion = state?.sourceFingerprint === signal.fingerprint;
      if (sameVersion && state?.status === "resolved") return [];
      if (
        sameVersion
        && state?.status === "snoozed"
        && state.snoozedUntil
        && new Date(state.snoozedUntil) > now
      ) return [];
      const urgencyScore = calculateUrgency(signal, now);
      return [{
        ...signal,
        window: getWindow(signal, now),
        urgencyScore,
        stateId: sameVersion ? state?.id ?? null : null,
        stateStatus: sameVersion ? state?.status ?? "new" : "new",
        assignedToUserId: sameVersion ? state?.assignedToUserId ?? null : null
      }];
    })
    .sort((left, right) => right.urgencyScore - left.urgencyScore || left.title.localeCompare(right.title));
}

function calculateUrgency(signal: OperationalSignal, now: Date) {
  const priorityScore = { critical: 120, high: 75, medium: 45, low: 20 }[signal.priority];
  if (!signal.dueAt) return priorityScore;
  const hours = (new Date(signal.dueAt).getTime() - now.getTime()) / 3_600_000;
  if (hours <= 0) return priorityScore + 30;
  if (hours <= 6) return priorityScore + 20;
  if (hours <= 24) return priorityScore + 10;
  return priorityScore;
}

function getWindow(signal: OperationalSignal, now: Date): OperationalSignalWindow {
  if (signal.priority === "critical") return "now";
  if (!signal.dueAt) return signal.priority === "high" ? "today" : "this_week";
  const hours = (new Date(signal.dueAt).getTime() - now.getTime()) / 3_600_000;
  if (hours <= 6) return "now";
  if (hours <= 24) return "today";
  return "this_week";
}
