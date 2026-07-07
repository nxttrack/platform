import { ArrowRight, Layers, ShieldCheck, Waves } from "lucide-react";
import Link from "next/link";
import { FeatureGrid, FinalCTA, PageHero, PageSection } from "@/components/lovable/page-kit";
import { getPublicTenantSiteData, getTenantSlugFromRequest } from "@/lib/domain/public-site";

const items = [
  {
    icon: Waves,
    title: "Swim-first basis",
    description: "Routegroepen en shells staan klaar voor tenant public, portaal, instructor en tenant admin."
  },
  {
    icon: Layers,
    title: "Lovable behouden",
    description: "Tokens, radius, kleuren en shell-ritme zijn voorbereid op de Lovable UI-port."
  },
  {
    icon: ShieldCheck,
    title: "Nog geen productdata",
    description: "Auth, Supabase, betalingen en echte tenantdata starten pas in latere fases."
  }
];

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [tenantData, tenantSlug] = await Promise.all([getPublicTenantSiteData(), getTenantSlugFromRequest()]);

  if (tenantSlug) {
    if (!tenantData) {
      return <TenantUnavailable slug={tenantSlug} />;
    }

    return <TenantHome data={tenantData} />;
  }

  return (
    <main>
      <PageHero
        kicker="Phase 2 scaffold"
        title="NXTTRACK platform foundation"
        sub="Een minimale Next.js basis voor staging-validatie, route-skeletons en Lovable-tokenconsolidatie."
        primary={{ href: "/nxttrack", label: "Bekijk marketing skeleton" }}
        secondary={{ href: "/admin", label: "Open admin shell" }}
      />
      <PageSection kicker="Scope" title="Wat deze fase wel en niet doet">
        <FeatureGrid items={items} />
        <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Health endpoint</p>
              <p className="text-sm text-muted-foreground">Beschikbaar voor staging smoke checks.</p>
            </div>
            <Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow" href="/api/health">
              /api/health <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </PageSection>
      <FinalCTA />
    </main>
  );
}

function TenantHome({ data }: { data: NonNullable<Awaited<ReturnType<typeof getPublicTenantSiteData>>> }) {
  const availablePrograms = data.programs.filter((program) => program.capacityStatus === "available").length;

  return (
    <main>
      <section className="relative overflow-hidden bg-gradient-to-br from-navy via-primary to-aqua px-4 py-16 text-white md:py-24">
        <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-white/75">{data.tenant.name}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">Zwemles plannen begint met een helder programma.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/85">Bekijk de beschikbare lesprogramma's en meld je kind aan voor inschrijving, proefles, wachtlijst of een informatieaanvraag.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-primary shadow-glow" href="/programmas">
                Programma's bekijken
              </Link>
              <Link className="rounded-lg border border-white/40 px-5 py-3 text-sm font-semibold text-white" href="/intake">
                Aanmelden
              </Link>
            </div>
          </div>
          <div className="rounded-xl border border-white/25 bg-white/10 p-5 backdrop-blur">
            <p className="text-sm font-semibold text-white/80">Vandaag zichtbaar</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Programma's" value={data.programs.length} />
              <Metric label="Met plek" value={availablePrograms} />
            </div>
            <div className="mt-5 space-y-2">
              {data.programs.slice(0, 3).map((program) => (
                <Link className="block rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20" href={`/intake?programma=${program.id}`} key={program.id}>
                  {program.name}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Programma's</p>
              <h2 className="mt-2 text-3xl font-bold text-foreground">Kies de route die past</h2>
            </div>
            <Link className="text-sm font-semibold text-primary hover:underline" href="/programmas">
              Alle programma's
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {data.programs.slice(0, 3).map((program) => (
              <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={program.id}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{program.stages.length} badje(s)</p>
                <h3 className="mt-2 text-xl font-bold text-foreground">{program.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{program.description ?? "Programma voor zwemontwikkeling met duidelijke groepsplanning."}</p>
                <p className="mt-4 text-sm font-semibold text-primary">{program.availablePlaces > 0 ? `${program.availablePlaces} plek(ken) beschikbaar` : "Wachtlijst mogelijk"}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function TenantUnavailable({ slug }: { slug: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{slug}</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Tenant site niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Deze tenant is nog niet actief of de publieke data is nog niet verbonden.</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/10 p-3">
      <p className="text-xs text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
