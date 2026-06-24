import { ArrowRight, Award, CalendarCheck, CheckCircle2, Clock, GraduationCap, MessageSquare, ShieldCheck, Sparkles, UserCheck, Users, Waves } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { submitIntakeAction } from "@/lib/public-site/intake-actions";
import type { PublicProgram, PublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

type PublicPageProps = {
  snapshot: PublicTenantSiteSnapshot;
};

type IntakePageProps = PublicPageProps & {
  submitted?: boolean;
};

const intakeOptionLabels: Record<string, string> = {
  trial: "Proefles",
  registration: "Inschrijven",
  waitlist: "Wachtlijst"
};

const preferredDays = [
  { label: "Maandag", value: "monday" },
  { label: "Dinsdag", value: "tuesday" },
  { label: "Woensdag", value: "wednesday" },
  { label: "Donderdag", value: "thursday" },
  { label: "Vrijdag", value: "friday" },
  { label: "Zaterdag", value: "saturday" },
  { label: "Zondag", value: "sunday" }
];

const preferredTimes = [
  { label: "Ochtend", value: "morning" },
  { label: "Middag", value: "afternoon" },
  { label: "Avond", value: "evening" },
  { label: "Weekend", value: "weekend" }
];

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Veilige omgeving",
    desc: "AVG-proof & veilig volgens de laatste richtlijnen.",
    tone: "text-sky-600 bg-sky-50"
  },
  {
    icon: Award,
    title: "Gecertificeerde instructeurs",
    desc: "Bevoegd, ervaren en volgen jaarlijks bijscholing.",
    tone: "text-blue-700 bg-blue-50"
  },
  {
    icon: UserCheck,
    title: "Ouderinzage",
    desc: "Realtime updates en inzicht in voortgang en prestaties.",
    tone: "text-amber-600 bg-amber-50"
  },
  {
    icon: GraduationCap,
    title: "Diploma kluis",
    desc: "Digitale diploma's en badges veilig bewaard in de kluis.",
    tone: "text-emerald-600 bg-emerald-50"
  }
];

const journeySteps = [
  { title: "Watergewenning", sub: "Wennen & plezier" },
  { title: "Diploma A", sub: "Basisvaardigheden" },
  { title: "Diploma B", sub: "Zelfstandigheid" },
  { title: "Diploma C", sub: "Gevorderd & veilig" }
];

const valueProps = [
  { icon: Waves, title: "Kleine groepen", desc: "Maximale aandacht voor elk kind." },
  { icon: UserCheck, title: "Persoonlijke begeleiding", desc: "Op het tempo en niveau van jouw kind." },
  { icon: ShieldCheck, title: "Moderne baden", desc: "Schone, veilige en kindvriendelijke locaties." },
  { icon: MessageSquare, title: "Heldere communicatie", desc: "We houden ouders altijd op de hoogte." }
];

type MarketingProgram = {
  id: string;
  name: string;
  ageLabel: string;
  description: string;
  slug: string;
  waitlist: "kort" | "gemiddeld" | "lang";
  weeks: number;
};

const waitlistPattern: Array<Pick<MarketingProgram, "waitlist" | "weeks">> = [
  { waitlist: "kort", weeks: 2 },
  { waitlist: "gemiddeld", weeks: 6 },
  { waitlist: "lang", weeks: 10 },
  { waitlist: "kort", weeks: 1 }
];

const fallbackMarketingPrograms: MarketingProgram[] = [
  {
    id: "zwemdiploma-a",
    name: "Zwemdiploma A",
    ageLabel: "5-9 jaar",
    description: "De eerste officiele stap. Drijven, draaien en zwemmen met kleding aan.",
    slug: "zwemdiploma-a",
    waitlist: "kort",
    weeks: 2
  },
  {
    id: "zwemdiploma-b",
    name: "Zwemdiploma B",
    ageLabel: "6-11 jaar",
    description: "Voortbouwen op A met verdieping, langer onderwater en hogere sprongen.",
    slug: "zwemdiploma-b",
    waitlist: "gemiddeld",
    weeks: 6
  },
  {
    id: "zwemdiploma-c",
    name: "Zwemdiploma C",
    ageLabel: "7-12 jaar",
    description: "Het complete diploma. Zwemmen in alle omstandigheden, veilig en zelfstandig.",
    slug: "zwemdiploma-c",
    waitlist: "lang",
    weeks: 10
  },
  {
    id: "proefles-zwemmen",
    name: "Proefles zwemmen",
    ageLabel: "Alle leeftijden",
    description: "Probeer eerst een les voordat je inschrijft. Lekker laagdrempelig kennismaken.",
    slug: "proefles-zwemmen",
    waitlist: "kort",
    weeks: 1
  }
];

export function TenantMarketingPage({ snapshot }: PublicPageProps) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage snapshot={snapshot} />;
  }

  const profile = snapshot.profile ?? fallbackProfile(snapshot.tenant.name);
  const marketingPrograms = toMarketingPrograms(snapshot.programs);
  const tenantName = snapshot.tenant.name;
  const locationLabel = "Den Haag";

  return (
    <PublicShell snapshot={snapshot}>
      <main className="mx-auto max-w-screen-2xl px-4 md:px-8">
        <section className="relative mt-6 flex min-h-[280px] overflow-hidden rounded-3xl border border-border bg-card shadow-card md:mt-8 md:min-h-[320px] lg:min-h-[360px]">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden md:block md:w-[70%] lg:w-[72%]">
            <img alt="Lachend kind met zwembril in zwembad" className="h-full w-full scale-110 object-cover object-right md:scale-[1.15] lg:scale-[1.25]" src="/lovable/hero-swim.png" />
          </div>

          <div className="relative grid flex-1 items-center gap-6 p-5 md:grid-cols-12 md:gap-5 md:p-7 lg:p-8">
            <div className="md:col-span-7 lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {tenantName} - {locationLabel}
              </div>

              <h1 className="mt-3 font-display text-3xl font-bold leading-[1.05] text-navy md:text-4xl lg:text-5xl">
                Zwemles met
                <br />
                vertrouwen bij
                <br />
                <span className="bg-gradient-to-r from-sky-500 to-blue-700 bg-clip-text text-transparent">{tenantName}</span>
              </h1>

              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{profile.heroSubtitle}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-95" href="/intake">
                  Plan intake <ArrowRight className="h-4 w-4" />
                </Link>
                <Link className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted" href="/programmas">
                  Bekijk programma's
                </Link>
                <Link className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted" href="/agenda">
                  Bekijk wachttijden
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap gap-6 text-xs text-muted-foreground">
                <div>
                  <p className="font-display text-xl font-bold text-navy">2.400+</p>
                  Diploma's uitgereikt
                </div>
                <div>
                  <p className="font-display text-xl font-bold text-navy">98%</p>
                  Ouder-tevredenheid
                </div>
                <div>
                  <p className="font-display text-xl font-bold text-navy">12</p>
                  Gecertificeerde instructeurs
                </div>
              </div>
            </div>
          </div>

          <div className="relative -mt-2 block px-5 pb-5 md:hidden">
            <img alt="Kind in zwembad" className="rounded-2xl" src="/lovable/hero-swim.png" />
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item.title} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-sm font-bold text-navy">{item.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Wachtrij & beschikbare plekken</p>
                <h2 className="mt-1 font-display text-xl font-bold text-navy">Actuele wachttijden per programma</h2>
              </div>
              <Link className="hidden text-sm font-semibold text-primary md:block" href="/agenda">
                Bekijk alle wachttijden -&gt;
              </Link>
            </div>

            <div className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {marketingPrograms.slice(0, 4).map((program) => (
                <div key={program.id} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                      <Waves className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy">{program.name}</p>
                      <p className="text-[11px] text-muted-foreground">{program.ageLabel}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${waitlistTone(program.waitlist)}`}>Wachttijd: {program.weeks} {program.weeks === 1 ? "week" : "weken"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Diploma's & badges</p>
            <h2 className="mt-1 font-display text-xl font-bold text-navy">Altijd je diploma's bij de hand</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Geen papier meer kwijt. Elke behaalde mijlpaal wordt veilig en overzichtelijk bewaard in je persoonlijke kluis.</p>
            <div className="mt-6 flex flex-1 items-center justify-center gap-4">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white shadow-glow">
                <span className="font-display text-2xl font-bold">B</span>
              </div>
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-glow">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <Link className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-95" href="/intake">
              Start je zwemreis <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-5">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Nieuws & updates</p>
            <h2 className="mt-1 font-display text-lg font-bold text-navy">Zomervakantie intensieve lessen en versnelde trajecten</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">In de zomervakantie bieden wij extra intensieve lessen aan. Ideaal om een voorsprong te maken voor het nieuwe seizoen.</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <CalendarCheck className="h-4 w-4" /> 15 mei 2025 - Team {tenantName}
            </div>
            <Link className="mt-4 inline-flex text-sm font-semibold text-primary" href="/nieuws">
              Lees meer -&gt;
            </Link>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Onze lesprogramma's</p>
                <h2 className="mt-1 font-display text-lg font-bold text-navy">Van eerste plons tot diploma C</h2>
              </div>
              <Link className="hidden text-sm font-semibold text-primary md:block" href="/programmas">
                Bekijk alle -&gt;
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {marketingPrograms.slice(0, 4).map((program) => (
                <div key={program.id} className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Waves className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-navy">
                      {program.name} <span className="ml-1 text-xs font-normal text-muted-foreground">({program.ageLabel})</span>
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">{program.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-border bg-card p-8 shadow-soft md:p-10">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-primary">De zwemreis van jouw kind</p>
          <h2 className="mt-1 text-center font-display text-2xl font-bold text-navy">Van eerste druppel tot diploma C</h2>

          <div className="relative mt-10">
            <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-sky-300 via-blue-500 to-emerald-500 md:block" />
            <div className="grid gap-6 md:grid-cols-4">
              {journeySteps.map((step, index) => (
                <div key={step.title} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-glow ring-4 ring-card">
                    <span className="font-display text-sm font-bold">{index + 1}</span>
                  </div>
                  <p className="mt-3 font-display text-sm font-bold text-navy">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
          <div className="grid gap-6 md:grid-cols-4">
            {valueProps.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4 mt-10 rounded-3xl gradient-navy p-8 text-white shadow-card md:p-10">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="max-w-xl">
              <h2 className="font-display text-xl font-bold md:text-2xl">{tenantName} {locationLabel}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">De plek waar kinderen leren zwemmen met plezier, vertrouwen en persoonlijke aandacht. Onze software en ouderomgeving worden veilig en betrouwbaar ondersteund door NXTTRACK.</p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 px-6 py-4 ring-1 ring-white/10">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">Platform by</span>
              <img alt="NXTTRACK" className="h-7 w-auto brightness-0 invert" src="/lovable/nxttrack-logo.svg" />
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

export function ProgramOverviewPage({ snapshot }: PublicPageProps) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage snapshot={snapshot} />;
  }

  return (
    <PublicShell snapshot={snapshot}>
      <main>
        <CompactHero kicker={snapshot.tenant.name} title="Programma's" sub="Kies het programma dat past bij de zwemroute. De intake bepaalt daarna instroomtype, voorkeuren en eerste status." />
        <Section>
          <ProgramGrid programs={snapshot.programs} />
        </Section>
      </main>
    </PublicShell>
  );
}

export function ProgramDetailPage({ snapshot }: PublicPageProps) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage snapshot={snapshot} />;
  }

  const program = snapshot.selectedProgram;

  if (!program) {
    return (
      <PublicShell snapshot={snapshot}>
        <main>
          <CompactHero kicker={snapshot.tenant.name} title="Programma niet gevonden" sub="Dit programma is niet gepubliceerd of bestaat niet voor deze tenant." />
          <Section>
            <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
              <p className="text-sm text-muted-foreground">Bekijk het actuele programma-overzicht.</p>
              <div className="mt-5">
                <PrimaryLink href="/programmas">Naar programma's</PrimaryLink>
              </div>
            </div>
          </Section>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell snapshot={snapshot}>
      <main>
        <CompactHero kicker={snapshot.tenant.name} title={program.name} sub={program.detail ?? program.summary ?? program.description ?? "Programmadetails vanuit de tenantdata."} primary={{ href: `/intake?program=${program.slug}`, label: "Start intake" }} />
        <Section>
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-2xl font-bold">Programma</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{program.detail ?? program.summary ?? program.description ?? "Dit programma is gepubliceerd voor intake."}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <DetailPill label="Leeftijd" value={program.ageLabel} />
                <DetailPill label="Duur" value={program.durationLabel} />
                <DetailPill label="Prijs" value={program.priceLabel} />
                <DetailPill label="Capaciteit" value={program.capacityLabel} />
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-2xl font-bold">Intake-opties</h2>
              <div className="mt-5 grid gap-3">
                <OptionStatus enabled={program.trialEnabled} label="Proefles" />
                <OptionStatus enabled={program.registrationEnabled} label="Inschrijven" />
                <OptionStatus enabled={program.waitlistEnabled} label="Wachtlijst" />
              </div>
              <div className="mt-6">
                <PrimaryLink href={`/intake?program=${program.slug}`}>Start intake</PrimaryLink>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="text-2xl font-bold">Stages</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {program.stages.length > 0 ? (
                program.stages.map((stage) => (
                  <div key={stage.id} className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{stage.code}</p>
                    <p className="mt-1 font-semibold">{stage.name}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nog geen gepubliceerde stages gekoppeld.</p>
              )}
            </div>
          </div>
        </Section>
      </main>
    </PublicShell>
  );
}

export function IntakePage({ snapshot, submitted }: IntakePageProps) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage snapshot={snapshot} />;
  }

  const program = snapshot.selectedProgram ?? snapshot.programs[0] ?? null;

  return (
    <PublicShell snapshot={snapshot}>
      <main>
        <CompactHero kicker={snapshot.tenant.name} title="Intake" sub="Start met een programma, kies proefles/inschrijving/wachtlijst en geef voorkeursmomenten door." />
        <Section>
          {submitted ? <SuccessNotice /> : null}
          {program && program.intakeConfig ? <IntakeForm program={program} /> : <IntakeUnavailable programs={snapshot.programs} />}
        </Section>
      </main>
    </PublicShell>
  );
}

function PublicShell({ snapshot, children }: PublicPageProps & { children: ReactNode }) {
  const nav = [
    { href: "/", label: "Home" },
    { href: "/nieuws", label: "Nieuws" },
    { href: "/agenda", label: "Agenda" },
    { href: "/programmas", label: "Programma's" },
    { href: "/intake", label: "Proefles" },
    { href: "/intake", label: "Inschrijven" }
  ];

  return (
    <div className="min-h-screen text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 md:px-8">
          <Link className="flex items-center" href="/">
            <img alt={snapshot.tenant?.name ?? "Zwemschool Demo"} className="h-5 w-auto" src="/lovable/zwemdemo-logo.png" />
          </Link>
          <nav className="ml-8 hidden items-center gap-1 md:flex">
            {nav.map((item, index) => (
              <HeaderLink key={`${item.href}-${index}`} href={item.href}>
                {item.label}
              </HeaderLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link className="hidden rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted md:inline-flex" href="/login">
              Inloggen
            </Link>
            <Link className="hidden rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90 md:inline-flex" href="/intake">
              Inschrijven
            </Link>
            <Link className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow hover:opacity-90 md:hidden" href="/intake">
              Intake
            </Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="mt-20 border-t border-border bg-card">
        <div className="mx-auto max-w-screen-2xl px-4 py-10 md:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <img alt={snapshot.tenant?.name ?? "Zwemschool Demo"} className="h-4 w-auto" src="/lovable/zwemdemo-logo.png" />
              <p className="mt-3 text-xs text-muted-foreground">Samen elke druppel vooruit.</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Programma's</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li>
                  <Link href="/programmas">Diploma A / B / C</Link>
                </li>
                <li>
                  <Link href="/programmas">Priveles</Link>
                </li>
                <li>
                  <Link href="/programmas">Survival zwemmen</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Portalen</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li>
                  <Link href="/parent">Ouderportaal</Link>
                </li>
                <li>
                  <Link href="/instructor">Instructeur app</Link>
                </li>
                <li>
                  <Link href="/admin">Tenant admin</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {snapshot.tenant?.name ?? "Zwemschool Demo"}
                <br />
                Den Haag
              </p>
            </div>
          </div>
          <p className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">(c) 2026 NXTTRACK. Swim-first SaaS platform.</p>
        </div>
      </footer>
    </div>
  );
}

function ProgramGrid({ programs }: { programs: PublicProgram[] }) {
  if (programs.length === 0) {
    return <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">Er zijn nog geen gepubliceerde programma's.</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => (
        <article key={program.id} className="flex min-h-[22rem] flex-col rounded-3xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Waves className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{program.code}</span>
          </div>
          <h2 className="mt-5 text-xl font-bold">{program.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{program.summary ?? program.description ?? "Gepubliceerd programma."}</p>
          <div className="mt-5 grid gap-2 text-xs text-muted-foreground">
            <MetaLine icon={<Users className="h-4 w-4" />} value={program.ageLabel} />
            <MetaLine icon={<Clock className="h-4 w-4" />} value={program.durationLabel} />
            <MetaLine icon={<ShieldCheck className="h-4 w-4" />} value={program.capacityLabel} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {program.trialEnabled ? <SmallPill>Proefles</SmallPill> : null}
            {program.registrationEnabled ? <SmallPill>Inschrijven</SmallPill> : null}
            {program.waitlistEnabled ? <SmallPill>Wachtlijst</SmallPill> : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            <Link className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-muted" href={`/programmas/${program.slug}`}>
              Details
            </Link>
            <Link className="inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" href={`/intake?program=${program.slug}`}>
              Intake <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function toMarketingPrograms(programs: PublicProgram[]): MarketingProgram[] {
  if (programs.length === 0) {
    return fallbackMarketingPrograms;
  }

  return programs.slice(0, 6).map((program, index) => {
    const availability = waitlistPattern[index % waitlistPattern.length];

    return {
      id: program.id,
      name: program.name,
      ageLabel: program.ageLabel ?? "Alle leeftijden",
      description: program.summary ?? program.description ?? "Gepubliceerd zwemprogramma vanuit tenantdata.",
      slug: program.slug,
      waitlist: availability.waitlist,
      weeks: availability.weeks
    };
  });
}

function waitlistTone(waitlist: MarketingProgram["waitlist"]) {
  if (waitlist === "kort") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (waitlist === "gemiddeld") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function IntakeForm({ program }: { program: PublicProgram }) {
  const config = program.intakeConfig;

  if (!config) {
    return null;
  }

  return (
    <form action={submitIntakeAction} className="mx-auto max-w-5xl rounded-3xl border border-border bg-card p-5 shadow-card md:p-7">
      <input name="program_slug" type="hidden" value={program.slug} />
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-3xl bg-muted/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Gekozen programma</p>
          <h2 className="mt-2 text-2xl font-bold">{program.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{config.intro ?? program.summary ?? "Vul de intake in zodat de zwemschool de juiste vervolgstap kan bepalen."}</p>
          <div className="mt-5 grid gap-2">
            <DetailPill label="Leeftijd" value={program.ageLabel} />
            <DetailPill label="Duur" value={program.durationLabel} />
            <DetailPill label="Prijs" value={program.priceLabel} />
          </div>
          <div className="mt-6">
            <label className="grid gap-2 text-sm font-semibold">
              Intake-optie
              <select className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="intake_type" required>
                {config.allowedOptions.map((option) => (
                  <option key={option} value={option}>
                    {intakeOptionLabels[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>

        <div className="grid gap-5">
          <FormGrid title="Ouder/verzorger">
            <TextField label="Naam ouder/verzorger" name="parent_name" required />
            <TextField label="E-mail" name="parent_email" required type="email" />
            <TextField label="Telefoon" name="parent_phone" type="tel" />
          </FormGrid>

          <FormGrid title="Kind">
            <TextField label="Naam kind" name="participant_name" required />
            <TextField label="Geboortedatum" name="participant_birthdate" type="date" />
          </FormGrid>

          <fieldset className="rounded-2xl border border-border p-4">
            <legend className="px-1 text-sm font-bold">Voorkeursdagen</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {preferredDays.map((day) => (
                <CheckboxField key={day.value} label={day.label} name="preferred_days" value={day.value} />
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-border p-4">
            <legend className="px-1 text-sm font-bold">Voorkeurstijden</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {preferredTimes.map((time) => (
                <CheckboxField key={time.value} label={time.label} name="preferred_time_windows" value={time.value} />
              ))}
            </div>
          </fieldset>

          {config.questions.length > 0 ? (
            <FormGrid title="Aanvullende vragen">
              {config.questions.map((question) =>
                question.type === "textarea" ? <TextAreaField key={question.name} label={question.label} name={`answer_${question.name}`} required={question.required} /> : <TextField key={question.name} label={question.label} name={`answer_${question.name}`} required={question.required} />
              )}
            </FormGrid>
          ) : null}

          <TextAreaField label="Opmerkingen" name="notes" />

          <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-glow hover:bg-primary/90 md:w-fit" type="submit">
            Intake versturen <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}

function PublicStatusPage({ snapshot }: PublicPageProps) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <div className="w-full rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <Kicker>NXTTRACK tenant website</Kicker>
          <h1 className="mt-4 text-3xl font-bold md:text-4xl">Tenantwebsite nog niet beschikbaar</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{statusCopy(snapshot)}</p>
          {snapshot.errors.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              {snapshot.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <SecondaryLink href="/nxttrack">NXTTRACK</SecondaryLink>
            <SecondaryLink href="/login">Login</SecondaryLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactHero({ kicker, title, sub, primary }: { kicker: string; title: string; sub: string; primary?: { href: string; label: string } }) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-sky-50 to-white">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-18">
        <Kicker>{kicker}</Kicker>
        <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-slate-950 md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{sub}</p>
        {primary ? (
          <div className="mt-7">
            <PrimaryLink href={primary.href}>{primary.label}</PrimaryLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Section({ title, sub, tinted, children }: { title?: string; sub?: string; tinted?: boolean; children?: ReactNode }) {
  return (
    <section className={tinted ? "bg-slate-50/80" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20">
        {title ? (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
            {sub ? <p className="mt-3 text-base leading-7 text-muted-foreground">{sub}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function SuccessNotice() {
  return (
    <div className="mx-auto mb-6 max-w-5xl rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800">
      Intake ontvangen. De status staat op nieuw en is klaar voor beoordeling in de volgende fase.
    </div>
  );
}

function IntakeUnavailable({ programs }: { programs: PublicProgram[] }) {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
      <h2 className="text-2xl font-bold">Geen intake beschikbaar</h2>
      <p className="mt-2 text-sm text-muted-foreground">Kies een gepubliceerd programma met een actieve intakeconfiguratie.</p>
      {programs.length > 0 ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {programs.map((program) => (
            <Link key={program.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted" href={`/intake?program=${program.slug}`}>
              {program.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FormGrid({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border p-4">
      <legend className="px-1 text-sm font-bold">{title}</legend>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function TextField({ label, name, required, type = "text" }: { label: string; name: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} required={required} type={type} />
    </label>
  );
}

function TextAreaField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm font-semibold md:col-span-2">
      <span>{label}</span>
      <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} required={required} />
    </label>
  );
}

function CheckboxField({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
      <input className="h-4 w-4 accent-primary" name={name} type="checkbox" value={value} />
      {label}
    </label>
  );
}

function DetailPill({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value ?? "-"}</p>
    </div>
  );
}

function OptionStatus({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-3">
      <span className="text-sm font-semibold">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{enabled ? "Actief" : "Uit"}</span>
    </div>
  );
}

function MetaLine({ icon, value }: { icon: ReactNode; value: string | null }) {
  return value ? (
    <div className="flex items-center gap-2">
      {icon}
      <span>{value}</span>
    </div>
  ) : null;
}

function SmallPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{children}</span>;
}

function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" href={href}>
      {children}
    </Link>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-slate-800" href={href}>
      {children} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50" href={href}>
      {children}
    </Link>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/85 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

function statusCopy(snapshot: PublicTenantSiteSnapshot) {
  if (snapshot.status === "not_configured") {
    return "Supabase is nog niet geconfigureerd voor deze runtime.";
  }

  if (snapshot.status === "no_tenant") {
    return "Er is geen actieve tenant gevonden voor deze host of fallback slug.";
  }

  return "De tenantdata kon niet worden gelezen.";
}

function fallbackProfile(tenantName: string) {
  return {
    heroTitle: `${tenantName} zwemschool`,
    heroSubtitle: "Bekijk programma's en start een intake voor proefles, inschrijving of wachtlijst.",
    primaryCtaLabel: "Bekijk programma's",
    secondaryCtaLabel: "Start intake",
    introTitle: "Van intake naar de juiste groep",
    introBody: "Programma's, stages en intake-opties worden uit de tenantdata gelezen."
  };
}
