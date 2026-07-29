"use client";

import {
  normalizeAttribution,
  type AnalyticsConsent,
  type AttributionSnapshot
} from "./attribution";

const consentStorageKey = "nxttrack.analytics-consent.v1";
const attributionStorageKey = "nxttrack.first-touch-attribution.v1";
const consentEventName = "nxttrack:analytics-consent";
const attributionEventName = "nxttrack:attribution";

let inMemoryAttribution: AttributionSnapshot | null = null;

export function captureClientAttribution(): AttributionSnapshot {
  if (inMemoryAttribution) {
    return inMemoryAttribution;
  }

  const persisted = readAnalyticsConsent() === "granted" ? readPersistedAttribution() : null;

  if (persisted) {
    inMemoryAttribution = persisted;
    return persisted;
  }

  const url = new URL(window.location.href);
  const referrerHost = getExternalReferrerHost(window.document.referrer, url.hostname);
  const search = url.searchParams;

  inMemoryAttribution = normalizeAttribution({
    source: search.get("utm_source"),
    medium: search.get("utm_medium"),
    campaign: search.get("utm_campaign"),
    content: search.get("utm_content"),
    term: search.get("utm_term"),
    referrerHost,
    landingPath: url.pathname,
    hasAdClickId: ["gclid", "dclid", "wbraid", "gbraid", "msclkid"].some((key) => search.has(key)),
    capturedAt: new Date().toISOString()
  });

  persistAttributionWhenAllowed(inMemoryAttribution);
  window.dispatchEvent(new CustomEvent(attributionEventName, { detail: inMemoryAttribution }));

  return inMemoryAttribution;
}

export function getClientAttribution() {
  return inMemoryAttribution ?? captureClientAttribution();
}

export function readAnalyticsConsent(): AnalyticsConsent {
  try {
    const value = window.localStorage.getItem(consentStorageKey);
    return value === "granted" || value === "denied" ? value : "unknown";
  } catch {
    return "unknown";
  }
}

export function saveAnalyticsConsent(value: Exclude<AnalyticsConsent, "unknown">) {
  try {
    window.localStorage.setItem(consentStorageKey, value);
  } catch {
    // Consent remains valid for the current page even when storage is unavailable.
  }

  if (value === "granted") {
    persistAttributionWhenAllowed(getClientAttribution());
  } else {
    try {
      window.sessionStorage.removeItem(attributionStorageKey);
    } catch {
      // Consent withdrawal still applies when storage is unavailable.
    }
    clearGoogleAnalyticsCookies();
  }

  window.dispatchEvent(new CustomEvent(consentEventName, { detail: value }));
}

export function subscribeToAttribution(listener: (snapshot: AttributionSnapshot) => void) {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<AttributionSnapshot>).detail;
    if (detail) listener(detail);
  };

  window.addEventListener(attributionEventName, handler);
  return () => window.removeEventListener(attributionEventName, handler);
}

export function subscribeToAnalyticsConsent(listener: (consent: AnalyticsConsent) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<AnalyticsConsent>).detail);

  window.addEventListener(consentEventName, handler);
  return () => window.removeEventListener(consentEventName, handler);
}

function persistAttributionWhenAllowed(snapshot: AttributionSnapshot) {
  if (readAnalyticsConsent() !== "granted") {
    return;
  }

  try {
    window.sessionStorage.setItem(attributionStorageKey, JSON.stringify(snapshot));
  } catch {
    // First touch remains available in memory for this navigation lifecycle.
  }
}

function readPersistedAttribution() {
  try {
    const raw = window.sessionStorage.getItem(attributionStorageKey);
    if (!raw) return null;

    return normalizeAttribution(JSON.parse(raw) as AttributionSnapshot);
  } catch {
    return null;
  }
}

function getExternalReferrerHost(referrer: string, currentHost: string) {
  if (!referrer) return null;

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    const ownHost = currentHost.toLowerCase();
    const sameSite = host === ownHost || host.endsWith(`.${ownHost}`) || ownHost.endsWith(`.${host}`);
    return sameSite ? null : host;
  } catch {
    return null;
  }
}

function clearGoogleAnalyticsCookies() {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=", 1)[0]?.trim();
    if (!name || (name !== "_ga" && !name.startsWith("_ga_"))) continue;

    document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${window.location.hostname}; SameSite=Lax`;
  }
}
