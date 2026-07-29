import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  MapPin,
  MessageCircleHeart,
  Quote,
  Sparkles,
  Waves
} from "lucide-react";
import Link from "next/link";

import { WaitTimeChip } from "@/components/public/wait-time-chip";
import type { PublicProgram } from "@/lib/domain/public-site";
import type { TenantSitePageContent, TenantSiteSection, TenantSiteSectionItem } from "@/lib/domain/site-page-contract";
import { cn } from "@/lib/utils";

export function TenantSiteHeroMedia({ assetId, alt = "" }: { assetId: string | null; alt?: string }) {
  if (!assetId) return null;
  return (
    <>
      <img
        alt={alt}
        className="absolute inset-0 size-full object-cover"
        src={publicAssetUrl(assetId)}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/25" />
    </>
  );
}

export function TenantSiteSections({
  page,
  programs = []
}: {
  page: TenantSitePageContent;
  programs?: PublicProgram[];
}) {
  const sections = page.sections.filter((section) => section.visible);
  if (!sections.length) return null;
  return (
    <div className="border-t border-border bg-background">
      {sections.map((section, index) => (
        <TenantSiteSectionBlock
          alternate={index % 2 === 1}
          key={section.id}
          programs={programs}
          section={section}
        />
      ))}
    </div>
  );
}

function TenantSiteSectionBlock({
  alternate,
  programs,
  section
}: {
  alternate: boolean;
  programs: PublicProgram[];
  section: TenantSiteSection;
}) {
  if (section.type === "trial_cta") {
    const item = section.items[0];
    return (
      <section className="px-4 py-10 md:py-14">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-gradient-to-br from-primary via-blue-700 to-navy px-6 py-10 text-white shadow-card md:px-10">
          <div aria-hidden="true" className="absolute -right-10 -top-16 size-60 rounded-full bg-aqua/20 blur-3xl" />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">Persoonlijke volgende stap</p>
            <h2 className="mt-3 text-3xl font-bold">{section.title}</h2>
            {section.intro || item?.text ? <p className="mt-3 leading-7 text-white/80">{section.intro ?? item?.text}</p> : null}
            {item?.ctaHref && item.ctaLabel ? <Link className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-primary shadow-soft" href={item.ctaHref}>{item.ctaLabel}<ArrowRight className="size-4" /></Link> : null}
          </div>
        </div>
      </section>
    );
  }

  if (section.type === "faq") {
    return (
      <SectionShell alternate={alternate} section={section}>
        <div className="mx-auto grid max-w-3xl gap-3">
          {section.items.map((item) => (
            <details className="group rounded-2xl border border-border bg-card p-5 shadow-soft" key={item.id}>
              <summary className="cursor-pointer list-none pr-8 font-bold text-foreground marker:hidden">{item.title}</summary>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
            </details>
          ))}
        </div>
      </SectionShell>
    );
  }

  if (section.type === "gallery") {
    const assetIds = [...new Set([...section.assetIds, ...section.items.flatMap((item) => item.assetId ? [item.assetId] : [])])];
    return (
      <SectionShell alternate={alternate} section={section}>
        <div className="grid auto-rows-[180px] grid-cols-2 gap-3 md:grid-cols-4">
          {assetIds.map((assetId, index) => (
            <figure className={cn("overflow-hidden rounded-2xl border border-white/70 bg-card shadow-soft", index === 0 && "col-span-2 row-span-2")} key={assetId}>
              <img alt={section.items.find((item) => item.assetId === assetId)?.title ?? section.title} className="size-full object-cover transition duration-500 hover:scale-[1.03]" src={publicAssetUrl(assetId)} />
            </figure>
          ))}
        </div>
      </SectionShell>
    );
  }

  const effectiveItems = section.type === "programs"
    ? programs.slice(0, 6).map((program): TenantSiteSectionItem => ({
        id: program.id,
        title: program.name,
        subtitle: `${program.stages.length} niveaus`,
        text: program.description ?? "Een duidelijke zwemroute met persoonlijke begeleiding en zichtbare voortgang.",
        assetId: null,
        ctaLabel: "Bekijk mogelijkheden",
        ctaHref: `/intake?programma=${program.id}`
      }))
    : section.items;

  return (
    <SectionShell alternate={alternate} section={section}>
      <div className={cn(
        "grid gap-4",
        section.style === "compact" ? "md:grid-cols-2" : section.style === "split" ? "lg:grid-cols-2" : "md:grid-cols-2 lg:grid-cols-3"
      )}>
        {effectiveItems.map((item) => (
          <ContentCard item={item} key={item.id} sectionType={section.type} waitBand={section.type === "programs" ? programs.find((program) => program.id === item.id)?.waitBand : undefined} />
        ))}
      </div>
    </SectionShell>
  );
}

function SectionShell({
  alternate,
  children,
  section
}: {
  alternate: boolean;
  children: React.ReactNode;
  section: TenantSiteSection;
}) {
  return (
    <section className={cn("px-4 py-12 md:py-16", alternate && "bg-card/60")}>
      <div className="mx-auto max-w-6xl">
        <header className="mx-auto mb-7 max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{sectionKicker(section.type)}</p>
          <h2 className="mt-2 text-3xl font-bold text-foreground md:text-4xl">{section.title}</h2>
          {section.intro ? <p className="mt-3 text-sm leading-7 text-muted-foreground md:text-base">{section.intro}</p> : null}
        </header>
        {children}
      </div>
    </section>
  );
}

function ContentCard({
  item,
  sectionType,
  waitBand
}: {
  item: TenantSiteSectionItem;
  sectionType: TenantSiteSection["type"];
  waitBand?: PublicProgram["waitBand"];
}) {
  const Icon = sectionIcon(sectionType);
  return (
    <article className="group overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card">
      {item.assetId ? <img alt={item.title} className="aspect-[16/9] w-full object-cover" src={publicAssetUrl(item.assetId)} /> : null}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
          {waitBand ? <WaitTimeChip band={waitBand} /> : null}
        </div>
        {item.subtitle ? <p className="mt-4 text-xs font-bold uppercase tracking-wider text-primary">{item.subtitle}</p> : null}
        <h3 className={cn("text-xl font-bold text-foreground", item.subtitle ? "mt-1" : "mt-4")}>{item.title}</h3>
        {item.text ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p> : null}
        {item.ctaHref && item.ctaLabel ? <Link className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-primary" href={item.ctaHref}>{item.ctaLabel}<ArrowRight className="size-4 transition group-hover:translate-x-0.5" /></Link> : null}
      </div>
    </article>
  );
}

function publicAssetUrl(assetId: string) {
  return `/api/files/tenant-media-asset/${assetId}?public=1`;
}

function sectionKicker(type: TenantSiteSection["type"]) {
  return ({
    programs: "Zwemroutes",
    usp_cards: "Waarom deze zwemschool",
    instructor_team: "Persoonlijke begeleiding",
    locations: "Dichtbij en vertrouwd",
    faq: "Goed om te weten",
    reviews: "Ervaringen",
    news: "Actueel",
    trial_cta: "Proefles",
    gallery: "Sfeerimpressie"
  } satisfies Record<TenantSiteSection["type"], string>)[type];
}

function sectionIcon(type: TenantSiteSection["type"]) {
  return ({
    programs: Waves,
    usp_cards: CheckCircle2,
    instructor_team: GraduationCap,
    locations: MapPin,
    faq: MessageCircleHeart,
    reviews: Quote,
    news: CalendarDays,
    trial_cta: Sparkles,
    gallery: Sparkles
  } satisfies Record<TenantSiteSection["type"], typeof Waves>)[type];
}
