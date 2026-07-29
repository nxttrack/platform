import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";

export const dynamic = "force-dynamic";

export default async function PlatformBadgeThemesPage() {
  const data = await getPlatformBadgeData();
  return <div className="space-y-6">
    <PageHeader kicker="Badge Studio" title="Badge-thema’s" subtitle="Beheer visuele families. Een thema verandert uitstraling en copy, nooit de trigger of betekenis van een badge." />
    <BadgeSectionNav active="/platform/badges/themes" scope="platform" />
    <div className="grid gap-5 lg:grid-cols-2">
      {data.themes.map((theme) => {
        const palette = theme.palette_json as Record<string, string>;
        return <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-card" key={theme.id}><div className="h-32 p-5" style={{ background: `linear-gradient(135deg, ${palette.primary ?? "#0877D1"}, ${palette.secondary ?? "#12B8A6"})` }}><div className="grid size-20 place-items-center rounded-full border-4 border-white/80 bg-white/20 text-4xl text-white shadow-glow">★</div></div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{theme.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{theme.description}</p></div>{theme.is_default ? <StatusPill tone="info">Default</StatusPill> : null}</div><div className="mt-4 flex gap-2">{Object.entries(palette).slice(0, 5).map(([key, color]) => <span aria-label={`${key}: ${color}`} className="size-9 rounded-full border-2 border-white shadow-soft" key={key} style={{ backgroundColor: color }} />)}</div></div></article>;
      })}
    </div>
  </div>;
}

