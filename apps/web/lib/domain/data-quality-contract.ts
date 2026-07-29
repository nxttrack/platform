export type DataQualitySeverity = "info" | "warning" | "error" | "critical";
export type DataQualityIssueStatus = "open" | "ignored" | "resolved" | "auto_resolved";

export type DataQualityFinding = {
  entityType: string;
  entityId: string;
  issueType: string;
  fingerprint: string;
  severity: DataQualitySeverity;
  title: string;
  description: string;
  suggestedAction: string;
  isTest: boolean;
  journeyRunId: string | null;
  metadata: Record<string, unknown>;
};

export type DataQualityInput = {
  now: string;
  guardians: Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    profileExists: boolean;
  }>;
  participantGuardians: Array<{
    participantId: string;
    guardianId: string;
    status: string;
  }>;
  participants: Array<{
    id: string;
    name: string;
    birthDate: string | null;
    guardianUserId: string | null;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  intakes: Array<{
    id: string;
    participantName: string;
    status: string;
    hasConvertedParticipant: boolean;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  waitlistEntries: Array<{
    id: string;
    participantName: string;
    programId: string | null;
    stageId: string | null;
    status: string;
    minimumAgeBlocked: boolean;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  programs: Array<{
    id: string;
    name: string;
    status: string;
  }>;
  groups: Array<{
    id: string;
    name: string;
    status: string;
    resourceId: string | null;
    hasEffectiveResource: boolean;
    hasEffectiveInstructor: boolean;
  }>;
  sessions: Array<{
    id: string;
    label: string;
    groupId: string | null;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  enrollments: Array<{
    id: string;
    participantId: string;
    participantName: string;
    programId: string | null;
    status: string;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  memberships: Array<{
    id: string;
    participantId: string;
    participantName: string;
    groupId: string;
    groupName: string;
    status: string;
    startsOn: string | null;
    endsOn: string | null;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
  financialRecords: Array<{
    id: string;
    kind: "subscription" | "payment";
    participantId: string | null;
    participantName: string;
    guardianId: string | null;
    status: string;
  }>;
  journeyRecords: Array<{
    id: string;
    entityType: string;
    entityLabel: string;
    source: string;
    isTest: boolean;
    journeyRunId: string | null;
  }>;
};

export function detectDataQualityIssues(input: DataQualityInput): DataQualityFinding[] {
  const findings: DataQualityFinding[] = [];
  const guardianById = new Map(input.guardians.map((guardian) => [guardian.id, guardian]));
  const participantById = new Map(input.participants.map((participant) => [participant.id, participant]));
  const programById = new Map(input.programs.map((program) => [program.id, program]));
  const groupIds = new Set(input.groups.map((group) => group.id));
  const activeGuardianIdsByParticipant = groupSet(
    input.participantGuardians.filter((link) => link.status === "active"),
    (link) => link.participantId,
    (link) => link.guardianId
  );
  const today = input.now.slice(0, 10);

  detectDuplicateGuardians(input.guardians, findings);

  for (const guardian of input.guardians) {
    if (!guardian.profileExists) {
      findings.push(
        finding({
          entityType: "guardian",
          entityId: guardian.id,
          issueType: "guardian_profile_missing",
          severity: "critical",
          title: "Ouderkoppeling verwijst naar een ontbrekend profiel",
          description: "Een leerling-, lidmaatschaps- of financiële koppeling verwijst naar een Auth-account zonder bruikbaar NXTTRACK-profiel.",
          suggestedAction: "Controleer het account en herstel het profiel of koppel na verificatie een bestaande ouder/verzorger.",
          label: "Ontbrekend ouderprofiel",
          href: "/admin/leerlingen",
          evidence: ["De gekoppelde gebruikers-ID is niet aangetroffen in profiles."],
          confidence: 1
        })
      );
      continue;
    }

    if (!normalizeEmail(guardian.email)) {
      findings.push(
        finding({
          entityType: "guardian",
          entityId: guardian.id,
          issueType: "guardian_missing_email",
          severity: "error",
          title: "Ouder/verzorger heeft geen e-mailadres",
          description: "Uitnodigingen, plaatsingsaanbiedingen en belangrijke serviceberichten kunnen deze ouder niet betrouwbaar bereiken.",
          suggestedAction: "Open het gekoppelde leerlingdossier en voeg na verificatie een correct e-mailadres toe.",
          label: guardian.name ?? "Ouder/verzorger",
          href: `/admin/leerlingen?q=${encodeURIComponent(guardian.name ?? "")}`,
          evidence: ["Er is geen genormaliseerd e-mailadres in het profiel aangetroffen."],
          confidence: 1
        })
      );
    }
  }

  for (const participant of input.participants) {
    const guardianIds = activeGuardianIdsByParticipant.get(participant.id) ?? new Set<string>();
    if (participant.guardianUserId) guardianIds.add(participant.guardianUserId);

    if (guardianIds.size === 0) {
      findings.push(
        finding({
          entityType: "participant",
          entityId: participant.id,
          issueType: "participant_without_guardian",
          severity: "critical",
          title: "Leerling heeft geen gekoppelde ouder/verzorger",
          description: "Zonder actieve ouderkoppeling kunnen toestemming, communicatie, plaatsing en betaling niet betrouwbaar worden afgehandeld.",
          suggestedAction: "Koppel na controle minimaal één actieve ouder/verzorger aan deze leerling.",
          label: participant.name,
          href: `/admin/leerlingen?q=${encodeURIComponent(participant.name)}`,
          evidence: ["Geen legacy guardian en geen actieve participant_guardians-relatie gevonden."],
          confidence: 1,
          participantId: participant.id,
          isTest: participant.isTest,
          journeyRunId: participant.journeyRunId
        })
      );
    }

    const birthIssue = classifyBirthDate(participant.birthDate, input.now);
    if (birthIssue) {
      findings.push(
        finding({
          entityType: "participant",
          entityId: participant.id,
          issueType: "participant_impossible_birth_date",
          severity: "error",
          title: "Geboortedatum lijkt onmogelijk",
          description: birthIssue,
          suggestedAction: "Controleer de geboortedatum aan de hand van de oorspronkelijke inschrijving en corrigeer deze alleen na bevestiging.",
          label: participant.name,
          href: `/admin/leerlingen?q=${encodeURIComponent(participant.name)}`,
          evidence: [`Vastgelegde geboortedatum: ${participant.birthDate ?? "leeg"}.`],
          confidence: 0.99,
          participantId: participant.id,
          isTest: participant.isTest,
          journeyRunId: participant.journeyRunId
        })
      );
    }
  }

  for (const intake of input.intakes) {
    if (intake.status === "converted" && !intake.hasConvertedParticipant) {
      findings.push(
        finding({
          entityType: "intake_submission",
          entityId: intake.id,
          issueType: "converted_intake_without_participant",
          severity: "critical",
          title: "Geconverteerde intake mist een leerlingkoppeling",
          description: "De intake staat op geconverteerd, maar via de wachtlijst en geaccepteerde plaatsingsaanbiedingen is geen aangemaakte leerling teruggevonden.",
          suggestedAction: "Controleer de conversiehistorie en koppel of herstel de leerling handmatig; zet de intake niet automatisch terug.",
          label: intake.participantName,
          href: `/admin/intake?q=${encodeURIComponent(intake.participantName)}`,
          evidence: ["Status is converted.", "Geen accepted_participant_id gevonden via gekoppelde wachtlijstaanbiedingen."],
          confidence: 0.92,
          isTest: intake.isTest,
          journeyRunId: intake.journeyRunId
        })
      );
    }
  }

  for (const entry of input.waitlistEntries) {
    if (!entry.programId || !entry.stageId) {
      findings.push(
        finding({
          entityType: "waitlist_entry",
          entityId: entry.id,
          issueType: !entry.programId ? "waitlist_without_program" : "waitlist_without_stage",
          severity: !entry.programId ? "critical" : "error",
          title: !entry.programId ? "Wachtlijstpositie mist een programma" : "Wachtlijstpositie mist een niveau",
          description: !entry.programId
            ? "Zonder programma kan de kandidaat niet verantwoord worden vergeleken met lesgroepen."
            : "Zonder aanbevolen niveau kan de plaatsingsscore geen betrouwbare niveaumatch uitleggen.",
          suggestedAction: !entry.programId
            ? "Kies na beoordeling het juiste programma."
            : "Beoordeel de zwemervaring en leg het aanbevolen niveau vast.",
          label: entry.participantName,
          href: `/admin/wachtlijst?q=${encodeURIComponent(entry.participantName)}`,
          evidence: [!entry.programId ? "program_id ontbreekt." : "recommended_stage_id ontbreekt."],
          confidence: 1,
          isTest: entry.isTest,
          journeyRunId: entry.journeyRunId
        })
      );
    }
  }

  for (const group of input.groups) {
    if (!["planned", "active"].includes(group.status)) continue;

    if (!group.hasEffectiveInstructor) {
      findings.push(
        finding({
          entityType: "group",
          entityId: group.id,
          issueType: "group_without_instructor",
          severity: "error",
          title: "Lesgroep heeft geen instructeur",
          description: "Er is geen actieve groepsinstructeur en ook geen instructeur op een toekomstige sessie gevonden.",
          suggestedAction: "Wijs een primaire instructeur of aantoonbare sessiebezetting toe voordat de les plaatsvindt.",
          label: group.name,
          href: `/admin/groepen?q=${encodeURIComponent(group.name)}`,
          evidence: ["Geen effectieve actieve instructeurstoewijzing gevonden."],
          confidence: 0.98
        })
      );
    }

    if (!group.resourceId && !group.hasEffectiveResource) {
      findings.push(
        finding({
          entityType: "group",
          entityId: group.id,
          issueType: "group_without_resource",
          severity: "error",
          title: "Lesgroep heeft geen bad of resource",
          description: "Zonder vaste of toekomstige sessieresource kan planning niet betrouwbaar controleren op baan-, bad- en locatieconflicten.",
          suggestedAction: "Koppel een standaardresource of plan alle toekomstige sessies met een concrete resource.",
          label: group.name,
          href: `/admin/groepen?q=${encodeURIComponent(group.name)}`,
          evidence: ["Geen default_resource_id en geen resource op een toekomstige sessie gevonden."],
          confidence: 0.98
        })
      );
    }
  }

  for (const session of input.sessions) {
    if (!session.groupId || !groupIds.has(session.groupId)) {
      findings.push(
        finding({
          entityType: "session",
          entityId: session.id,
          issueType: "session_without_group",
          severity: "critical",
          title: "Sessie mist een geldige lesgroep",
          description: "De sessie verwijst niet naar een bestaande lesgroep. Capaciteit, roster en instructeurstoegang zijn daardoor onbetrouwbaar.",
          suggestedAction: "Koppel de sessie aan de juiste groep of annuleer de verweesde sessie na controle.",
          label: session.label,
          href: "/admin/agenda",
          evidence: [`group_id: ${session.groupId ?? "leeg"}.`],
          confidence: 1,
          isTest: session.isTest,
          journeyRunId: session.journeyRunId
        })
      );
    }
  }

  const effectiveMemberships = input.memberships.filter(
    (membership) =>
      ["active", "trial"].includes(membership.status) &&
      (!membership.startsOn || membership.startsOn <= today) &&
      (!membership.endsOn || membership.endsOn >= today)
  );
  const membershipsByParticipant = groupArray(effectiveMemberships, (membership) => membership.participantId);

  for (const [participantId, memberships] of membershipsByParticipant) {
    if (new Set(memberships.map((membership) => membership.groupId)).size > 1) {
      const participant = participantById.get(participantId);
      findings.push(
        finding({
          entityType: "participant",
          entityId: participantId,
          issueType: "participant_in_multiple_active_groups",
          severity: "error",
          title: "Leerling staat tegelijk in meerdere actieve groepen",
          description: "Gelijktijdige actieve plaatsingen kunnen capaciteit, presentie, facturatie en oudercommunicatie dubbel laten lopen.",
          suggestedAction: "Controleer of dit bewust is en beëindig na bevestiging de verouderde groepskoppeling.",
          label: participant?.name ?? memberships[0]?.participantName ?? "Leerling",
          href: `/admin/leerlingen?q=${encodeURIComponent(participant?.name ?? memberships[0]?.participantName ?? "")}`,
          evidence: memberships.map((membership) => membership.groupName),
          confidence: 0.97,
          participantId,
          isTest: participant?.isTest ?? memberships.some((membership) => membership.isTest),
          journeyRunId: participant?.journeyRunId ?? memberships.find((membership) => membership.journeyRunId)?.journeyRunId ?? null
        })
      );
    }
  }

  for (const enrollment of input.enrollments) {
    const program = enrollment.programId ? programById.get(enrollment.programId) : null;
    if (enrollment.status === "active" && (!program || program.status !== "active")) {
      findings.push(
        finding({
          entityType: "enrollment",
          entityId: enrollment.id,
          issueType: "active_enrollment_without_active_program",
          severity: "critical",
          title: "Actieve inschrijving heeft geen actief programma",
          description: program
            ? `Het gekoppelde programma “${program.name}” heeft status ${program.status}.`
            : "Het gekoppelde programma kon niet worden teruggevonden.",
          suggestedAction: "Controleer de inschrijving en activeer of vervang het programma alleen na inhoudelijke beoordeling.",
          label: enrollment.participantName,
          href: `/admin/leerlingen?q=${encodeURIComponent(enrollment.participantName)}`,
          evidence: [`Programmastatus: ${program?.status ?? "ontbreekt"}.`],
          confidence: 1,
          participantId: enrollment.participantId,
          isTest: enrollment.isTest,
          journeyRunId: enrollment.journeyRunId
        })
      );
    }
  }

  for (const financial of input.financialRecords) {
    const guardianExists = !!financial.guardianId && guardianById.get(financial.guardianId)?.profileExists === true;
    if (isFinanciallyActive(financial.kind, financial.status) && !guardianExists) {
      findings.push(
        finding({
          entityType: financial.kind,
          entityId: financial.id,
          issueType: `${financial.kind}_without_guardian`,
          severity: "critical",
          title: financial.kind === "payment" ? "Betaling mist een geldige ouder/verzorger" : "Abonnement mist een geldige ouder/verzorger",
          description: "De financiële verplichting is actief of open, maar er is geen bestaand ouderprofiel aan gekoppeld.",
          suggestedAction: "Controleer de contracthouder en koppel pas na verificatie het juiste ouderaccount.",
          label: financial.participantName,
          href: `/admin/betalingen?q=${encodeURIComponent(financial.participantName)}`,
          evidence: [`guardian_user_id: ${financial.guardianId ? "profiel niet gevonden" : "leeg"}.`, `Status: ${financial.status}.`],
          confidence: 1,
          participantId: financial.participantId ?? undefined
        })
      );
    }
  }

  for (const membership of input.memberships) {
    if (!membership.startsOn) {
      findings.push(
        finding({
          entityType: "group_membership",
          entityId: membership.id,
          issueType: "group_membership_without_start_date",
          severity: "error",
          title: "Groepsplaatsing mist een startdatum",
          description: "Zonder startdatum is niet bepaalbaar wanneer capaciteit, presentie en facturatie moeten ingaan.",
          suggestedAction: "Controleer de plaatsingsbeslissing en leg de bevestigde startdatum vast.",
          label: `${membership.participantName} · ${membership.groupName}`,
          href: `/admin/leerlingen?q=${encodeURIComponent(membership.participantName)}`,
          evidence: ["starts_on ontbreekt."],
          confidence: 1,
          participantId: membership.participantId,
          isTest: membership.isTest,
          journeyRunId: membership.journeyRunId
        })
      );
    }
  }

  for (const participant of input.participants) {
    const age = ageOn(participant.birthDate, input.now);
    if (age !== null && age >= 0 && age < 4 && (membershipsByParticipant.get(participant.id)?.length ?? 0) > 0) {
      findings.push(
        finding({
          entityType: "participant",
          entityId: participant.id,
          issueType: "under_four_participant_is_placeable",
          severity: "critical",
          title: "Leerling onder vier jaar is actief geplaatst",
          description: "De leerling is jonger dan de ingestelde veilige minimumleeftijd en heeft toch een effectieve actieve of proeflesplaatsing.",
          suggestedAction: "Laat een medewerker leeftijd, programma-eisen en plaatsing controleren; wijzig niets automatisch.",
          label: participant.name,
          href: `/admin/leerlingen?q=${encodeURIComponent(participant.name)}`,
          evidence: [`Berekende leeftijd: ${age.toFixed(2)} jaar.`, "Effectieve actieve/trial groepsplaatsing gevonden."],
          confidence: 0.99,
          participantId: participant.id,
          isTest: participant.isTest,
          journeyRunId: participant.journeyRunId
        })
      );
    }
  }

  for (const record of input.journeyRecords) {
    const hasAnyMarker = record.source === "journey_simulation_bot" || record.isTest || !!record.journeyRunId;
    const hasCompleteMarker = record.source === "journey_simulation_bot" && record.isTest && !!record.journeyRunId;
    if (hasAnyMarker && !hasCompleteMarker) {
      findings.push(
        finding({
          entityType: record.entityType,
          entityId: record.id,
          issueType: "journey_bot_marker_drift",
          severity: "critical",
          title: "Journey Bot-record mist een volledig testlabel",
          description: "Bron, testvlag en run-ID vormen geen geldige combinatie. Daardoor kan testdata in dashboards of cleanup onbetrouwbaar worden behandeld.",
          suggestedAction: "Controleer de oorspronkelijke Journey Bot-run en herstel de drie markers samen of archiveer het record gecontroleerd.",
          label: record.entityLabel,
          href: hrefForEntity(record.entityType, record.entityLabel),
          evidence: [
            `source=${record.source}`,
            `is_test=${record.isTest}`,
            `journey_run_id=${record.journeyRunId ? "aanwezig" : "ontbreekt"}`
          ],
          confidence: 1,
          isTest: true,
          journeyRunId: record.journeyRunId
        })
      );
    }
  }

  return deduplicateFindings(findings);
}

function detectDuplicateGuardians(guardians: DataQualityInput["guardians"], findings: DataQualityFinding[]) {
  const definitions = [
    { key: "email", issueType: "duplicate_guardian_email", label: "e-mailadres", normalize: normalizeEmail },
    { key: "phone", issueType: "duplicate_guardian_phone", label: "telefoonnummer", normalize: normalizePhone },
    { key: "name", issueType: "duplicate_guardian_name", label: "naam", normalize: normalizeName }
  ] as const;

  for (const definition of definitions) {
    const grouped = new Map<string, DataQualityInput["guardians"]>();
    for (const guardian of guardians) {
      const normalized = definition.normalize(guardian[definition.key]);
      if (!normalized) continue;
      grouped.set(normalized, [...(grouped.get(normalized) ?? []), guardian]);
    }

    for (const duplicates of grouped.values()) {
      if (duplicates.length < 2) continue;
      const [canonical, ...possibleDuplicates] = duplicates.sort((left, right) => left.id.localeCompare(right.id));
      for (const duplicate of possibleDuplicates) {
        findings.push(
          finding({
            entityType: "guardian",
            entityId: duplicate.id,
            issueType: definition.issueType,
            severity: definition.key === "name" ? "warning" : "error",
            title: `Mogelijk dubbele ouder/verzorger op ${definition.label}`,
            description: `Minimaal twee ouderprofielen hebben hetzelfde genormaliseerde ${definition.label}. Dit kan communicatie, toestemming en betaling over meerdere accounts verspreiden.`,
            suggestedAction: "Vergelijk de profielen en relaties handmatig. Voeg accounts alleen samen via een gecontroleerde migratie.",
            label: duplicate.name ?? "Ouder/verzorger",
            href: `/admin/leerlingen?q=${encodeURIComponent(duplicate.name ?? "")}`,
            evidence: [`Matchtype: ${definition.label}.`, `Mogelijk hoofdprofiel: ${canonical.id}.`],
            confidence: definition.key === "name" ? 0.72 : 0.96,
            relatedEntityIds: duplicates.map((guardian) => guardian.id)
          })
        );
      }
    }
  }
}

function finding(input: {
  entityType: string;
  entityId: string;
  issueType: string;
  severity: DataQualitySeverity;
  title: string;
  description: string;
  suggestedAction: string;
  label: string;
  href: string;
  evidence: string[];
  confidence: number;
  participantId?: string;
  relatedEntityIds?: string[];
  isTest?: boolean;
  journeyRunId?: string | null;
}): DataQualityFinding {
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    issueType: input.issueType,
    fingerprint: `${input.issueType}:${input.entityType}:${input.entityId}`,
    severity: input.severity,
    title: input.title,
    description: input.description,
    suggestedAction: input.suggestedAction,
    isTest: input.isTest ?? false,
    journeyRunId: input.journeyRunId ?? null,
    metadata: {
      confidence: input.confidence,
      evidence: input.evidence,
      entityLabel: input.label,
      entityHref: input.href,
      participantId: input.participantId ?? null,
      relatedEntityIds: input.relatedEntityIds ?? []
    }
  };
}

function classifyBirthDate(value: string | null, nowValue: string) {
  if (!value) return null;
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  const now = new Date(nowValue);
  if (Number.isNaN(birthDate.getTime())) return "De opgeslagen waarde is geen geldige datum.";
  if (birthDate.getTime() > now.getTime()) return "De geboortedatum ligt in de toekomst.";
  if (ageOn(value, nowValue)! > 120) return "De berekende leeftijd is hoger dan 120 jaar.";
  return null;
}

function ageOn(value: string | null, nowValue: string) {
  if (!value) return null;
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  const now = new Date(nowValue);
  if (Number.isNaN(birthDate.getTime()) || Number.isNaN(now.getTime())) return null;
  return (now.getTime() - birthDate.getTime()) / (365.2425 * 24 * 60 * 60 * 1000);
}

function isFinanciallyActive(kind: "subscription" | "payment", status: string) {
  return kind === "subscription"
    ? ["active", "paused"].includes(status)
    : ["due", "overdue"].includes(status);
}

function normalizeEmail(value: string | null) {
  return value?.trim().toLowerCase() || null;
}

function normalizePhone(value: string | null) {
  const normalized = value?.replace(/\D/g, "") ?? "";
  return normalized.length >= 8 ? normalized.replace(/^0031/, "0").replace(/^31/, "0") : null;
}

function normalizeName(value: string | null) {
  const normalized = value
    ?.normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normalized && normalized.length >= 5 ? normalized : null;
}

function hrefForEntity(entityType: string, label: string) {
  if (["participant", "enrollment", "group_membership"].includes(entityType)) return `/admin/leerlingen?q=${encodeURIComponent(label)}`;
  if (entityType === "intake_submission") return `/admin/intake?q=${encodeURIComponent(label)}`;
  if (entityType === "waitlist_entry") return `/admin/wachtlijst?q=${encodeURIComponent(label)}`;
  if (entityType === "group") return `/admin/groepen?q=${encodeURIComponent(label)}`;
  if (entityType === "session") return "/admin/agenda";
  return "/admin/automatisering/datakwaliteit";
}

function groupSet<Row, Key, Value>(
  rows: Row[],
  key: (row: Row) => Key,
  value: (row: Row) => Value
) {
  const grouped = new Map<Key, Set<Value>>();
  for (const row of rows) {
    const rowKey = key(row);
    const values = grouped.get(rowKey) ?? new Set<Value>();
    values.add(value(row));
    grouped.set(rowKey, values);
  }
  return grouped;
}

function groupArray<Row, Key>(rows: Row[], key: (row: Row) => Key) {
  const grouped = new Map<Key, Row[]>();
  for (const row of rows) {
    const rowKey = key(row);
    grouped.set(rowKey, [...(grouped.get(rowKey) ?? []), row]);
  }
  return grouped;
}

function deduplicateFindings(findings: DataQualityFinding[]) {
  return [...new Map(findings.map((item) => [item.fingerprint, item])).values()].sort((left, right) => {
    const rank: Record<DataQualitySeverity, number> = { critical: 0, error: 1, warning: 2, info: 3 };
    return rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title, "nl");
  });
}
