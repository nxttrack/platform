import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveAttributionChannel,
  normalizeAnalyticsMeasurementId,
  normalizeAttribution,
  sanitizeAttributionValue,
  sanitizeLandingPath,
  sanitizeReferrerHost
} from "../../apps/web/lib/analytics/attribution";
import { buildLeadAttributionReport } from "../../apps/web/lib/analytics/lead-report";

describe("privacy-first lead attribution", () => {
  it("recognizes GA4 measurement IDs without accepting arbitrary script input", () => {
    assert.equal(normalizeAnalyticsMeasurementId(" g-abc1234567 "), "G-ABC1234567");
    assert.equal(normalizeAnalyticsMeasurementId("UA-123-4"), null);
    assert.equal(normalizeAnalyticsMeasurementId("G-ABC\"><script>"), null);
  });

  it("derives useful acquisition channels from campaign and referrer context", () => {
    assert.equal(deriveAttributionChannel({ source: "google", medium: "cpc" }), "paid_search");
    assert.equal(deriveAttributionChannel({ source: "instagram.com", medium: "paid_social" }), "paid_social");
    assert.equal(deriveAttributionChannel({ referrerHost: "www.google.nl" }), "organic_search");
    assert.equal(deriveAttributionChannel({ referrerHost: "partner.example" }), "referral");
    assert.equal(deriveAttributionChannel({ source: "direct" }), "direct");
  });

  it("drops obvious personal data and stores no raw advertising click ID", () => {
    assert.equal(sanitizeAttributionValue("ouder@example.nl"), null);
    assert.equal(sanitizeAttributionValue("+31 6 12345678"), null);

    const attribution = normalizeAttribution({
      source: "google",
      medium: "cpc",
      campaign: "zomer-instroom-2026",
      landingPath: "/intake?email=ouder@example.nl",
      hasAdClickId: true
    });

    assert.equal(attribution.channel, "paid_search");
    assert.equal(attribution.landingPath, "/intake");
    assert.equal(attribution.hasAdClickId, true);
    assert.equal("gclid" in attribution, false);
  });

  it("normalizes referrer hosts and rejects unsafe landing paths", () => {
    assert.equal(sanitizeReferrerHost("WWW.GOOGLE.NL"), "www.google.nl");
    assert.equal(sanitizeReferrerHost("https://google.nl/path"), null);
    assert.equal(sanitizeLandingPath("//tracking.example/path"), "/");
    assert.equal(sanitizeLandingPath("/intake?utm_source=mail"), "/intake");
  });

  it("reports real lead sources, campaigns and conversion while excluding Journey Bot data", () => {
    const report = buildLeadAttributionReport([
      {
        analytics_consent: "granted",
        attribution_campaign: "zomer",
        attribution_channel: "paid_search",
        attribution_source: "google",
        is_test: false,
        status: "converted"
      },
      {
        analytics_consent: "denied",
        attribution_campaign: "zomer",
        attribution_channel: "paid_search",
        attribution_source: "google",
        is_test: false,
        status: "received"
      },
      {
        analytics_consent: "granted",
        attribution_campaign: null,
        attribution_channel: "direct",
        attribution_source: "direct",
        is_test: false,
        status: "received"
      },
      {
        analytics_consent: "granted",
        attribution_campaign: "bot",
        attribution_channel: "campaign",
        attribution_source: "journey-bot",
        is_test: true,
        status: "converted"
      }
    ]);

    assert.equal(report.totalLeads, 3);
    assert.equal(report.converted, 1);
    assert.equal(report.conversionRate, 33);
    assert.equal(report.attributedLeads, 2);
    assert.equal(report.analyticsConsentRate, 67);
    assert.deepEqual(report.campaigns[0], {
      campaign: "zomer",
      source: "google",
      leads: 2,
      converted: 1,
      conversionRate: 50
    });
  });
});
