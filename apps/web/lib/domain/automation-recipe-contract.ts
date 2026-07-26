export const automationRecipeKeys = [
  "no_show_follow_up",
  "birthday_message",
  "offer_expiring",
  "long_absence",
  "diploma_achieved",
  "payment_failed",
  "makeup_credit_expiring",
  "graduation_reminder",
  "trial_lesson_follow_up",
  "waitlist_capacity_available"
] as const;

export type AutomationRecipeKey = (typeof automationRecipeKeys)[number];
export type AutomationRecipeCategory = "attendance" | "billing" | "engagement" | "placement" | "progress";
export type AutomationRecipeExecutionMode = "test" | "live";

export type AutomationRecipeSettings = {
  cooldownDays: number;
  daysAhead: number;
  lookbackDays: number;
  minimumOccurrences: number;
  minimumConfidence: number;
};

export type AutomationRecipeDefinition = {
  key: AutomationRecipeKey;
  name: string;
  summary: string;
  category: AutomationRecipeCategory;
  triggerLabel: string;
  sourceLabel: string;
  defaultSettings: AutomationRecipeSettings;
  safeguards: string[];
  consentNotice: string;
  builtInOverlap: string | null;
};

export type AutomationRecipeCandidate = {
  confidence: number;
  dedupeKey: string;
  entityId: string;
  entityType: string;
  isTest: boolean;
  journeyRunId: string | null;
  label: string;
  participantId: string | null;
  reasons: string[];
  sourceData: Record<string, boolean | number | string | null>;
};

export type AutomationRecipeDecision = {
  candidate: AutomationRecipeCandidate | null;
  confidence: number | null;
  eligible: boolean;
  reasons: string[];
  skippedReason: string | null;
};

const safeDefaults: AutomationRecipeSettings = {
  cooldownDays: 14,
  daysAhead: 2,
  lookbackDays: 30,
  minimumOccurrences: 2,
  minimumConfidence: 0.65
};

export const automationRecipeCatalog: readonly AutomationRecipeDefinition[] = [
  {
    key: "no_show_follow_up",
    name: "No-show opvolging",
    summary: "Zet herhaalde, niet verklaarde lesafwezigheid klaar voor een warme menselijke check-in.",
    category: "attendance",
    triggerLabel: "Minimaal twee afwezigheden in 30 dagen",
    sourceLabel: "Aanwezigheidsregistratie en smart events",
    defaultSettings: { ...safeDefaults },
    safeguards: ["Een losse absentie geldt niet automatisch als no-show.", "Alleen een interne controletaak wordt gemaakt."],
    consentNotice: "Een bericht aan een ouder blijft een aparte, handmatig bevestigde actie.",
    builtInOverlap: null
  },
  {
    key: "birthday_message",
    name: "Verjaardagsbericht",
    summary: "Bereidt een interne herinnering voor een optioneel verjaardagsbericht voor.",
    category: "engagement",
    triggerLabel: "Verjaardag binnen één dag",
    sourceLabel: "Actieve leerling en geboortedatum",
    defaultSettings: { ...safeDefaults, daysAhead: 1, minimumOccurrences: 1 },
    safeguards: ["Leeftijd en volledige geboortedatum worden niet in runlogs opgeslagen.", "Nooit automatisch verzenden."],
    consentNotice: "Verjaardagscommunicatie vereist een aantoonbare occasion/marketing-opt-in.",
    builtInOverlap: null
  },
  {
    key: "offer_expiring",
    name: "Aanbod verloopt bijna",
    summary: "Laat openstaande plaatsingsaanbiedingen vóór het verstrijken opnieuw controleren.",
    category: "placement",
    triggerLabel: "Open aanbod verloopt binnen twee dagen",
    sourceLabel: "Plaatsingsaanbod en wachtlijst",
    defaultSettings: { ...safeDefaults, daysAhead: 2, minimumOccurrences: 1 },
    safeguards: ["Status en vervaldatum worden opnieuw gecontroleerd.", "Geen automatische plaatsing of verzending."],
    consentNotice: "Een reminder wordt pas na menselijke controle vanuit het dossier verstuurd.",
    builtInOverlap: null
  },
  {
    key: "long_absence",
    name: "Lange afwezigheid",
    summary: "Signaleert langdurig uitblijvende aanwezigheid zonder recente zichtbare opvolging.",
    category: "attendance",
    triggerLabel: "42 dagen geen aanwezigheid en 30 dagen geen contact",
    sourceLabel: "Learning intelligence",
    defaultSettings: { ...safeDefaults, lookbackDays: 90, minimumOccurrences: 1 },
    safeguards: ["Geen oorzaak, gezondheidssituatie of intentie afleiden.", "Neutrale interne opvolgtaak."],
    consentNotice: "Contact blijft persoonlijk en vereist een afzonderlijke medewerkerbeslissing.",
    builtInOverlap: null
  },
  {
    key: "diploma_achieved",
    name: "Diploma behaald",
    summary: "Zet een recent uitgegeven diploma klaar voor gecontroleerde felicitatie-opvolging.",
    category: "progress",
    triggerLabel: "Diploma recent uitgegeven",
    sourceLabel: "Diplomakluis",
    defaultSettings: { ...safeDefaults, lookbackDays: 2, minimumOccurrences: 1 },
    safeguards: ["Ingetrokken diploma's worden uitgesloten.", "Geen automatisch ouderbericht."],
    consentNotice: "De bestaande diplomaflow kan al notificeren; voorkom dubbele communicatie.",
    builtInOverlap: "De afzwemflow maakt momenteel al een diploma-notificatie."
  },
  {
    key: "payment_failed",
    name: "Mislukte betaling",
    summary: "Maakt een interne financiële controletaak zonder betaling of incasso te starten.",
    category: "billing",
    triggerLabel: "Betaling of incasso mislukt",
    sourceLabel: "Billing smart event",
    defaultSettings: { ...safeDefaults, lookbackDays: 3, minimumOccurrences: 1 },
    safeguards: ["Nooit automatisch incasseren, retryen of blokkeren.", "Alleen een interne taak."],
    consentNotice: "Een betaalbericht wordt apart door een medewerker beoordeeld en bevestigd.",
    builtInOverlap: "De billingflow kan al een taak en servicebericht maken; deduplicatie blijft verplicht."
  },
  {
    key: "makeup_credit_expiring",
    name: "Inhaalcredit verloopt bijna",
    summary: "Laat beschikbare inhaalcredits vóór de vervaldatum door een medewerker controleren.",
    category: "engagement",
    triggerLabel: "Beschikbare credit verloopt binnen zeven dagen",
    sourceLabel: "Inhaalcredits",
    defaultSettings: { ...safeDefaults, daysAhead: 7, minimumOccurrences: 1 },
    safeguards: ["Alleen nog beschikbare credits tellen mee.", "Geen automatische reservering of uitnodiging."],
    consentNotice: "Uitnodigen gebruikt de make-up communicatievoorkeuren en menselijke bevestiging.",
    builtInOverlap: null
  },
  {
    key: "graduation_reminder",
    name: "Afzwemherinnering",
    summary: "Zet een aankomend afzwemmoment met actieve uitnodiging klaar voor controle.",
    category: "progress",
    triggerLabel: "Afzwemmoment binnen zeven dagen",
    sourceLabel: "Afzwemevent en uitnodiging",
    defaultSettings: { ...safeDefaults, daysAhead: 7, minimumOccurrences: 1 },
    safeguards: ["Geannuleerde events en afgewezen uitnodigingen worden uitgesloten.", "Geen automatische reminder."],
    consentNotice: "Een ouderreminder blijft een handmatig bevestigde serviceboodschap.",
    builtInOverlap: null
  },
  {
    key: "trial_lesson_follow_up",
    name: "Proefles follow-up",
    summary: "Zet een afgeronde proefles zonder vastgelegde opvolging klaar voor persoonlijk contact.",
    category: "engagement",
    triggerLabel: "Proefles afgerond, na 12 uur nog geen opvolging",
    sourceLabel: "CRM follow-up",
    defaultSettings: { ...safeDefaults, lookbackDays: 2, minimumOccurrences: 1 },
    safeguards: ["Alleen relationeel gekoppelde CRM-signalen.", "Geen automatisch commercieel bericht."],
    consentNotice: "Proeflesopvolging kan commercieel zijn en vereist een geldige contactrechtsgrond.",
    builtInOverlap: null
  },
  {
    key: "waitlist_capacity_available",
    name: "Nieuwe wachtlijstplek beschikbaar",
    summary: "Toont een actuele, blocker-vrije plaatsingssuggestie voor menselijke beoordeling.",
    category: "placement",
    triggerLabel: "Actuele suggestie met voldoende confidence",
    sourceLabel: "Smart Placement 2.0",
    defaultSettings: { ...safeDefaults, minimumConfidence: 0.65, minimumOccurrences: 1 },
    safeguards: ["Geen exacte plek-aantallen naar ouders.", "Nooit automatisch aanbieden, plaatsen of weigeren."],
    consentNotice: "De beheerder kiest zelf een kandidaat en bevestigt ieder vervolg afzonderlijk.",
    builtInOverlap: null
  }
] as const;

const catalogByKey = new Map(automationRecipeCatalog.map((recipe) => [recipe.key, recipe]));

export function getAutomationRecipeDefinition(key: AutomationRecipeKey) {
  return catalogByKey.get(key)!;
}

export function normalizeAutomationRecipeSettings(
  input: Partial<Record<keyof AutomationRecipeSettings, unknown>>,
  definition: AutomationRecipeDefinition
): AutomationRecipeSettings {
  return {
    cooldownDays: boundedInteger(input.cooldownDays, definition.defaultSettings.cooldownDays, 1, 90),
    daysAhead: boundedInteger(input.daysAhead, definition.defaultSettings.daysAhead, 0, 30),
    lookbackDays: boundedInteger(input.lookbackDays, definition.defaultSettings.lookbackDays, 1, 365),
    minimumOccurrences: boundedInteger(input.minimumOccurrences, definition.defaultSettings.minimumOccurrences, 1, 20),
    minimumConfidence: boundedNumber(input.minimumConfidence, definition.defaultSettings.minimumConfidence, 0.5, 1)
  };
}

export function decideAutomationRecipeCandidate(
  candidate: AutomationRecipeCandidate | null
): AutomationRecipeDecision {
  if (!candidate) {
    return {
      candidate: null,
      confidence: null,
      eligible: false,
      reasons: ["Er is nu geen record dat aan de veilige recipevoorwaarden voldoet."],
      skippedReason: "no_matching_candidate"
    };
  }

  if (candidate.isTest || candidate.journeyRunId) {
    return {
      candidate,
      confidence: clamp(candidate.confidence),
      eligible: false,
      reasons: [...candidate.reasons, "Journey Bot- en testdata worden nooit door live automatiseringen verwerkt."],
      skippedReason: "test_data_blocked"
    };
  }

  return {
    candidate,
    confidence: clamp(candidate.confidence),
    eligible: true,
    reasons: candidate.reasons,
    skippedReason: null
  };
}

export function buildReviewTask(input: {
  candidate: AutomationRecipeCandidate;
  recipeName: string;
}) {
  return {
    title: `${input.recipeName}: controle nodig`,
    description: [
      input.candidate.label,
      ...input.candidate.reasons.map((reason) => `• ${reason}`),
      "Controleer de brondata en bepaal zelf of en hoe je opvolgt. Er is niets automatisch verzonden, geplaatst, geïncasseerd of gewijzigd."
    ].join("\n"),
    priority: input.candidate.confidence >= 0.85 ? "high" : "normal"
  } as const;
}

export function parseAutomationRecipeKey(value: unknown): AutomationRecipeKey | null {
  return typeof value === "string" && (automationRecipeKeys as readonly string[]).includes(value)
    ? value as AutomationRecipeKey
    : null;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
