import type { IntakeDaypart, WaitTimeBand } from "./intake-recommendation-contract";

export const nextBestActionTypes = [
  "review_new_intakes",
  "slot_offer_expiring",
  "parent_waiting_for_reply",
  "payment_needs_attention",
  "group_full_high_demand",
  "group_running_empty",
  "extra_moment_recommended",
  "instructor_missing",
  "capacity_bottleneck",
  "waitlist_candidate_became_eligible",
  "data_quality_issue",
  "afzwem_ready_waiting",
  "makeup_credit_expiring",
  "attendance_follow_up",
  "progress_bottleneck_review",
  "forecast_capacity_review",
  "lead_follow_up"
] as const;

export type NextBestActionType = (typeof nextBestActionTypes)[number];
export type NextBestActionPriority = "high" | "medium" | "low";

export const nextBestActionTypeLabels: Record<NextBestActionType, string> = {
  review_new_intakes: "Nieuwe intakes",
  slot_offer_expiring: "Aanbod verloopt",
  parent_waiting_for_reply: "Reactie ouder",
  payment_needs_attention: "Betaling",
  group_full_high_demand: "Volle groep",
  group_running_empty: "Lage bezetting",
  extra_moment_recommended: "Extra lesmoment",
  instructor_missing: "Instructeur",
  capacity_bottleneck: "Capaciteitsknelpunt",
  waitlist_candidate_became_eligible: "Plaatsbaar geworden",
  data_quality_issue: "Datakwaliteit",
  afzwem_ready_waiting: "Afzwemklaar",
  makeup_credit_expiring: "Inhaalcredit",
  attendance_follow_up: "Aanwezigheidscheck",
  progress_bottleneck_review: "Leskwaliteit",
  forecast_capacity_review: "Capaciteitsforecast",
  lead_follow_up: "Lead opvolgen"
};

export type NextBestActionReason = {
  label: string;
  explanation: string;
  evidence: string;
};

export type NextBestActionCandidate = {
  actionType: NextBestActionType;
  fingerprint: string;
  title: string;
  description: string;
  priority: NextBestActionPriority;
  entityType: string | null;
  entityId: string | null;
  participantId: string | null;
  guardianId: string | null;
  groupId: string | null;
  programId: string | null;
  dueAt: string | null;
  reasons: NextBestActionReason[];
  suggestedActions: Array<{ label: string; href: string }>;
  sourceHref: string;
  confidence: number;
  isTest: boolean;
  journeyRunId: string | null;
};

export type NextBestActionInput = {
  now: string;
  intakes: Array<{
    id: string;
    programId: string | null;
    receivedAt: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  offers: Array<{
    id: string;
    waitlistEntryId: string;
    groupId: string;
    offeredAt: string | null;
    expiresAt: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  payments: Array<{
    id: string;
    participantId: string | null;
    guardianId: string | null;
    dueOn: string | null;
    amountCents: number;
    status: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  groups: Array<{
    id: string;
    name: string;
    programId: string;
    stageId: string | null;
    weekday: number | null;
    startsAt: string | null;
    fixedCapacity: number;
    usedCapacity: number;
    hasInstructor: boolean;
    isTest: boolean;
  }>;
  waitlist: Array<{
    id: string;
    programId: string;
    stageId: string | null;
    eligibleFrom: string | null;
    minimumAgeBlocked: boolean;
    preferredDays: number[];
    preferredTimeBlocks: IntakeDaypart[];
    priorityDate: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  demandWindows: Array<{
    programId: string;
    stageId: string | null;
    weekday: number;
    timeBlock: IntakeDaypart | null;
    candidateCount: number;
    matchingGroupCount: number;
    fullGroupCount: number;
    waitBand: WaitTimeBand;
    inflowPerWeek: number;
    outflowPerWeek: number;
    resourceWindowAvailable: boolean;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  qualityIssues: Array<{
    id: string;
    entityType: string;
    entityId: string;
    severity: string;
    title: string;
    description: string;
    suggestedAction: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  readiness: Array<{
    id: string;
    participantId: string;
    programId: string;
    stageId: string;
    readinessScore: number | null;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  credits: Array<{
    id: string;
    participantId: string;
    expiresOn: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  capacityForecasts?: Array<{
    groupId: string;
    groupName: string;
    programId: string;
    riskLevel: "healthy" | "watch" | "bottleneck" | "critical";
    expectedBottlenecks: number;
    confidence: "laag" | "middel" | "hoog";
    evidence: string[];
    isTest: boolean;
  }>;
  attendanceRisks?: Array<{
    participantId: string;
    groupId: string;
    signalType: string;
    riskLevel: "watch" | "elevated" | "high";
    reason: string;
    evidence: string[];
    confidence: "laag" | "middel" | "hoog";
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  progressBottlenecks?: Array<{
    groupId: string | null;
    programId: string | null;
    skillId: string;
    skillLabel: string;
    affectedCount: number;
    totalCount: number;
    stagnationRate: number;
    confidence: "laag" | "middel" | "hoog";
    suggestedFocus: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  leadScores?: Array<{
    intakeId: string;
    programId: string | null;
    score: number;
    confidence: number;
    suggestedAction: string;
    reasons: Array<{ label: string; explanation: string; evidence: string }>;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
};

export function detectNextBestActions(input: NextBestActionInput): NextBestActionCandidate[] {
  const now = new Date(input.now);
  const today = input.now.slice(0, 10);
  const actions: NextBestActionCandidate[] = [];

  for (const lead of input.leadScores ?? []) {
    if (lead.score < 75) continue;
    actions.push(candidate({
      actionType: "lead_follow_up",
      fingerprint: `lead_follow_up:${lead.intakeId}`,
      title: "Kansrijke intake persoonlijk opvolgen",
      description: lead.suggestedAction,
      priority: lead.score >= 90 ? "high" : "medium",
      entityType: "intake_submission",
      entityId: lead.intakeId,
      programId: lead.programId,
      reasons: [
        reason("Operationele leadscore", "De uitlegbare score gebruikt geen gevoelige kenmerken en is geen oordeel over het gezin.", `${lead.score}/100`),
        ...lead.reasons.slice(0, 3).map((item) => reason(item.label, item.explanation, item.evidence))
      ],
      suggestedActions: [
        { label: "Open opvolging", href: `/admin/opvolging?intake=${lead.intakeId}` },
        { label: "Open intakedossier", href: "/admin/intake" }
      ],
      sourceHref: `/admin/opvolging?intake=${lead.intakeId}`,
      confidence: lead.confidence,
      isTest: lead.isTest,
      journeyRunId: lead.journeyRunId
    }));
  }

  for (const partition of partitionTestData(input.intakes)) {
    if (partition.rows.length === 0) continue;
    const oldest = [...partition.rows].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))[0]!;
    actions.push(candidate({
      actionType: "review_new_intakes",
      fingerprint: `review_new_intakes:${partition.isTest ? "test" : "live"}`,
      title: `${partition.rows.length} nieuwe intake${partition.rows.length === 1 ? "" : "s"} beoordelen`,
      description: "Nieuwe aanvragen wachten op een menselijke beoordeling.",
      priority: ageHours(oldest.receivedAt, now) >= 48 ? "high" : "medium",
      entityType: "intake_submission",
      entityId: oldest.id,
      programId: oldest.programId,
      reasons: [
        reason("Open aanvragen", "Alleen nog niet beoordeelde intakes tellen mee.", `${partition.rows.length} ontvangen`),
        reason("Oudste aanvraag", "Lang wachtende aanvragen krijgen meer prioriteit.", oldest.receivedAt)
      ],
      sourceHref: "/admin/intake",
      isTest: partition.isTest,
      journeyRunId: singleJourneyRun(partition.rows)
    }));
  }

  for (const offer of input.offers) {
    const hoursUntilExpiry = (new Date(offer.expiresAt).getTime() - now.getTime()) / hourMs;
    const age = offer.offeredAt ? ageHours(offer.offeredAt, now) : 0;
    if (hoursUntilExpiry >= 0 && hoursUntilExpiry <= 48) {
      actions.push(candidate({
        actionType: "slot_offer_expiring",
        fingerprint: `slot_offer_expiring:${offer.id}`,
        title: "Plaatsingsaanbod verloopt bijna",
        description: "Controleer of de ouder nog ondersteuning nodig heeft voordat het aanbod verloopt.",
        priority: hoursUntilExpiry <= 24 ? "high" : "medium",
        entityType: "slot_offer",
        entityId: offer.id,
        groupId: offer.groupId,
        dueAt: offer.expiresAt,
        reasons: [reason("Vervaldatum", "Het aanbod heeft nog geen reactie en nadert de einddatum.", offer.expiresAt)],
        sourceHref: "/admin/wachtlijst",
        isTest: offer.isTest,
        journeyRunId: offer.journeyRunId
      }));
    } else if (age >= 72) {
      actions.push(candidate({
        actionType: "parent_waiting_for_reply",
        fingerprint: `parent_waiting_for_reply:${offer.id}`,
        title: "Reactie op plaatsingsaanbod ontbreekt",
        description: "Een verstuurd aanbod heeft al meerdere dagen geen reactie. Bekijk de communicatiehistorie.",
        priority: "medium",
        entityType: "slot_offer",
        entityId: offer.id,
        groupId: offer.groupId,
        dueAt: offer.expiresAt,
        reasons: [reason("Geen antwoord", "Alleen openstaande verstuurde aanbiedingen tellen mee.", `${Math.floor(age / 24)} dagen sinds verzending`)],
        sourceHref: "/admin/wachtlijst",
        isTest: offer.isTest,
        journeyRunId: offer.journeyRunId
      }));
    }
  }

  for (const payment of input.payments) {
    const overdue = !!payment.dueOn && payment.dueOn < today;
    if (!overdue && !["failed", "overdue"].includes(payment.status)) continue;
    actions.push(candidate({
      actionType: "payment_needs_attention",
      fingerprint: `payment_needs_attention:${payment.id}`,
      title: "Betaling vraagt aandacht",
      description: "Controleer de factuur of mislukte betaling en bepaal handmatig de passende opvolging.",
      priority: overdueDays(payment.dueOn, today) >= 14 ? "high" : "medium",
      entityType: "billing_invoice",
      entityId: payment.id,
      participantId: payment.participantId,
      guardianId: payment.guardianId,
      dueAt: payment.dueOn ? `${payment.dueOn}T09:00:00.000Z` : null,
      reasons: [
        reason("Betaalstatus", "De status of vervaldatum vraagt om controle; er wordt niets automatisch geïncasseerd.", payment.status),
        reason("Bedrag", "Bronwaarde uit de factuur.", `€ ${(payment.amountCents / 100).toFixed(2)}`)
      ],
      sourceHref: "/admin/betalingen",
      isTest: payment.isTest,
      journeyRunId: payment.journeyRunId
    }));
  }

  for (const group of input.groups) {
    if (!group.hasInstructor) {
      actions.push(candidate({
        actionType: "instructor_missing",
        fingerprint: `instructor_missing:${group.id}`,
        title: `Instructeur ontbreekt bij ${group.name}`,
        description: "Koppel of plan een instructeur voordat deze lesgroep operationeel wordt gebruikt.",
        priority: "high",
        entityType: "group",
        entityId: group.id,
        groupId: group.id,
        programId: group.programId,
        reasons: [reason("Toewijzing", "Er is geen actieve groepsinstructeur aangetroffen.", "0 actieve toewijzingen")],
        sourceHref: "/admin/groepen",
        isTest: group.isTest
      }));
    }
    const utilization = group.fixedCapacity > 0 ? group.usedCapacity / group.fixedCapacity : 0;
    if (group.fixedCapacity > 0 && utilization <= 0.25) {
      actions.push(candidate({
        actionType: "group_running_empty",
        fingerprint: `group_running_empty:${group.id}`,
        title: `${group.name} draait ruim onder capaciteit`,
        description: "Bekijk samenvoegen, promotie of roosteroptimalisatie; voer geen wijziging uit zonder bevestiging.",
        priority: utilization === 0 ? "medium" : "low",
        entityType: "group",
        entityId: group.id,
        groupId: group.id,
        programId: group.programId,
        reasons: [reason("Bezettingsgraad", "Actieve en proeflidmaatschappen zijn afgezet tegen vaste capaciteit.", `${group.usedCapacity}/${group.fixedCapacity} bezet`)],
        sourceHref: "/admin/groepen",
        isTest: group.isTest
      }));
    }
  }

  for (const window of input.demandWindows) {
    if (window.matchingGroupCount > 0 && window.fullGroupCount === window.matchingGroupCount && window.candidateCount >= 3) {
      actions.push(candidate({
        actionType: "group_full_high_demand",
        fingerprint: `group_full_high_demand:${scopeFingerprint(window)}`,
        title: "Volle groepen met hoge voorkeursvraag",
        description: `${window.candidateCount} plaatsbare kandidaten wachten op een moment waarvan alle passende groepen vol zijn.`,
        priority: window.candidateCount >= 10 ? "high" : "medium",
        entityType: "program_stage",
        programId: window.programId,
        reasons: [
          reason("Capaciteit", "Alle passende bestaande groepen zijn vol.", `${window.fullGroupCount}/${window.matchingGroupCount} groepen vol`),
          reason("Voorkeursvraag", "Alleen plaatsbare kandidaten met deze voorkeursdag tellen mee.", `${window.candidateCount} kandidaten`)
        ],
        sourceHref: "/admin/wachtlijst",
        isTest: window.isTest,
        journeyRunId: window.journeyRunId
      }));
    }

    if (
      window.matchingGroupCount > 0 &&
      window.fullGroupCount === window.matchingGroupCount &&
      window.candidateCount >= 5 &&
      ["long", "very_long"].includes(window.waitBand) &&
      window.outflowPerWeek < Math.max(0.5, window.inflowPerWeek * 0.75) &&
      window.resourceWindowAvailable
    ) {
      actions.push(candidate({
        actionType: "extra_moment_recommended",
        fingerprint: `extra_moment_recommended:${scopeFingerprint(window)}`,
        title: `Onderzoek een extra lesmoment op ${weekdayLabel(window.weekday)}`,
        description: "Vraag, wachttijd, lage uitstroom en bewezen vrije resourcecapaciteit wijzen dezelfde kant op. Dit is een voorstel, geen automatische roosterwijziging.",
        priority: window.candidateCount >= 12 ? "high" : "medium",
        entityType: "program_stage",
        programId: window.programId,
        reasons: [
          reason("Volle groepen", "Alle passende groepen op dit moment hebben geen vaste plek.", `${window.fullGroupCount}/${window.matchingGroupCount} vol`),
          reason("Plaatsbare vraag", "Minimumleeftijd en actieve wachtlijststatus zijn vooraf toegepast.", `${window.candidateCount} kandidaten`),
          reason("Wachttijdband", "De verklaarbare wachttijdengine signaleert structurele druk.", window.waitBand),
          reason("Doorstroom", "Recente uitstroom blijft achter bij instroom.", `${window.inflowPerWeek} in / ${window.outflowPerWeek} uit per week`),
          reason("Resourcevenster", "Er is minstens één actieve resource zonder bewezen overlap.", "vrij venster aangetroffen")
        ],
        sourceHref: "/admin/agenda",
        confidence: 0.88,
        isTest: window.isTest,
        journeyRunId: window.journeyRunId
      }));
    }

    if (["long", "very_long"].includes(window.waitBand) && window.candidateCount >= 3 && window.fullGroupCount === window.matchingGroupCount) {
      actions.push(candidate({
        actionType: "capacity_bottleneck",
        fingerprint: `capacity_bottleneck:${scopeFingerprint(window)}`,
        title: "Capaciteitsknelpunt op programma en niveau",
        description: "De huidige vraag en bezetting maken plaatsing structureel lastig. Open de brondata en beoordeel alternatieven.",
        priority: window.waitBand === "very_long" ? "high" : "medium",
        entityType: "program_stage",
        programId: window.programId,
        reasons: [
          reason("Wachttijdband", "Band is gebaseerd op historie of actuele druk.", window.waitBand),
          reason("Wachtlijst", "Plaatsbare kandidaten in dit voorkeursscope.", `${window.candidateCount} kandidaten`)
        ],
        sourceHref: "/admin/programma",
        isTest: window.isTest,
        journeyRunId: window.journeyRunId
      }));
    }
  }

  for (const entry of input.waitlist) {
    if (!entry.minimumAgeBlocked || !entry.eligibleFrom || entry.eligibleFrom > today) continue;
    actions.push(candidate({
      actionType: "waitlist_candidate_became_eligible",
      fingerprint: `waitlist_candidate_became_eligible:${entry.id}:${entry.eligibleFrom}`,
      title: "Wachtlijstkandidaat is plaatsbaar geworden",
      description: "De minimumleeftijdsdatum is bereikt. Een admin moet de status en plaatsingsmogelijkheden opnieuw beoordelen.",
      priority: "high",
      entityType: "waitlist_entry",
      entityId: entry.id,
      programId: entry.programId,
      dueAt: `${entry.eligibleFrom}T08:00:00.000Z`,
      reasons: [reason("Minimumleeftijd", "De vastgelegde plaatsbaar-vanaf-datum is bereikt.", entry.eligibleFrom)],
      sourceHref: "/admin/wachtlijst",
      isTest: entry.isTest,
      journeyRunId: entry.journeyRunId
    }));
  }

  for (const issue of input.qualityIssues) {
    actions.push(candidate({
      actionType: "data_quality_issue",
      fingerprint: `data_quality_issue:${issue.id}`,
      title: issue.title,
      description: issue.description,
      priority: issue.severity === "critical" || issue.severity === "error" ? "high" : "medium",
      entityType: issue.entityType,
      entityId: issue.entityId,
      reasons: [reason("Datakwaliteitscontrole", "Openstaande bevinding uit de tenant-scoped kwaliteitscontrole.", issue.severity)],
      suggestedActions: [{ label: issue.suggestedAction, href: "/admin/automatisering/datakwaliteit" }],
      sourceHref: "/admin/automatisering/datakwaliteit",
      confidence: 0.95,
      isTest: issue.isTest,
      journeyRunId: issue.journeyRunId
    }));
  }

  for (const readiness of input.readiness) {
    actions.push(candidate({
      actionType: "afzwem_ready_waiting",
      fingerprint: `afzwem_ready_waiting:${readiness.id}`,
      title: "Afzwemklare leerling wacht op beoordeling",
      description: "De readiness staat op klaar, maar er is nog geen uitnodiging of afronding. Plan de vervolgstap handmatig.",
      priority: "high",
      entityType: "graduation_readiness",
      entityId: readiness.id,
      participantId: readiness.participantId,
      programId: readiness.programId,
      reasons: [reason("Readiness", "Alleen een expliciet door een medewerker bevestigde ready-status wordt meegenomen; een getal wordt bewust niet als schijnprecisie getoond.", "menselijke status: ready")],
      sourceHref: "/admin/afzwemmen",
      isTest: readiness.isTest,
      journeyRunId: readiness.journeyRunId
    }));
  }

  for (const credit of input.credits) {
    const days = Math.ceil((new Date(`${credit.expiresOn}T00:00:00.000Z`).getTime() - now.getTime()) / dayMs);
    if (days < 0 || days > 14) continue;
    actions.push(candidate({
      actionType: "makeup_credit_expiring",
      fingerprint: `makeup_credit_expiring:${credit.id}`,
      title: "Inhaalcredit verloopt binnenkort",
      description: "Bekijk samen met de ouder een passend inhaalmoment. Er wordt niets automatisch geboekt.",
      priority: days <= 5 ? "high" : "medium",
      entityType: "catch_up_credit",
      entityId: credit.id,
      participantId: credit.participantId,
      dueAt: `${credit.expiresOn}T20:00:00.000Z`,
      reasons: [reason("Vervaldatum", "Alleen beschikbare credits binnen veertien dagen tellen mee.", `${days} dagen resterend`)],
      sourceHref: "/admin/agenda",
      isTest: credit.isTest,
      journeyRunId: credit.journeyRunId
    }));
  }

  for (const forecast of input.capacityForecasts ?? []) {
    if (!["bottleneck", "critical"].includes(forecast.riskLevel)) continue;
    actions.push(candidate({
      actionType: "forecast_capacity_review",
      fingerprint: `forecast_capacity_review:${forecast.groupId}:${forecast.isTest ? "test" : "live"}`,
      title: `Capaciteitsforecast vraagt aandacht bij ${forecast.groupName}`,
      description: "De 4–12-wekenforecast verwacht druk. Beoordeel planning, doorstroom en alternatieven voordat er iets wijzigt.",
      priority: forecast.riskLevel === "critical" ? "high" : "medium",
      entityType: "group",
      entityId: forecast.groupId,
      groupId: forecast.groupId,
      programId: forecast.programId,
      reasons: [
        reason("Verwacht knelpunt", "Vraag, huidige bezetting en voorzichtige uitstroom zijn gecombineerd.", `${forecast.expectedBottlenecks} onvervulde verwachte vraag`),
        ...forecast.evidence.slice(0, 3).map((evidence) =>
          reason("Brondata", "Uitlegbaar onderdeel van de forecast.", evidence)
        )
      ],
      suggestedActions: [
        { label: "Open capaciteitsvoorspelling", href: "/admin/rapportages/capaciteit" },
        { label: "Open What-if planning", href: `/admin/agenda?group=${forecast.groupId}` }
      ],
      sourceHref: "/admin/rapportages/capaciteit",
      confidence: confidenceValue(forecast.confidence),
      isTest: forecast.isTest
    }));
  }

  for (const risk of input.attendanceRisks ?? []) {
    if (!["elevated", "high"].includes(risk.riskLevel)) continue;
    actions.push(candidate({
      actionType: "attendance_follow_up",
      fingerprint: `attendance_follow_up:${risk.participantId}:${risk.groupId}:${risk.signalType}`,
      title: "Warme aanwezigheidscheck voorgesteld",
      description: risk.reason,
      priority: risk.riskLevel === "high" ? "high" : "medium",
      entityType: "participant",
      entityId: risk.participantId,
      participantId: risk.participantId,
      groupId: risk.groupId,
      reasons: risk.evidence.map((evidence) =>
        reason("Aanwezigheidsbron", "Neutraal signaal; dit leidt nooit automatisch tot uitschrijven of plaatsverlies.", evidence)
      ),
      suggestedActions: [
        { label: "Beoordeel begeleiding", href: "/admin/rapportages/leskwaliteit" }
      ],
      sourceHref: "/admin/rapportages/leskwaliteit",
      confidence: confidenceValue(risk.confidence),
      isTest: risk.isTest,
      journeyRunId: risk.journeyRunId
    }));
  }

  for (const bottleneck of input.progressBottlenecks ?? []) {
    actions.push(candidate({
      actionType: "progress_bottleneck_review",
      fingerprint: `progress_bottleneck_review:${bottleneck.groupId ?? "all"}:${bottleneck.skillId}:${bottleneck.isTest ? "test" : "live"}`,
      title: `Lesfocus beoordelen: ${bottleneck.skillLabel}`,
      description: "Een voldoende groot groepssignaal wijst op extra oefenruimte. Het signaal gaat over leskwaliteit, niet over een individueel kind.",
      priority: bottleneck.stagnationRate >= 0.6 ? "high" : "medium",
      entityType: bottleneck.groupId ? "group" : "progress_item",
      entityId: bottleneck.groupId ?? bottleneck.skillId,
      groupId: bottleneck.groupId,
      programId: bottleneck.programId,
      reasons: [
        reason("Steekproef", "Alleen voldoende grote groepssignalen worden aangeboden.", `${bottleneck.affectedCount} van ${bottleneck.totalCount} observaties`),
        reason("Positieve lesfocus", "De instructeur beslist of dit in de les past.", bottleneck.suggestedFocus)
      ],
      suggestedActions: [
        { label: "Open leskwaliteit", href: "/admin/rapportages/leskwaliteit" }
      ],
      sourceHref: "/admin/rapportages/leskwaliteit",
      confidence: confidenceValue(bottleneck.confidence),
      isTest: bottleneck.isTest,
      journeyRunId: bottleneck.journeyRunId
    }));
  }

  return actions
    .sort((left, right) =>
      priorityRank(left.priority) - priorityRank(right.priority) ||
      (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999") ||
      left.title.localeCompare(right.title, "nl")
    );
}

function candidate(input: Partial<NextBestActionCandidate> & Pick<NextBestActionCandidate, "actionType" | "fingerprint" | "title" | "description" | "priority" | "reasons" | "sourceHref">): NextBestActionCandidate {
  return {
    entityType: null,
    entityId: null,
    participantId: null,
    guardianId: null,
    groupId: null,
    programId: null,
    dueAt: null,
    suggestedActions: [{ label: "Bekijk brondata", href: input.sourceHref }],
    confidence: 0.78,
    isTest: false,
    journeyRunId: null,
    ...input
  };
}

function reason(label: string, explanation: string, evidence: string): NextBestActionReason {
  return { label, explanation, evidence };
}

function partitionTestData<Row extends { isTest: boolean }>(rows: Row[]) {
  return [
    { isTest: false, rows: rows.filter((row) => !row.isTest) },
    { isTest: true, rows: rows.filter((row) => row.isTest) }
  ];
}

function singleJourneyRun(rows: Array<{ journeyRunId: string | null }>) {
  const runs = [...new Set(rows.flatMap((row) => row.journeyRunId ? [row.journeyRunId] : []))];
  return runs.length === 1 ? runs[0]! : null;
}

function ageHours(value: string, now: Date) {
  return Math.max(0, (now.getTime() - new Date(value).getTime()) / hourMs);
}

function overdueDays(dueOn: string | null, today: string) {
  if (!dueOn) return 0;
  return Math.max(0, Math.floor((new Date(`${today}T00:00:00.000Z`).getTime() - new Date(`${dueOn}T00:00:00.000Z`).getTime()) / dayMs));
}

function scopeFingerprint(window: NextBestActionInput["demandWindows"][number]) {
  return [window.programId, window.stageId ?? "all", window.weekday, window.timeBlock ?? "any", window.isTest ? "test" : "live"].join(":");
}

function priorityRank(priority: NextBestActionPriority) {
  return ({ high: 0, medium: 1, low: 2 } as const)[priority];
}

function weekdayLabel(day: number) {
  return ["", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"][day] ?? "een passende dag";
}

function confidenceValue(confidence: "laag" | "middel" | "hoog") {
  return { laag: 0.45, middel: 0.7, hoog: 0.9 }[confidence];
}

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
