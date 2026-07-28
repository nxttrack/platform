import type { Metadata } from "next";
import { PageHero } from "@/components/lovable/page-kit";
import { getPublicTenantSiteData } from "@/lib/domain/public-site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = (await getPublicTenantSiteData())?.pages.agenda;
  return page ? { description: page.seoDescription, title: page.seoTitle } : {};
}

export default async function AgendaPage() {
  const data = await getPublicTenantSiteData();
  const page = data?.pages.agenda;
  if (!page || page.status === "hidden") return <Unavailable />;
  return <PageHero className={themeClass(page.theme)} kicker={page.eyebrow} title={page.title} sub={page.intro} primary={{ href: page.primaryCtaHref ?? "/", label: page.primaryCtaLabel ?? "Home" }} secondary={page.secondaryCtaHref && page.secondaryCtaLabel ? { href: page.secondaryCtaHref, label: page.secondaryCtaLabel } : undefined} />;
}

function Unavailable() {
  return <main className="grid min-h-[55vh] place-items-center px-4"><p className="rounded-xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">Deze agendapagina is momenteel niet gepubliceerd.</p></main>;
}

function themeClass(theme: string) {
  if (theme === "navy") return "from-slate-950 to-blue-950 [&_h1]:text-white [&_p]:text-white/70";
  if (theme === "water") return "from-aqua-soft via-white to-primary/10";
  return "";
}
