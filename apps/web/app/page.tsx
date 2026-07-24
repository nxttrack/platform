import { ArrowRight, CalendarCheck, CheckCircle2, HeartHandshake, Layers, ShieldCheck, Sparkles, Waves } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { FeatureGrid, FinalCTA, PageHero, PageSection } from "@/components/lovable/page-kit";
import { WaitTimeChip } from "@/components/public/wait-time-chip";
import { TenantPublicShell } from "@/components/tenant-public/site-shell";
import { getPublicTenantSiteData, getTenantSlugFromRequest } from "@/lib/domain/public-site";

const items = [
  {
    icon: Waves,
    title: "Zwemschoolworkflow",
    description: "Publieke site, intake, plaatsing, portaal, instructeurs en backoffice sluiten op elkaar aan."
  },
  {
    icon: Layers,
    title: "Eén herkenbare ervaring",
    description: "Van eerste aanmelding tot diploma werkt iedereen in dezelfde heldere productervaring."
  },
  {
    icon: ShieldCheck,
    title: "Veilig vanaf de basis",
    description: "Duidelijke rollen, afgeschermde gegevens en controleerbare processen beschermen iedere organisatie."
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
        kicker="Platform voor zwemscholen"
        title="NXTTRACK platform"
        sub="Eén omgeving voor de volledige zwemschoolreis: van publieke intake en planning tot ouderportaal, instructeurs en zichtbare voortgang."
        primary={{ href: "/nxttrack", label: "Bekijk NXTTRACK" }}
        secondary={{ href: "/admin", label: "Open backoffice" }}
      />
      <PageSection kicker="Samenhang" title="Alles rondom de zwemles verbonden">
        <FeatureGrid items={items} />
        <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Platformstatus</p>
              <p className="text-sm text-muted-foreground">Bekijk de actuele beschikbaarheid van deze omgeving.</p>
            </div>
            <Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow" href="/api/health">
              /api/health <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </PageSection>
      <FinalCTA variant="marketing" />
    </main>
  );
}

function TenantHome({ data }: { data: NonNullable<Awaited<ReturnType<typeof getPublicTenantSiteData>>> }) {
  const shortWaitPrograms = data.programs.filter((program) => program.waitBand === "short").length;

  return (
    <TenantPublicShell tenantName={data.tenant.name}>
      <main>
      <section className="relative overflow-hidden px-4 py-14 md:py-20">
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-aqua-soft via-background to-primary/10" />
        <div aria-hidden="true" className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-aqua/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-soft">
              <Sparkles className="h-3.5 w-3.5" /> Persoonlijke zwemontwikkeling
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.05] text-foreground md:text-6xl">Met vertrouwen naar de volgende zwemstap.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">Ontdek het programma dat bij je kind past. Van eerste kennismaking tot diploma, met heldere lessen en zichtbare voortgang.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow" href="/programmas">
                Programma's bekijken
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link className="rounded-xl border border-border bg-card px-5 py-3 text-sm font-semibold text-foreground shadow-soft" href="/intake">
                Proefles of intake
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Duidelijk programma</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Online voortgang</span>
              <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" /> Persoonlijke begeleiding</span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-3xl border border-white/80 bg-card/85 p-5 shadow-card backdrop-blur md:p-6">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-aqua via-primary to-navy" />
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Vind jouw route</p>
                <p className="mt-1 font-display text-xl font-bold text-foreground">Programma's met actuele wachttijd</p>
              </div>
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Waves className="h-5 w-5" /></span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric label="Programma's" value={data.programs.length} />
              <Metric label="Korte wachttijd" value={shortWaitPrograms} />
            </div>
            <div className="mt-5 grid gap-2">
              {data.programs.slice(0, 3).map((program) => (
                <Link className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-background/80 px-3 py-3 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5" href={`/intake?programma=${program.id}`} key={program.id}>
                  <span>{program.name}</span>
                  <span className="inline-flex items-center gap-2"><WaitTimeChip band={program.waitBand} /><ArrowRight className="h-3.5 w-3.5 text-primary transition group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/70 px-4 py-7">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          <JourneyStep icon={<HeartHandshake className="h-5 w-5" />} number="01" title="Kennismaken" text="Kies een programma en vertel waar je kind nu staat." />
          <JourneyStep icon={<CalendarCheck className="h-5 w-5" />} number="02" title="Passende les" text="We koppelen niveau, voorkeur en beschikbare planning." />
          <JourneyStep icon={<Sparkles className="h-5 w-5" />} number="03" title="Groeien" text="Volg lessen, vaardigheden, badges en diploma's online." />
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
              <article className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-card" key={program.id}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{program.stages.length} badje(s)</p>
                <h3 className="mt-2 text-xl font-bold text-foreground">{program.name}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{program.description ?? "Programma voor zwemontwikkeling met duidelijke groepsplanning."}</p>
                <WaitTimeChip band={program.waitBand} className="mt-4" />
                <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground" href={`/intake?programma=${program.id}`}>Bekijk en meld aan <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></Link>
              </article>
            ))}
            {data.programs.length < 2 ? (
              <article className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 to-aqua-soft p-5 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Keuzehulp</p>
                <h3 className="mt-2 text-xl font-bold text-foreground">Nog niet zeker welke route past?</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Vertel ons over zwemervaring, leeftijd en voorkeursmoment. De zwemschool helpt je naar de juiste start.</p>
                <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary" href="/intake">Start de keuzehulp <ArrowRight className="h-4 w-4" /></Link>
              </article>
            ) : null}
            {data.programs.length < 3 ? (
              <article className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Flexibele instroom</p>
                <h3 className="mt-2 text-xl font-bold text-foreground">Geen directe plek?</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Ook dan kun je aanmelden. Je voorkeuren gaan mee naar de wachtlijst en plaatsingsassistent.</p>
                <Link className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-foreground" href="/intake">Bekijk de mogelijkheden <ArrowRight className="h-4 w-4" /></Link>
              </article>
            ) : null}
          </div>
        </div>
      </section>
      </main>
    </TenantPublicShell>
  );
}

function TenantUnavailable({ slug }: { slug: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">{slug}</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Organisatiesite niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Deze organisatie is nog niet actief of de publieke data is nog niet verbonden.</p>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background/80 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function JourneyStep({ icon, number, title, text }: { icon: ReactNode; number: string; title: string; text: string }) {
  return (
    <article className="flex gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Stap {number}</p>
        <h2 className="mt-1 text-base font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{text}</p>
      </div>
    </article>
  );
}
