import assert from "node:assert/strict";
import test from "node:test";

import {
  getDefaultTenantSitePages,
  isSafeTenantSiteHref,
  normalizeTenantSitePage,
  normalizeTenantSiteSnapshot
} from "../../apps/web/lib/domain/site-page-contract";

test("website editor only accepts local paths and rejects protocol-relative or executable URLs", () => {
  for (const value of ["/", "/intake", "/programmas?niveau=1", "/nieuws/zomervakantie"]) {
    assert.equal(isSafeTenantSiteHref(value), true, value);
  }
  for (const value of ["//evil.example", "https://evil.example", "javascript:alert(1)", "intake", "/pad met spatie"]) {
    assert.equal(isSafeTenantSiteHref(value), false, value);
  }
});

test("site page defaults stay swim-first and are complete for all public surfaces", () => {
  const pages = getDefaultTenantSitePages("Zwemacademie De Waterlijn");
  assert.deepEqual(Object.keys(pages), ["home", "programs", "agenda", "news"]);
  assert.match(pages.home.intro, /kind/i);
  assert.equal(pages.programs.primaryCtaHref, "/intake");
  assert.equal(pages.agenda.status, "published");
  assert.equal(pages.news.seoTitle, "Nieuws · Zwemacademie De Waterlijn");
});

test("database content is normalized, bounded and falls back safely", () => {
  const fallback = getDefaultTenantSitePages("De Waterlijn").home;
  const normalized = normalizeTenantSitePage({
    eyebrow: "  Nieuwe bovenregel  ",
    intro: "x".repeat(800),
    primary_cta_href: "//outside.example",
    primary_cta_label: "Onveilig",
    secondary_cta_href: "/intake",
    secondary_cta_label: "Aanmelden",
    seo_description: "",
    seo_title: "Nieuwe SEO-titel",
    status: "unexpected",
    theme: "unknown",
    title: "<script>alert(1)</script>"
  }, fallback);

  assert.equal(normalized.eyebrow, "Nieuwe bovenregel");
  assert.equal(normalized.intro.length, 600);
  assert.equal(normalized.primaryCtaHref, fallback.primaryCtaHref);
  assert.equal(normalized.secondaryCtaHref, "/intake");
  assert.equal(normalized.seoDescription, fallback.seoDescription);
  assert.equal(normalized.status, "published");
  assert.equal(normalized.theme, fallback.theme);
  assert.equal(normalized.title, "<script>alert(1)</script>");
});

test("version snapshots normalize controlled sections and reject unsafe structure", () => {
  const fallback = getDefaultTenantSitePages("De Waterlijn").home;
  const validId = "8a4c764c-476d-4933-99bc-3446c05fa4af";
  const normalized = normalizeTenantSiteSnapshot({
    page: {
      ...fallback,
      heroAssetId: validId,
      primaryCtaHref: "/intake"
    },
    sections: [{
      id: validId,
      type: "faq",
      title: "Veelgestelde vragen",
      intro: "Praktische antwoorden.",
      style: "cards",
      visible: true,
      assetIds: [],
      items: [{
        id: validId,
        title: "Wanneer kan mijn kind starten?",
        text: "Na een passende intake.",
        ctaLabel: "Onveilig",
        ctaHref: "https://outside.example"
      }]
    }, {
      id: validId,
      type: "custom_html",
      title: "Onveilig",
      items: []
    }]
  }, fallback);

  assert.equal(normalized.heroAssetId, validId);
  assert.equal(normalized.sections.length, 1);
  assert.equal(normalized.sections[0].type, "faq");
  assert.equal(normalized.sections[0].items[0].ctaHref, null);
});
