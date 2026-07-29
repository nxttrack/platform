import { ArrowRight, Clock, ListChecks, Waves } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TenantSiteHeroMedia, TenantSiteSections } from "@/components/public/tenant-site-sections";
import { WaitTimeChip } from "@/components/public/wait-time-chip";
import { getPublicTenantSiteData, getTenantSlugFromRequest } from "@/lib/domain/public-site";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPublicTenantSiteData();
  const page = data?.pages.programs;
  return page ? { description: page.seoDescription, title: page.seoTitle } : {};
}

export default async function ProgramsPage() {
  const [data, slug] = await Promise.all([getPublicTenantSiteData(), getTenantSlugFromRequest()]);

  if (!slug || !data) {
    return <Unavailable />;
  }
  const page = data.pages.programs;
  if (page.status === "hidden") {
    return <Unavailable hidden />;
  }

  return (
    <main>
      <section className={`relative overflow-hidden px-4 py-12 ${themeClass(page.theme)}`}>
        <TenantSiteHeroMedia assetId={page.heroAssetId} />
        <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{page.eyebrow}</p>
            <h1 className="mt-2 text-4xl font-bold text-foreground md:text-5xl">{page.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{page.intro}</p>
          </div>
          {page.primaryCtaHref && page.primaryCtaLabel ? <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" href={page.primaryCtaHref}>{page.primaryCtaLabel}<ArrowRight className="size-4" /></Link> : null}
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-3">
          {data.programs.map((program) => (
            <article className="flex min-h-[320px] flex-col rounded-xl border border-border bg-card p-5 shadow-soft" key={program.id}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{program.stages.length} badje(s)</span>
                <WaitTimeChip band={program.waitBand} />
              </div>
              <h2 className="text-2xl font-bold text-foreground">{program.name}</h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">{program.description ?? "Een heldere zwemlesroute met stages, lesgroepen en beschikbare capaciteit."}</p>
              <div className="mt-5 space-y-2">
                {program.stages.slice(0, 4).map((stage) => (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" key={stage.id}>
                    <Waves className="h-4 w-4 text-primary" />
                    <span>{stage.badge_label ?? stage.name}</span>
                  </div>
                ))}
              </div>
              <Link className="mt-6 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground" href={`/intake?programma=${program.id}`}>
                Aanmelden <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>

        {data.programs.length === 0 ? (
          <div className="mx-auto max-w-2xl rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">Deze zwemschool heeft nog geen actieve programma's gepubliceerd.</div>
        ) : null}
      </section>

      <section className="px-4 pb-12">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          <InfoCard icon={<ListChecks className="h-5 w-5" />} title="Inschrijven of wachtlijst" text="Als er geen directe plek is, komt de aanmelding binnen als wachtlijstvraag." />
          <InfoCard icon={<Clock className="h-5 w-5" />} title="Proefles" text="Vraag een proefles aan zonder dubbele route of apart formulier." />
          <InfoCard icon={<Waves className="h-5 w-5" />} title="Programma gekoppeld" text="De intake komt direct binnen bij het gekozen programma." />
        </div>
      </section>
      <TenantSiteSections page={page} programs={data.programs} />
    </main>
  );
}

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="rounded-xl border border-border bg-card p-5 shadow-soft">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="font-bold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </article>
  );
}

function Unavailable({ hidden = false }: { hidden?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <h1 className="text-2xl font-bold text-foreground">Programma&apos;s niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">{hidden ? "Deze pagina is tijdelijk verborgen door de zwemschool." : "Open deze pagina via een tenant-subdomain."}</p>
      </section>
    </main>
  );
}

function themeClass(theme: string) {
  if (theme === "navy") return "bg-gradient-to-br from-slate-950 to-blue-950 [&_.text-foreground]:text-white [&_.text-muted-foreground]:text-white/70";
  if (theme === "water") return "bg-gradient-to-br from-aqua-soft via-white to-primary/10";
  return "bg-card";
}
