import {
  classifyContent,
  type ContentClassification
} from "../security/content-classification";

export const communicationTemplateChannels = [
  "in_app",
  "email",
  "newsletter",
  "whatsapp_urgent",
  "sms_fallback"
] as const;

export const threadTypes = [
  "general",
  "planning",
  "payment",
  "progress",
  "graduation",
  "intake",
  "waitlist",
  "support",
  "internal"
] as const;

export const threadStatuses = [
  "open",
  "waiting_for_parent",
  "waiting_for_school",
  "assigned",
  "closed",
  "archived"
] as const;

export const messageVisibilities = [
  "public_to_thread",
  "internal_note",
  "staff_only"
] as const;

export const newsletterStatuses = [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "cancelled",
  "archived"
] as const;

export const newsletterSegments = [
  "all_parents",
  "program_parents",
  "group_parents",
  "stage_parents",
  "waitlist",
  "new_intakes",
  "graduation_candidates",
  "makeup_credit_parents",
  "open_payment_parents",
  "instructors"
] as const;

export type CommunicationTemplateChannel =
  (typeof communicationTemplateChannels)[number];
export type ThreadType = (typeof threadTypes)[number];
export type ThreadStatus = (typeof threadStatuses)[number];
export type MessageVisibility = (typeof messageVisibilities)[number];
export type NewsletterStatus = (typeof newsletterStatuses)[number];
export type NewsletterSegment = (typeof newsletterSegments)[number];

export const communicationTemplateChannelLabels: Record<
  CommunicationTemplateChannel,
  string
> = {
  in_app: "In-app",
  email: "E-mail",
  newsletter: "Nieuwsbrief",
  whatsapp_urgent: "WhatsApp — urgent",
  sms_fallback: "SMS — fallback"
};

export const threadTypeLabels: Record<ThreadType, string> = {
  general: "Algemeen",
  planning: "Planning",
  payment: "Betaling",
  progress: "Voortgang",
  graduation: "Afzwemmen",
  intake: "Intake",
  waitlist: "Wachtlijst",
  support: "Ondersteuning",
  internal: "Intern"
};

export const threadStatusLabels: Record<ThreadStatus, string> = {
  open: "Open",
  waiting_for_parent: "Wacht op ouder",
  waiting_for_school: "Wacht op zwemschool",
  assigned: "Toegewezen",
  closed: "Gesloten",
  archived: "Gearchiveerd"
};

export const messageVisibilityLabels: Record<MessageVisibility, string> = {
  public_to_thread: "Zichtbaar voor gesprek",
  internal_note: "Interne notitie",
  staff_only: "Alleen team"
};

export const newsletterStatusLabels: Record<NewsletterStatus, string> = {
  draft: "Concept",
  scheduled: "Ingepland",
  sending: "Wordt verzonden",
  sent: "Verzonden",
  cancelled: "Geannuleerd",
  archived: "Gearchiveerd"
};

const newsletterSegmentMeta: Record<
  NewsletterSegment,
  { label: string; summary: string }
> = {
  all_parents: {
    label: "Alle ouders",
    summary: "Actieve ouders/verzorgers met een geldige nieuwsbriefvoorkeur."
  },
  program_parents: {
    label: "Ouders per programma",
    summary: "Ouders/verzorgers van actieve deelnemers in het gekozen programma."
  },
  group_parents: {
    label: "Ouders per groep",
    summary: "Ouders/verzorgers van actieve of proeflesdeelnemers in de gekozen groep."
  },
  stage_parents: {
    label: "Ouders per badje",
    summary: "Ouders/verzorgers van actieve deelnemers in het gekozen niveau of badje."
  },
  waitlist: {
    label: "Wachtlijst",
    summary: "Contacten op de actieve wachtlijst die nieuwsbriefcommunicatie toestaan."
  },
  new_intakes: {
    label: "Nieuwe intakes",
    summary: "Recente intakecontacten met een aantoonbare toestemming voor nieuwsbrieven."
  },
  graduation_candidates: {
    label: "Afzwemkandidaten",
    summary: "Ouders/verzorgers van deelnemers met een actuele afzwemstatus."
  },
  makeup_credit_parents: {
    label: "Ouders met inhaalcredit",
    summary: "Ouders/verzorgers van deelnemers met een beschikbare inhaalcredit."
  },
  open_payment_parents: {
    label: "Ouders met open betaling",
    summary: "Ouders/verzorgers met een open betaling; gebruik dit alleen voor servicecommunicatie."
  },
  instructors: {
    label: "Instructeurs",
    summary: "Actieve instructeurs binnen de huidige organisatie."
  }
};

export const newsletterSegmentLabels = Object.fromEntries(
  newsletterSegments.map((segment) => [
    segment,
    newsletterSegmentMeta[segment].label
  ])
) as Record<NewsletterSegment, string>;

export const communicationShortcodes = [
  { key: "parent_name", label: "Naam ouder/verzorger" },
  { key: "child_name", label: "Naam leerling" },
  { key: "program_name", label: "Programma" },
  { key: "stage_name", label: "Niveau of badje" },
  { key: "group_name", label: "Groep" },
  { key: "lesson_date", label: "Lesdatum" },
  { key: "lesson_time", label: "Lestijd" },
  { key: "instructor_name", label: "Instructeur" },
  { key: "payment_link", label: "Betaallink" },
  { key: "portal_link", label: "Portaallink" },
  { key: "tenant_name", label: "Organisatienaam" }
] as const;

export type CommunicationShortcode =
  (typeof communicationShortcodes)[number]["key"];

const shortcodeKeys = new Set<string>(
  communicationShortcodes.map((shortcode) => shortcode.key)
);
const shortcodePattern = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export type ShortcodeValidation = {
  unknown: string[];
  used: CommunicationShortcode[];
  valid: boolean;
};

export function validateShortcodes(text: string): ShortcodeValidation {
  const used = new Set<CommunicationShortcode>();
  const unknown = new Set<string>();

  for (const match of text.matchAll(shortcodePattern)) {
    const key = match[1] ?? "";

    if (shortcodeKeys.has(key)) {
      used.add(key as CommunicationShortcode);
    } else {
      unknown.add(key);
    }
  }

  return {
    unknown: [...unknown].sort(),
    used: [...used],
    valid: unknown.size === 0
  };
}

export function renderCommunicationTemplate(
  text: string,
  variables: Partial<Record<CommunicationShortcode, string | null | undefined>>
) {
  const validation = validateShortcodes(text);

  if (!validation.valid) {
    throw new Error(
      `Onbekende communicatievariabelen: ${validation.unknown.join(", ")}`
    );
  }

  const missing = validation.used.filter((key) => {
    const value = variables[key];

    return typeof value !== "string" || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new Error(
      `Ontbrekende communicatievariabelen: ${missing.join(", ")}`
    );
  }

  return text.replace(shortcodePattern, (_token, rawKey: string) => {
    const key = rawKey as CommunicationShortcode;

    return variables[key]!.trim();
  });
}

const allowedHtmlTags = new Set([
  "a",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "li",
  "ol",
  "p",
  "s",
  "strong",
  "u",
  "ul"
]);
const voidHtmlTags = new Set(["br"]);
const blockedHtmlBlocks =
  /<(script|style|iframe|object|embed|form|svg|math|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

export function sanitizeCommunicationHtml(html: string) {
  const withoutBlockedContent = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(blockedHtmlBlocks, "");

  return withoutBlockedContent
    .replace(/<[^>]*>/g, (tag) => sanitizeHtmlTag(tag))
    .trim();
}

export function extractPlainText(html: string) {
  const sanitized = sanitizeCommunicationHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|h2|h3|li|blockquote)>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "");

  return decodeHtmlEntities(sanitized)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function summarizeNewsletterSegment(key: NewsletterSegment) {
  const segment = newsletterSegmentMeta[key];

  return `${segment.label}: ${segment.summary}`;
}

export function canUseCommunicationChannel(input: {
  channel: CommunicationTemplateChannel;
  emailEnabled: boolean | string | null | undefined;
  hasConsent: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
}) {
  if (input.channel === "in_app") return true;

  const emailSendingEnabled =
    input.emailEnabled === true || input.emailEnabled === "true";

  if (input.channel === "email") return emailSendingEnabled;
  if (input.channel === "newsletter") {
    return emailSendingEnabled && input.hasConsent;
  }
  if (input.channel === "whatsapp_urgent") {
    return input.whatsappEnabled && input.hasConsent;
  }

  return input.smsEnabled && input.hasConsent;
}

export function isHumanConfirmed(value: unknown) {
  return value === "confirmed";
}

export type CommunicationContentAssessment = {
  blocksExternalDelivery: boolean;
  classification: ContentClassification;
  reasons: string[];
  requiresHumanReview: boolean;
  warning: string | null;
};

export function assessCommunicationContent(
  value: unknown
): CommunicationContentAssessment {
  const result = classifyContent(value);
  const sensitive =
    result.classification === "sensitive" ||
    result.classification === "restricted";

  return {
    blocksExternalDelivery: sensitive,
    classification: result.classification,
    reasons: result.reasons,
    requiresHumanReview: result.classification !== "operational",
    warning: sensitive
      ? "Deze inhoud bevat mogelijk gevoelige of strikt beschermde gegevens. Externe verzending is geblokkeerd totdat de tekst handmatig is aangepast."
      : result.classification === "personal"
        ? "Controleer ontvangers en doelgroep handmatig: deze inhoud bevat persoonsgegevens."
        : null
  };
}

export function isCommunicationTemplateChannel(
  value: unknown
): value is CommunicationTemplateChannel {
  return (
    typeof value === "string" &&
    (communicationTemplateChannels as readonly string[]).includes(value)
  );
}

export function isThreadType(value: unknown): value is ThreadType {
  return (
    typeof value === "string" &&
    (threadTypes as readonly string[]).includes(value)
  );
}

export function isThreadStatus(value: unknown): value is ThreadStatus {
  return (
    typeof value === "string" &&
    (threadStatuses as readonly string[]).includes(value)
  );
}

export function isMessageVisibility(value: unknown): value is MessageVisibility {
  return (
    typeof value === "string" &&
    (messageVisibilities as readonly string[]).includes(value)
  );
}

export function isNewsletterStatus(value: unknown): value is NewsletterStatus {
  return (
    typeof value === "string" &&
    (newsletterStatuses as readonly string[]).includes(value)
  );
}

export function isNewsletterSegment(value: unknown): value is NewsletterSegment {
  return (
    typeof value === "string" &&
    (newsletterSegments as readonly string[]).includes(value)
  );
}

function sanitizeHtmlTag(tag: string) {
  const match = /^<\s*(\/?)\s*([a-zA-Z0-9-]+)(?:\s[^>]*)?>$/.exec(tag);

  if (!match) return "";

  const closing = match[1] === "/";
  const name = (match[2] ?? "").toLowerCase();

  if (!allowedHtmlTags.has(name)) return "";
  if (closing) return voidHtmlTags.has(name) ? "" : `</${name}>`;
  if (name !== "a") return `<${name}>`;

  const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
    tag
  );
  const href = decodeHtmlEntities(
    hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? ""
  ).trim();

  if (!isSafeCommunicationHref(href)) return "<a>";

  return `<a href="${escapeHtmlAttribute(href)}" rel="noopener noreferrer">`;
}

function isSafeCommunicationHref(href: string) {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (href.startsWith("#")) return true;

  try {
    const parsed = new URL(href);

    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\""
  };

  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,
    (entity, decimal: string | undefined, hexadecimal: string | undefined, name: string | undefined) => {
      if (decimal) return safeCodePoint(Number.parseInt(decimal, 10), entity);
      if (hexadecimal) {
        return safeCodePoint(Number.parseInt(hexadecimal, 16), entity);
      }

      return named[name?.toLowerCase() ?? ""] ?? entity;
    }
  );
}

function safeCodePoint(value: number, fallback: string) {
  if (!Number.isInteger(value) || value <= 0 || value > 0x10ffff) {
    return fallback;
  }

  return String.fromCodePoint(value);
}
