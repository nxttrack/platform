import assert from "node:assert/strict";
import test from "node:test";

import { applyTenantEmailBranding, normalizeTenantLogoUrl } from "../../apps/web/lib/email/tenant-branding";
import {
  evaluateShadowEntitlement,
  summarizeShadowLimits
} from "../../apps/web/lib/domain/shadow-entitlements-contract";

test("tenant e-mail branding accepts only credential-free HTTPS logos", () => {
  assert.equal(normalizeTenantLogoUrl("http://example.com/logo.png"), null);
  assert.equal(normalizeTenantLogoUrl("https://user:pass@example.com/logo.png"), null);
  assert.equal(normalizeTenantLogoUrl("javascript:alert(1)"), null);
  assert.equal(normalizeTenantLogoUrl("https://cdn.example.com/logo.png"), "https://cdn.example.com/logo.png");
});

test("tenant e-mail branding escapes tenant-controlled footer and logo content", () => {
  const branded = applyTenantEmailBranding({
    html: '<main><section style="color:#0f766e">Welkom</section></main>',
    organizationName: "Zwemschool",
    text: "Welkom"
  }, {
    accentColor: "#06b6d4",
    footer: "<script>alert(1)</script>",
    fromName: "De Waterlijn",
    logoUrl: "https://cdn.example.com/logo.png?x=%22",
    primaryColor: "#123456",
    productName: "De Waterlijn"
  });
  assert.match(branded.html ?? "", /#123456/);
  assert.match(branded.html ?? "", /https:\/\/cdn\.example\.com\/logo\.png\?x=%22/);
  assert.doesNotMatch(branded.html ?? "", /<script>/);
  assert.match(branded.html ?? "", /&lt;script&gt;/);
  assert.match(branded.text, /<script>alert\(1\)<\/script>/);
});

test("shadow package evaluation never denies access", () => {
  const excluded = evaluateShadowEntitlement({
    featureIncluded: false,
    featureName: "CRM-pipeline"
  });
  const exceeded = evaluateShadowEntitlement({
    featureIncluded: true,
    metricLabel: "Actieve leerlingen",
    observedValue: 125,
    softLimit: 100,
    unit: "count"
  });

  assert.equal(excluded.allowed, true);
  assert.equal(excluded.wouldAllow, false);
  assert.equal(excluded.mode, "shadow");
  assert.match(excluded.headline, /toegang blijft actief/i);
  assert.equal(exceeded.allowed, true);
  assert.equal(exceeded.status, "exceeded");
  assert.match(exceeded.reasons.at(-1) ?? "", /toegang blijft volledig beschikbaar/i);
});

test("shadow package limit summary surfaces the strongest observation", () => {
  const within = evaluateShadowEntitlement({ observedValue: 20, softLimit: 100 });
  const approaching = evaluateShadowEntitlement({ observedValue: 85, softLimit: 100 });
  assert.equal(summarizeShadowLimits([within, approaching]), "approaching");
  assert.equal(summarizeShadowLimits([]), "not_measured");
});
