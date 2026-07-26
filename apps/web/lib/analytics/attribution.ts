export const analyticsMeasurementIdPattern = /^G-[A-Z0-9]{6,20}$/;

export type AnalyticsConsent = "unknown" | "denied" | "granted";

export type AttributionChannel =
  | "direct"
  | "organic_search"
  | "paid_search"
  | "organic_social"
  | "paid_social"
  | "email"
  | "referral"
  | "campaign";

export type AttributionSnapshot = {
  channel: AttributionChannel;
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  referrerHost: string | null;
  landingPath: string;
  hasAdClickId: boolean;
  capturedAt: string;
};

type AttributionInput = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  referrerHost?: string | null;
  landingPath?: string | null;
  hasAdClickId?: boolean;
  capturedAt?: string | null;
};

const searchHosts = ["google.", "bing.com", "duckduckgo.com", "search.yahoo.", "ecosia.org"];
const socialHosts = ["facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "x.com", "twitter.com", "pinterest.", "youtube.com"];
const paidMedia = new Set(["cpc", "ppc", "paid", "paidsearch", "paid_search", "display"]);
const paidSocialMedia = new Set(["paid-social", "paid_social", "paidsocial"]);
const socialMedia = new Set(["social", "social-network", "social_media", "organic-social", "organic_social"]);

export function normalizeAnalyticsMeasurementId(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";

  return analyticsMeasurementIdPattern.test(normalized) ? normalized : null;
}

export function normalizeAttribution(input: AttributionInput): AttributionSnapshot {
  const source = sanitizeAttributionValue(input.source, 120);
  const medium = sanitizeAttributionValue(input.medium, 80);
  const campaign = sanitizeAttributionValue(input.campaign, 160);
  const content = sanitizeAttributionValue(input.content, 160);
  const term = sanitizeAttributionValue(input.term, 160);
  const referrerHost = sanitizeReferrerHost(input.referrerHost);
  const landingPath = sanitizeLandingPath(input.landingPath);
  const hasAdClickId = input.hasAdClickId === true;
  const resolvedSource = source ?? referrerHost ?? "direct";

  return {
    channel: deriveAttributionChannel({
      source: resolvedSource,
      medium,
      referrerHost,
      hasAdClickId
    }),
    source: resolvedSource,
    medium,
    campaign,
    content,
    term,
    referrerHost,
    landingPath,
    hasAdClickId,
    capturedAt: isIsoDate(input.capturedAt) ? input.capturedAt : new Date().toISOString()
  };
}

export function deriveAttributionChannel(input: {
  source?: string | null;
  medium?: string | null;
  referrerHost?: string | null;
  hasAdClickId?: boolean;
}): AttributionChannel {
  const medium = input.medium?.trim().toLowerCase() ?? "";
  const source = input.source?.trim().toLowerCase() ?? "";
  const referrerHost = input.referrerHost?.trim().toLowerCase() ?? "";

  if (input.hasAdClickId || paidMedia.has(medium)) {
    return "paid_search";
  }

  if (paidSocialMedia.has(medium)) {
    return "paid_social";
  }

  if (medium === "email" || medium === "e-mail" || source.includes("newsletter")) {
    return "email";
  }

  if (socialMedia.has(medium) || matchesHost(source || referrerHost, socialHosts)) {
    return "organic_social";
  }

  if (medium === "organic" || matchesHost(source || referrerHost, searchHosts)) {
    return "organic_search";
  }

  if (medium || (source && source !== "direct" && source !== "(direct)")) {
    return medium ? "campaign" : "referral";
  }

  return referrerHost ? "referral" : "direct";
}

export function sanitizeAttributionValue(value: string | null | undefined, maxLength = 160) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";

  if (!normalized || normalized.includes("@") || /(?:\+?\d[\s().-]*){7,}/.test(normalized)) {
    return null;
  }

  const safe = normalized.replace(/[^\p{L}\p{N} _./:+-]/gu, "").slice(0, maxLength).trim();

  return safe || null;
}

export function sanitizeReferrerHost(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase().replace(/\.$/, "") ?? "";

  if (!normalized || normalized.length > 253 || !/^[a-z0-9.-]+$/.test(normalized) || normalized.includes("..")) {
    return null;
  }

  return normalized;
}

export function sanitizeLandingPath(value: string | null | undefined) {
  const normalized = value?.trim().split(/[?#]/, 1)[0] ?? "";

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/";
  }

  return normalized.slice(0, 240);
}

export function attributionChannelLabel(channel: AttributionChannel) {
  return (
    {
      direct: "Direct",
      organic_search: "Organisch zoeken",
      paid_search: "Betaald zoeken",
      organic_social: "Organische social",
      paid_social: "Betaalde social",
      email: "E-mail",
      referral: "Doorverwijzing",
      campaign: "Campagne"
    } satisfies Record<AttributionChannel, string>
  )[channel];
}

function matchesHost(value: string, candidates: string[]) {
  return candidates.some((candidate) => value === candidate || value.endsWith(`.${candidate}`) || value.includes(candidate));
}

function isIsoDate(value: string | null | undefined): value is string {
  return !!value && Number.isFinite(new Date(value).getTime());
}
