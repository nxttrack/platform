import {
  classifyContent,
  type ContentClassification
} from "../security/content-classification";

export type CommunicationCoachGoal =
  | "shorter"
  | "clearer"
  | "warmer"
  | "simpler"
  | "neutral";

export type CommunicationCoachConfidence = "high" | "medium" | "low";

export type CommunicationCoachWarning = {
  blocksUse: boolean;
  code: string;
  message: string;
  tone: "info" | "warning" | "critical";
};

export type CommunicationCoachInput = {
  audience: "tenant_staff" | "instructors" | "parents" | "all_tenant";
  body: string;
  goal: CommunicationCoachGoal;
  protectedTerms?: string[];
  status: "draft" | "published" | "archived";
  title: string;
  visibility: "internal" | "portal";
};

export type CommunicationCoachProposal = {
  body: string;
  title: string;
};

export type CommunicationCoachResult = {
  blocked: boolean;
  changed: boolean;
  confidence: CommunicationCoachConfidence;
  effectiveClassification: ContentClassification;
  originalClassification: ContentClassification;
  protectedFacts: string[];
  proposal: CommunicationCoachProposal;
  proposalClassification: ContentClassification;
  reasons: string[];
  warnings: CommunicationCoachWarning[];
};

const classificationRank: Record<ContentClassification, number> = {
  operational: 0,
  personal: 1,
  sensitive: 2,
  restricted: 3
};

const goalReasons: Record<CommunicationCoachGoal, string> = {
  shorter: "Overbodige formele aanlopen zijn verwijderd.",
  clearer: "De bestaande zinnen zijn rustiger over alinea's verdeeld.",
  warmer: "Er is een passende begroeting en afsluiting toegevoegd.",
  simpler: "Formele woorden zijn vervangen door begrijpelijkere woorden.",
  neutral: "Beschuldigende standaardzinnen zijn neutraler geformuleerd."
};

const replacements: Record<Exclude<CommunicationCoachGoal, "warmer" | "clearer">, Array<[RegExp, string]>> = {
  shorter: [
    [/\bHierbij willen wij u graag informeren dat\b/gi, "We laten je weten dat"],
    [/\bWij willen u graag laten weten dat\b/gi, "We laten je weten dat"],
    [/\bWij willen u informeren dat\b/gi, "We laten je weten dat"],
    [/\bmet betrekking tot\b/gi, "over"],
    [/\bten aanzien van\b/gi, "over"],
    [/\bop dit moment\b/gi, "nu"]
  ],
  simpler: [
    [/\bgelieve\b/gi, "wil je"],
    [/\bomtrent\b/gi, "over"],
    [/\balsmede\b/gi, "en"],
    [/\breeds\b/gi, "al"],
    [/\btevens\b/gi, "ook"],
    [/\bheden\b/gi, "vandaag"],
    [/\bmet betrekking tot\b/gi, "over"]
  ],
  neutral: [
    [/\bU heeft nog niet betaald\./g, "We hebben de betaling nog niet ontvangen."],
    [/\bJe hebt nog niet betaald\./g, "We hebben de betaling nog niet ontvangen."],
    [/\bU heeft niet gereageerd\./g, "We hebben uw reactie nog niet ontvangen."],
    [/\bJe hebt niet gereageerd\./g, "We hebben je reactie nog niet ontvangen."]
  ]
};

const protectedPatterns = [
  /\{\{[^{}\n]+\}\}/g,
  /\[\[[^\[\]\n]+\]\]/g,
  /\{[a-zA-Z0-9_.-]+\}/g,
  /https?:\/\/[^\s<>()]+/gi,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:\+31|0)\s?6(?:[\s-]?\d){8}\b/g,
  /€\s?\d+(?:[.,]\d{1,2})?|\b\d+(?:[.,]\d{1,2})?\s?(?:EUR|euro)\b/gi,
  /\b\d{1,2}[:.]\d{2}\b/g,
  /\b(?:\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?|\d{4}-\d{2}-\d{2})\b/g,
  /\b\d+(?:[.,]\d+)?%/g,
  /\b[A-Z0-9]{6,}\b/g,
  /\b\d+(?:[.,]\d+)?\b/g
];

const adversePattern =
  /\b(afwijzen|afgewezen|weigeren|geweigerd|uitschrijven|uitgeschreven|schorsen|geschorsing|stopzetten|geen plek|niet geplaatst|betalingsachterstand|aanmaning|incasso|deurwaarder)\b/i;
const claimPattern =
  /\b(garantie|gegarandeerd|zeker beschikbaar|gratis|toegezegd|definitief beschikbaar)\b/gi;
const negationPattern = /\b(niet|geen|nooit|zonder)\b/gi;

export function coachCommunication(
  input: CommunicationCoachInput
): CommunicationCoachResult {
  const original = normalizeProposal({ title: input.title, body: input.body });
  const originalClassification = classifyContent(original).classification;
  const initialWarnings = getContextWarnings(input, originalClassification);

  if (initialWarnings.some((warning) => warning.blocksUse)) {
    return buildResult({
      input,
      original,
      proposal: original,
      reasons: [],
      contextWarnings: initialWarnings
    });
  }

  const proposal = {
    title: original.title,
    body: transformBody(original.body, input.goal, input.audience)
  };
  const changed = proposal.title !== original.title || proposal.body !== original.body;

  return buildResult({
    input,
    original,
    proposal,
    reasons: changed ? [goalReasons[input.goal]] : [],
    contextWarnings: initialWarnings
  });
}

export function reviewCommunicationProposal(
  input: CommunicationCoachInput,
  proposal: CommunicationCoachProposal,
  reasons: string[] = []
): CommunicationCoachResult {
  const original = normalizeProposal({ title: input.title, body: input.body });

  return buildResult({
    input,
    original,
    proposal: normalizeProposal(proposal),
    reasons,
    contextWarnings: getContextWarnings(
      input,
      classifyContent(original).classification
    )
  });
}

function buildResult({
  input,
  original,
  proposal,
  reasons,
  contextWarnings
}: {
  input: CommunicationCoachInput;
  original: CommunicationCoachProposal;
  proposal: CommunicationCoachProposal;
  reasons: string[];
  contextWarnings: CommunicationCoachWarning[];
}): CommunicationCoachResult {
  const originalClassification = classifyContent(original).classification;
  const proposalClassification = classifyContent(proposal).classification;
  const effectiveClassification = maxClassification(
    originalClassification,
    proposalClassification
  );
  const protectedFacts = collectProtectedFacts(
    `${original.title}\n${original.body}`,
    input.protectedTerms
  );
  const proposalText = `${proposal.title}\n${proposal.body}`;
  const warnings = deduplicateWarnings([
    ...contextWarnings,
    ...validateProposal({
      originalText: `${original.title}\n${original.body}`,
      proposalText,
      protectedFacts
    })
  ]);
  const changed =
    proposal.title !== original.title || proposal.body !== original.body;
  const blocked = warnings.some((warning) => warning.blocksUse);
  const confidence: CommunicationCoachConfidence = blocked
    ? "low"
    : !changed
      ? "low"
      : warnings.some((warning) => warning.tone === "critical")
        ? "low"
        : warnings.some((warning) => warning.tone === "warning")
          ? "medium"
          : "high";

  return {
    blocked,
    changed,
    confidence,
    effectiveClassification,
    originalClassification,
    protectedFacts,
    proposal,
    proposalClassification,
    reasons,
    warnings
  };
}

function transformBody(
  body: string,
  goal: CommunicationCoachGoal,
  audience: CommunicationCoachInput["audience"]
) {
  if (!body) return body;

  if (goal === "warmer") {
    return addWarmFrame(body, audience);
  }

  if (goal === "clearer") {
    return clarifyParagraphs(body);
  }

  return applyReplacements(body, replacements[goal]);
}

function addWarmFrame(
  body: string,
  audience: CommunicationCoachInput["audience"]
) {
  const greeting =
    audience === "parents"
      ? "Beste ouder/verzorger,"
      : audience === "instructors" || audience === "tenant_staff"
        ? "Beste collega,"
        : "Hallo,";
  const hasGreeting = /^(beste|hallo|hoi|geachte)\b/i.test(body.trimStart());
  const hasClosing =
    /(met vriendelijke groet|vriendelijke groet|hartelijke groet|groeten),?\s*[\s\S]*$/i.test(
      body.trimEnd()
    );
  let next = body.trim();

  if (!hasGreeting) next = `${greeting}\n\n${next}`;
  if (!hasClosing) next = `${next}\n\nMet vriendelijke groet,\nhet team`;

  return next;
}

function clarifyParagraphs(body: string) {
  const trimmed = body.trim();

  if (trimmed.includes("\n\n")) return trimmed;
  const sentences = trimmed
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  return sentences.length >= 3 ? sentences.join("\n\n") : trimmed;
}

function applyReplacements(body: string, rules: Array<[RegExp, string]>) {
  return rules
    .reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), body)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getContextWarnings(
  input: CommunicationCoachInput,
  classification: ContentClassification
): CommunicationCoachWarning[] {
  const warnings: CommunicationCoachWarning[] = [];
  const text = `${input.title}\n${input.body}`;

  if (classification === "restricted") {
    warnings.push({
      blocksUse: true,
      code: "restricted_content",
      message:
        "Dit concept bevat mogelijk een geheim, bankrekening of identificatienummer. Verwijder die waarde voordat je de coach gebruikt.",
      tone: "critical"
    });
  } else if (classification === "sensitive") {
    warnings.push({
      blocksUse: true,
      code: "sensitive_content",
      message:
        "Gezondheids- of andere bijzondere persoonsgegevens worden niet automatisch herschreven. Formuleer dit bericht volledig handmatig.",
      tone: "critical"
    });
  } else if (
    classification === "personal" &&
    (input.audience === "parents" || input.audience === "all_tenant")
  ) {
    warnings.push({
      blocksUse: false,
      code: "personal_broad_audience",
      message:
        "Controleer of persoonsgegevens werkelijk met deze brede doelgroep gedeeld mogen worden.",
      tone: "warning"
    });
  }

  if (adversePattern.test(text)) {
    warnings.push({
      blocksUse: true,
      code: "adverse_decision",
      message:
        "Dit concept gaat mogelijk over een nadelig besluit, plaatsing of invordering. De coach wijzigt zulke inhoud niet.",
      tone: "critical"
    });
  }

  if (input.audience === "parents" && input.visibility === "internal") {
    warnings.push({
      blocksUse: false,
      code: "parents_internal",
      message:
        "Ouders kunnen een intern bericht niet openen. Kies Portaal voordat je publiceert.",
      tone: "warning"
    });
  }

  if (input.audience === "all_tenant" && input.visibility === "internal") {
    warnings.push({
      blocksUse: false,
      code: "all_tenant_internal",
      message:
        "Bij interne zichtbaarheid worden ouders uitgesloten van notificaties en e-mail.",
      tone: "info"
    });
  }

  if (input.status === "published") {
    warnings.push({
      blocksUse: false,
      code: "publish_requires_confirmation",
      message:
        "Publiceren blijft een aparte menselijke actie en kan direct notificaties en e-mail versturen.",
      tone: "warning"
    });
  }

  return warnings;
}

function validateProposal({
  originalText,
  proposalText,
  protectedFacts
}: {
  originalText: string;
  proposalText: string;
  protectedFacts: string[];
}): CommunicationCoachWarning[] {
  const warnings: CommunicationCoachWarning[] = [];
  const originalOccurrences = collectProtectedOccurrences(originalText);
  const proposalOccurrences = collectProtectedOccurrences(proposalText);
  const protectedTermsMissing = protectedFacts.filter(
    (fact) => !proposalText.includes(fact)
  );

  if (
    protectedTermsMissing.length > 0 ||
    !sameMultiset(originalOccurrences, proposalOccurrences)
  ) {
    warnings.push({
      blocksUse: true,
      code: "protected_fact_changed",
      message:
        "Een datum, bedrag, code, link of ander beschermd feit is toegevoegd, gewijzigd of verdwenen.",
      tone: "critical"
    });
  }

  const originalClaims = collectMatches(originalText, claimPattern);
  const introducedClaims = collectMatches(proposalText, claimPattern).filter(
    (claim) => !originalClaims.includes(claim)
  );
  if (introducedClaims.length > 0) {
    warnings.push({
      blocksUse: true,
      code: "claim_introduced",
      message:
        "Het voorstel voegt een garantie, toezegging of beschikbaarheidsclaim toe die niet in het origineel stond.",
      tone: "critical"
    });
  }

  const originalNegations = collectMatches(originalText, negationPattern);
  const proposalNegations = collectMatches(proposalText, negationPattern);
  if (!sameMultiset(originalNegations, proposalNegations)) {
    warnings.push({
      blocksUse: true,
      code: "negation_changed",
      message:
        "Het voorstel verandert een ontkenning zoals ‘niet’, ‘geen’ of ‘nooit’ en kan daardoor de betekenis wijzigen.",
      tone: "critical"
    });
  }

  return warnings;
}

function collectProtectedFacts(text: string, extraTerms: string[] = []) {
  const facts = new Set(
    extraTerms.map((term) => term.trim()).filter(Boolean)
  );

  for (const pattern of protectedPatterns) {
    for (const match of text.matchAll(pattern)) {
      if (match[0]) facts.add(match[0]);
    }
  }

  return [...facts].sort((left, right) => left.localeCompare(right, "nl"));
}

function collectProtectedOccurrences(text: string) {
  return protectedPatterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].flatMap((match) => (match[0] ? [match[0]] : []))
  );
}

function collectMatches(text: string, pattern: RegExp) {
  return [...text.matchAll(pattern)].map((match) =>
    match[0].toLocaleLowerCase("nl")
  );
}

function sameMultiset(left: string[], right: string[]) {
  return [...left].sort().join("\u0000") === [...right].sort().join("\u0000");
}

function maxClassification(
  left: ContentClassification,
  right: ContentClassification
) {
  return classificationRank[right] > classificationRank[left] ? right : left;
}

function normalizeProposal(proposal: CommunicationCoachProposal) {
  return {
    title: proposal.title.trim(),
    body: proposal.body.trim()
  };
}

function deduplicateWarnings(warnings: CommunicationCoachWarning[]) {
  return [
    ...new Map(warnings.map((warning) => [warning.code, warning])).values()
  ];
}
