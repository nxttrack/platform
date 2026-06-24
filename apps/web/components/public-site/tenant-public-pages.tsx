import { ArrowRight, CalendarDays, Clock, ListChecks, ShieldCheck, Users, Waves } from "lucide-react";
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

export function TenantMarketingPage({ snapshot }: PublicPageProps) {
  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage snapshot={snapshot} />;
  }

  const profile = snapshot.profile ?? fallbackProfile(snapshot.tenant.name);
  const featuredPrograms = snapshot.programs.slice(0, 3);

  return (
    <PublicShell snapshot={snapshot}>
      <main>
        <section className="relative overflow-hidden border-b border-border bg-gradient-to-b from-sky-50 via-white to-background">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <Kicker>{snapshot.tenant.name}</Kicker>
              <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 md:text-6xl">{profile.heroTitle}</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 md:text-lg">{profile.heroSubtitle}</p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <PrimaryLink href="/programmas">{profile.primaryCtaLabel}</PrimaryLink>
                <SecondaryLink href="/intake">{profile.secondaryCtaLabel}</SecondaryLink>
              </div>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Programma's", "Intake", "Proefles", "Wachtlijst"].map((label) => (
                  <span key={label} className="rounded-full border border-border bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <TenantHeroVisual programs={snapshot.programs} />
          </div>
        </section>

        <Section title={profile.introTitle ?? "Zwemles met overzicht"} sub={profile.introBody ?? "Bekijk het aanbod en start direct een intake voor het juiste programma, moment en instroomtype."}>
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard icon={<Waves className="h-5 w-5" />} title="Programma kiezen" text="Ouders starten bij het programma dat past bij de zwemroute." />
            <InfoCard icon={<CalendarDays className="h-5 w-5" />} title="Voorkeuren doorgeven" text="Dag- en tijdvoorkeuren worden direct bij de intake opgeslagen." />
            <InfoCard icon={<ListChecks className="h-5 w-5" />} title="Instroom bepalen" text="Proefles, inschrijving en wachtlijst zijn intake-opties, geen losse flows." />
          </div>
        </Section>

        <Section tinted title="Programma's" sub="Actueel aanbod vanuit de tenantdata. Stages blijven leerprogressie; abonnementen blijven billing.">
          <ProgramGrid programs={featuredPrograms.length > 0 ? featuredPrograms : snapshot.programs} />
          <div className="mt-8 text-center">
            <SecondaryLink href="/programmas">Alle programma's bekijken</SecondaryLink>
          </div>
        </Section>
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
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-white/88 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:px-8">
          <Link className="flex items-center gap-3" href="/">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
              <Waves className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{snapshot.tenant?.name ?? "NXTTRACK"}</span>
              <span className="block text-xs text-muted-foreground">Tenant website</span>
            </span>
          </Link>
          <nav className="ml-auto hidden items-center gap-1 md:flex">
            <HeaderLink href="/">Home</HeaderLink>
            <HeaderLink href="/programmas">Programma's</HeaderLink>
            <HeaderLink href="/intake">Intake</HeaderLink>
            <HeaderLink href="/login">Login</HeaderLink>
          </nav>
          <Link className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-soft md:ml-3" href="/intake">
            Intake <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between md:px-8">
          <p>{snapshot.tenant?.name ?? "NXTTRACK"} draait op NXTTRACK.</p>
          <div className="flex flex-wrap gap-3">
            <Link className="hover:text-foreground" href="/programmas">
              Programma's
            </Link>
            <Link className="hover:text-foreground" href="/intake">
              Intake
            </Link>
            <Link className="hover:text-foreground" href="/login">
              Login
            </Link>
          </div>
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

function TenantHeroVisual({ programs }: { programs: PublicProgram[] }) {
  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border bg-white p-5 shadow-card">
      <div className="rounded-3xl bg-gradient-to-br from-sky-100 via-white to-blue-50 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase text-primary">Vandaag</p>
            <p className="mt-1 text-2xl font-bold">Instroom overzicht</p>
          </div>
          <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">Live aanbod</span>
        </div>
        <div className="mt-6 grid gap-3">
          {(programs.length > 0 ? programs.slice(0, 3) : fallbackVisualPrograms).map((program) => (
            <div key={program.name} className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-soft backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{program.name}</p>
                  <p className="text-xs text-muted-foreground">{program.capacityLabel ?? "Capaciteit volgt uit planning"}</p>
                </div>
                <Waves className="h-5 w-5 text-primary" />
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 rounded-full bg-primary" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
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

function InfoCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 text-lg font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
    </div>
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

const fallbackVisualPrograms = [
  { name: "Zwemdiploma A", capacityLabel: "Instroom op niveau" },
  { name: "Zwemdiploma B", capacityLabel: "Vervolgroute" },
  { name: "Priveles", capacityLabel: "Beperkte plekken" }
];
