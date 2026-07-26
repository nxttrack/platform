"use client";

import { Cookie, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  captureClientAttribution,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  subscribeToAnalyticsConsent
} from "@/lib/analytics/client";
import {
  normalizeAnalyticsMeasurementId,
  type AnalyticsConsent,
  type AttributionSnapshot
} from "@/lib/analytics/attribution";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __nxttrackGaPromise?: Promise<void>;
    __nxttrackGaMeasurementId?: string;
  }
}

export function PublicAnalytics({
  measurementId,
  privacyHref = "/nxttrack/privacy"
}: {
  measurementId?: string | null;
  privacyHref?: string;
}) {
  const pathname = usePathname();
  const normalizedMeasurementId = useMemo(() => normalizeAnalyticsMeasurementId(measurementId), [measurementId]);
  const [consent, setConsent] = useState<AnalyticsConsent>("unknown");
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    captureClientAttribution();
    setConsent(readAnalyticsConsent());
    return subscribeToAnalyticsConsent(setConsent);
  }, []);

  useEffect(() => {
    if (!normalizedMeasurementId || consent !== "granted") {
      if (consent === "denied" && window.gtag) {
        window.gtag("consent", "update", deniedConsent);
      }
      return;
    }

    let active = true;

    void initializeGoogleAnalytics(normalizedMeasurementId)
      .then(() => {
        if (!active) return;

        sendPageView(pathname, captureClientAttribution());
        sendLeadEventOnce(pathname);
      })
      .catch(() => {
        // Analytics failure must never interrupt the public site or intake flow.
      });

    return () => {
      active = false;
    };
  }, [consent, normalizedMeasurementId, pathname]);

  if (!normalizedMeasurementId) {
    return null;
  }

  const showBanner = consent === "unknown" || preferencesOpen;

  function choose(nextConsent: Exclude<AnalyticsConsent, "unknown">) {
    saveAnalyticsConsent(nextConsent);
    setConsent(nextConsent);
    setPreferencesOpen(false);
  }

  return (
    <>
      {showBanner ? (
        <section
          aria-label="Cookievoorkeuren"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl sm:p-5"
          role="dialog"
        >
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-primary">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">Jouw privacyvoorkeur</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Met jouw toestemming gebruiken we Google Analytics om de website te verbeteren en te begrijpen welke publieke pagina&apos;s tot een intake leiden.
                Namen, e-mailadressen en kindgegevens sturen we nooit naar Google.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Noodzakelijke werking en de herkomst van een daadwerkelijk verstuurde aanmelding blijven in NXTTRACK zelf vastgelegd.{" "}
                <Link className="font-semibold text-primary hover:underline" href={privacyHref}>Lees meer</Link>
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button onClick={() => choose("denied")} type="button" variant="outline">
                  Alleen noodzakelijk
                </Button>
                <Button onClick={() => choose("granted")} type="button">
                  Analytics toestaan
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <button
          className="fixed bottom-3 left-3 z-[90] inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow-lg backdrop-blur transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          onClick={() => setPreferencesOpen(true)}
          type="button"
        >
          <Cookie aria-hidden="true" className="size-3.5" />
          Cookievoorkeuren
        </button>
      )}
    </>
  );
}

const deniedConsent = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied"
} as const;

async function initializeGoogleAnalytics(measurementId: string) {
  if (window.__nxttrackGaPromise && window.__nxttrackGaMeasurementId === measurementId) {
    return window.__nxttrackGaPromise;
  }

  window.__nxttrackGaMeasurementId = measurementId;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag("consent", "default", deniedConsent);
  window.gtag("set", "ads_data_redaction", true);

  window.__nxttrackGaPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-nxttrack-ga="${measurementId}"]`);

    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.nxttrackGa = measurementId;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Google Analytics kon niet worden geladen.")), { once: true });

    if (!existing) document.head.appendChild(script);
  }).then(() => {
    window.gtag?.("consent", "update", {
      ...deniedConsent,
      analytics_storage: "granted"
    });
    window.gtag?.("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false
    });
  });

  return window.__nxttrackGaPromise;
}

function sendPageView(pathname: string, attribution: AttributionSnapshot) {
  const pageLocation = new URL(pathname, window.location.origin);

  window.gtag?.("event", "page_view", {
    page_location: pageLocation.toString(),
    page_path: pathname,
    page_title: document.title,
    acquisition_channel: attribution.channel
  });
}

function sendLeadEventOnce(pathname: string) {
  if (pathname !== "/intake") return;

  const params = new URLSearchParams(window.location.search);
  const reference = params.get("referentie");
  if (params.get("ontvangen") !== "1" || !reference) return;

  const key = `nxttrack.ga-lead-sent.${reference.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40)}`;

  try {
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // The event may be sent twice after a reload when session storage is unavailable.
  }

  window.gtag?.("event", "generate_lead", { lead_type: "public_intake" });
}
