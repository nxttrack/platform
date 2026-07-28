export const tenantSitePageKeys = ["home", "programs", "agenda", "news"] as const;
export const tenantSiteThemes = ["water", "calm", "navy"] as const;

export type TenantSitePageKey = (typeof tenantSitePageKeys)[number];
export type TenantSiteTheme = (typeof tenantSiteThemes)[number];

export type TenantSitePageContent = {
  eyebrow: string;
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
};

export function getDefaultTenantSitePages(tenantName: string): Record<TenantSitePageKey, TenantSitePageContent> {
  return {
    home: {
      eyebrow: "Persoonlijke zwemontwikkeling",
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
      title: "Met vertrouwen naar de volgende zwemstap."
    },
    programs: {
      eyebrow: tenantName,
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
      title: "Programma’s"
    },
    agenda: {
      eyebrow: "Agenda",
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
      title: "Planning en momenten"
    },
    news: {
      eyebrow: "Nieuws",
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
      title: "Updates van de zwemschool"
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
    title: text(row.title, fallback.title, 140)
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
