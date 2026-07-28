export const tenantSitePageKeys = ["home", "programs", "agenda", "news"] as const;
export const tenantSiteThemes = ["water", "calm", "navy"] as const;
export const tenantSiteSectionTypes = ["programs", "usp_cards", "instructor_team", "locations", "faq", "reviews", "news", "trial_cta", "gallery"] as const;

export type TenantSitePageKey = (typeof tenantSitePageKeys)[number];
export type TenantSiteTheme = (typeof tenantSiteThemes)[number];
export type TenantSiteSectionType = (typeof tenantSiteSectionTypes)[number];

export type TenantSiteSectionItem = {
  id: string;
  title: string;
  text: string;
  subtitle: string | null;
  assetId: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
};

export type TenantSiteSection = {
  id: string;
  type: TenantSiteSectionType;
  title: string;
  intro: string | null;
  style: "cards" | "editorial" | "compact" | "split";
  visible: boolean;
  items: TenantSiteSectionItem[];
  assetIds: string[];
};

export type TenantSitePageContent = {
  eyebrow: string;
  heroAssetId: string | null;
  intro: string;
  pageKey: TenantSitePageKey;
  primaryCtaHref: string | null;
  primaryCtaLabel: string | null;
  secondaryCtaHref: string | null;
  secondaryCtaLabel: string | null;
  seoDescription: string;
  seoTitle: string;
  status: "hidden" | "published";
  theme: TenantSiteTheme;
  title: string;
  sections: TenantSiteSection[];
};

export function getDefaultTenantSitePages(tenantName: string): Record<TenantSitePageKey, TenantSitePageContent> {
  return {
    home: {
      eyebrow: "Persoonlijke zwemontwikkeling",
      heroAssetId: null,
      intro: "Ontdek het programma dat bij je kind past. Van eerste kennismaking tot diploma, met heldere lessen en zichtbare voortgang.",
      pageKey: "home",
      primaryCtaHref: "/programmas",
      primaryCtaLabel: "Programma’s bekijken",
      secondaryCtaHref: "/intake",
      secondaryCtaLabel: "Proefles of intake",
      seoDescription: `Zwemlessen, programma’s en aanmelden bij ${tenantName}.`,
      seoTitle: `${tenantName} · zwemlessen met vertrouwen`,
      status: "published",
      theme: "water",
      title: "Met vertrouwen naar de volgende zwemstap.",
      sections: []
    },
    programs: {
      eyebrow: tenantName,
      heroAssetId: null,
      intro: "Bekijk beschikbare zwemprogramma’s en kies direct de route die bij je kind past.",
      pageKey: "programs",
      primaryCtaHref: "/intake",
      primaryCtaLabel: "Aanmelden",
      secondaryCtaHref: null,
      secondaryCtaLabel: null,
      seoDescription: `Bekijk de zwemprogramma’s en actuele wachttijden van ${tenantName}.`,
      seoTitle: `Programma’s · ${tenantName}`,
      status: "published",
      theme: "calm",
      title: "Programma’s",
      sections: []
    },
    agenda: {
      eyebrow: "Agenda",
      heroAssetId: null,
      intro: "Bekijk belangrijke lesmomenten, activiteiten en updates van deze zwemschool.",
      pageKey: "agenda",
      primaryCtaHref: "/",
      primaryCtaLabel: "Home",
      secondaryCtaHref: "/intake",
      secondaryCtaLabel: "Aanmelden",
      seoDescription: `Belangrijke momenten en activiteiten van ${tenantName}.`,
      seoTitle: `Agenda · ${tenantName}`,
      status: "published",
      theme: "calm",
      title: "Planning en momenten",
      sections: []
    },
    news: {
      eyebrow: "Nieuws",
      heroAssetId: null,
      intro: "Berichten, praktische informatie en aankondigingen voor ouders en leerlingen.",
      pageKey: "news",
      primaryCtaHref: "/",
      primaryCtaLabel: "Home",
      secondaryCtaHref: "/intake",
      secondaryCtaLabel: "Aanmelden",
      seoDescription: `Nieuws en praktische updates van ${tenantName}.`,
      seoTitle: `Nieuws · ${tenantName}`,
      status: "published",
      theme: "water",
      title: "Updates van de zwemschool",
      sections: []
    }
  };
}

export function isSafeTenantSiteHref(value: string) {
  return /^\/(?!\/)[A-Za-z0-9_?&=%./-]*$/.test(value);
}

export function normalizeTenantSitePage(
  row: Record<string, unknown> | null | undefined,
  fallback: TenantSitePageContent
): TenantSitePageContent {
  if (!row) return fallback;
  return {
    eyebrow: text(row.eyebrow, fallback.eyebrow, 80),
    heroAssetId: uuidOrNull(row.hero_asset_id) ?? fallback.heroAssetId,
    intro: text(row.intro, fallback.intro, 600),
    pageKey: fallback.pageKey,
    primaryCtaHref: href(row.primary_cta_href, fallback.primaryCtaHref),
    primaryCtaLabel: optionalText(row.primary_cta_label, 80),
    secondaryCtaHref: href(row.secondary_cta_href, fallback.secondaryCtaHref),
    secondaryCtaLabel: optionalText(row.secondary_cta_label, 80),
    seoDescription: text(row.seo_description, fallback.seoDescription, 180),
    seoTitle: text(row.seo_title, fallback.seoTitle, 70),
    status: row.status === "hidden" ? "hidden" : "published",
    theme: tenantSiteThemes.includes(row.theme as TenantSiteTheme) ? row.theme as TenantSiteTheme : fallback.theme,
    title: text(row.title, fallback.title, 140),
    sections: normalizeTenantSiteSections(row.sections ?? fallback.sections)
  };
}

export function normalizeTenantSiteSnapshot(value: unknown, fallback: TenantSitePageContent): TenantSitePageContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const snapshot = value as Record<string, unknown>;
  const page = snapshot.page && typeof snapshot.page === "object" && !Array.isArray(snapshot.page)
    ? snapshot.page as Record<string, unknown>
    : {};
  return normalizeTenantSitePage({
    ...page,
    hero_asset_id: page.heroAssetId ?? page.hero_asset_id,
    primary_cta_href: page.primaryCtaHref ?? page.primary_cta_href,
    primary_cta_label: page.primaryCtaLabel ?? page.primary_cta_label,
    secondary_cta_href: page.secondaryCtaHref ?? page.secondary_cta_href,
    secondary_cta_label: page.secondaryCtaLabel ?? page.secondary_cta_label,
    seo_description: page.seoDescription ?? page.seo_description,
    seo_title: page.seoTitle ?? page.seo_title,
    sections: snapshot.sections
  }, fallback);
}

export function normalizeTenantSiteSections(value: unknown): TenantSiteSection[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).flatMap((raw): TenantSiteSection[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const section = raw as Record<string, unknown>;
    const type = tenantSiteSectionTypes.includes(section.type as TenantSiteSectionType) ? section.type as TenantSiteSectionType : null;
    const id = uuidOrNull(section.id);
    if (!type || !id) return [];
    return [{
      id,
      type,
      title: text(section.title, sectionLabel(type), 120),
      intro: optionalText(section.intro, 500),
      style: ["cards", "editorial", "compact", "split"].includes(String(section.style)) ? section.style as TenantSiteSection["style"] : "cards",
      visible: section.visible !== false,
      items: normalizeItems(section.items),
      assetIds: Array.isArray(section.assetIds) ? section.assetIds.map(uuidOrNull).filter((item): item is string => !!item).slice(0, 12) : []
    }];
  });
}

export function createTenantSiteSnapshot(page: TenantSitePageContent) {
  return {
    schemaVersion: 2,
    page: {
      eyebrow: page.eyebrow,
      heroAssetId: page.heroAssetId,
      intro: page.intro,
      pageKey: page.pageKey,
      primaryCtaHref: page.primaryCtaHref,
      primaryCtaLabel: page.primaryCtaLabel,
      secondaryCtaHref: page.secondaryCtaHref,
      secondaryCtaLabel: page.secondaryCtaLabel,
      seoDescription: page.seoDescription,
      seoTitle: page.seoTitle,
      status: page.status,
      theme: page.theme,
      title: page.title
    },
    sections: page.sections
  };
}

function href(value: unknown, fallback: string | null) {
  return typeof value === "string" && isSafeTenantSiteHref(value) ? value : fallback;
}

function optionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : null;
}

function text(value: unknown, fallback: string, maxLength: number) {
  return optionalText(value, maxLength) ?? fallback;
}

function normalizeItems(value: unknown): TenantSiteSectionItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((raw): TenantSiteSectionItem[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const id = uuidOrNull(item.id);
    const title = optionalText(item.title, 120);
    if (!id || !title) return [];
    const ctaHref = optionalText(item.ctaHref, 160);
    return [{
      id,
      title,
      text: optionalText(item.text, 700) ?? "",
      subtitle: optionalText(item.subtitle, 120),
      assetId: uuidOrNull(item.assetId),
      ctaLabel: optionalText(item.ctaLabel, 80),
      ctaHref: ctaHref && isSafeTenantSiteHref(ctaHref) ? ctaHref : null
    }];
  });
}

function uuidOrNull(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function sectionLabel(type: TenantSiteSectionType) {
  return ({
    programs: "Programma’s",
    usp_cards: "Waarom kiezen voor ons",
    instructor_team: "Ons instructeursteam",
    locations: "Locaties",
    faq: "Veelgestelde vragen",
    reviews: "Ervaringen",
    news: "Laatste nieuws",
    trial_cta: "Klaar voor een proefles?",
    gallery: "Galerij"
  } satisfies Record<TenantSiteSectionType, string>)[type];
}
