export const crmStages = ["new", "contacted", "trial", "waitlist", "offer", "placed", "lost"] as const;
export type CrmStage = (typeof crmStages)[number];

export const crmPriorities = ["low", "normal", "high", "urgent"] as const;
export type CrmPriority = (typeof crmPriorities)[number];

export const crmLostReasons = [
  "no_response",
  "not_interested",
  "schedule_mismatch",
  "price",
  "moved",
  "chose_other_provider",
  "not_eligible",
  "other"
] as const;
export type CrmLostReason = (typeof crmLostReasons)[number];

export type CrmLeadIdentity = {
  id: string;
  parentEmail: string;
  parentPhone: string | null;
  parentName: string;
  participantName: string;
  participantBirthDate: string | null;
  receivedAt: string;
  mergedIntoId?: string | null;
  isTest?: boolean;
};

export type DuplicateCandidate = {
  sourceId: string;
  candidateId: string;
  score: number;
  confidence: "low" | "medium" | "high";
  reasons: string[];
};

export type CrmSlaState = {
  status: "on_track" | "due_soon" | "overdue" | "closed";
  label: string;
  minutesRemaining: number | null;
};

export const crmStageMeta: Record<CrmStage, { label: string; description: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
  new: { label: "Nieuw", description: "Nog niet persoonlijk beoordeeld", tone: "info" },
  contacted: { label: "Contact opgenomen", description: "Eerste contact is vastgelegd", tone: "neutral" },
  trial: { label: "Proefles", description: "Proefles gepland of uitgevoerd", tone: "warning" },
  waitlist: { label: "Wachtlijst", description: "Wacht op een aantoonbaar passende plek", tone: "warning" },
  offer: { label: "Aanbod", description: "Plaatsingsaanbod wacht op reactie", tone: "info" },
  placed: { label: "Geplaatst", description: "Conversie is relationeel bevestigd", tone: "success" },
  lost: { label: "Verloren", description: "Afgesloten met vastgelegde reden", tone: "danger" }
};

export function getCrmSlaState(input: {
  dueAt: string | null;
  stage: CrmStage;
  now?: Date;
  dueSoonMinutes?: number;
}): CrmSlaState {
  if (input.stage === "placed" || input.stage === "lost" || !input.dueAt) {
    return { status: "closed", label: "Geen open SLA", minutesRemaining: null };
  }
  const now = input.now ?? new Date();
  const remaining = Math.floor((new Date(input.dueAt).getTime() - now.getTime()) / 60_000);
  if (remaining < 0) return { status: "overdue", label: `${formatDuration(Math.abs(remaining))} te laat`, minutesRemaining: remaining };
  if (remaining <= (input.dueSoonMinutes ?? 240)) return { status: "due_soon", label: `Binnen ${formatDuration(remaining)}`, minutesRemaining: remaining };
  return { status: "on_track", label: `Nog ${formatDuration(remaining)}`, minutesRemaining: remaining };
}

export function findDuplicateLeads(leads: CrmLeadIdentity[], minimumScore = 60): DuplicateCandidate[] {
  const active = leads.filter((lead) => !lead.mergedIntoId);
  const result: DuplicateCandidate[] = [];
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      const source = active[left];
      const candidate = active[right];
      if (source.isTest !== candidate.isTest) continue;
      const reasons: string[] = [];
      let score = 0;

      if (normalizeEmail(source.parentEmail) === normalizeEmail(candidate.parentEmail)) {
        score += 45;
        reasons.push("zelfde ouder-e-mailadres");
      }
      const sourcePhone = normalizePhone(source.parentPhone);
      const candidatePhone = normalizePhone(candidate.parentPhone);
      if (sourcePhone && candidatePhone && sourcePhone === candidatePhone) {
        score += 30;
        reasons.push("zelfde telefoonnummer");
      }
      if (normalizeText(source.participantName) === normalizeText(candidate.participantName)) {
        score += 20;
        reasons.push("zelfde naam leerling");
      }
      if (source.participantBirthDate && source.participantBirthDate === candidate.participantBirthDate) {
        score += 25;
        reasons.push("zelfde geboortedatum");
      }
      if (normalizeText(source.parentName) === normalizeText(candidate.parentName)) {
        score += 10;
        reasons.push("zelfde naam ouder/verzorger");
      }

      const cappedScore = Math.min(100, score);
      if (cappedScore < minimumScore) continue;
      const [older, newer] = new Date(source.receivedAt) <= new Date(candidate.receivedAt)
        ? [source, candidate]
        : [candidate, source];
      result.push({
        sourceId: newer.id,
        candidateId: older.id,
        score: cappedScore,
        confidence: cappedScore >= 90 ? "high" : cappedScore >= 75 ? "medium" : "low",
        reasons
      });
    }
  }
  return result.sort((a, b) => b.score - a.score || a.sourceId.localeCompare(b.sourceId));
}

export function crmStageProgress(stage: CrmStage) {
  const index = crmStages.indexOf(stage);
  if (stage === "lost") return 0;
  return Math.round((index / (crmStages.length - 2)) * 100);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | null) {
  if (!value) return "";
  const normalized = value.replace(/[^\d+]/g, "");
  return normalized.startsWith("0031") ? `+31${normalized.slice(4)}` : normalized;
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase("nl-NL").normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.max(1, minutes)} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} uur`;
  return `${Math.floor(hours / 24)} dagen`;
}
