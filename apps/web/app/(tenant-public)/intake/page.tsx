import { CircleCheck, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

import { IntakeWizard } from "@/components/public/intake-wizard";
import { WaitTimeChip } from "@/components/public/wait-time-chip";
import { submitIntakeAction } from "@/lib/domain/intake-actions";
import { getPublicTenantSiteData, getTenantSlugFromRequest, type IntakeOption } from "@/lib/domain/public-site";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function IntakePage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const [data, slug] = await Promise.all([getPublicTenantSiteData(), getTenantSlugFromRequest()]);
  const selectedProgramId = getParam(params, "programma");
  const received = getParam(params, "ontvangen") === "1";
  const reference = getParam(params, "referentie");
  const error = getParam(params, "error");

  if (!slug || !data) {
    return <Unavailable />;
  }

  const selectedProgram = data.programs.find((program) => program.id === selectedProgramId) ?? data.programs[0] ?? null;
  const form = selectedProgram?.form ?? data.defaultForm;
  const allowedOptions = form.allowedOptions.length > 0 ? form.allowedOptions : (["enrollment", "trial", "waitlist", "information_request"] satisfies IntakeOption[]);

  if (received) {
    return (
      <main className="px-4 py-16 sm:py-24">
        <section className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-card p-7 text-center shadow-card sm:p-10">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <CircleCheck aria-hidden="true" className="size-7" />
          </span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-primary">{data.tenant.name}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Aanmelding ontvangen</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Bedankt. De zwemschool bekijkt jullie voorkeur en neemt contact op om het passende moment te bevestigen.
          </p>
          {reference ? <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-xs font-semibold text-muted-foreground">Referentie: {reference}</p> : null}
          <Link className="mt-6 inline-flex text-sm font-semibold text-primary hover:underline" href="/">
            Terug naar de website
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main>
      <section className="relative overflow-hidden border-b border-border bg-card px-4 py-10 sm:py-14">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-aqua/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{data.tenant.name}</p>
              <h1 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">Samen vinden we het beste lesmoment</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Beantwoord de vragen stap voor stap. Op basis van zwemervaring en jullie beschikbaarheid stellen we direct drie passende voorkeuren voor.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2">
                <Sparkles className="size-3.5 text-primary" /> Slim gematcht
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2">
                <ShieldCheck className="size-3.5 text-primary" /> Zorgvuldig verwerkt
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:py-10">
        <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Programma</p>
              <nav aria-label="Kies programma" className="mt-3 space-y-2">
                {data.programs.map((program) => {
                  const active = selectedProgram?.id === program.id;
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-xl border p-3 transition ${
                        active ? "border-primary bg-primary/[0.06] shadow-soft" : "border-border bg-white hover:border-primary/30"
                      }`}
                      href={`/intake?programma=${program.id}`}
                      key={program.id}
                    >
                      <span className={`block text-sm font-bold ${active ? "text-primary" : "text-foreground"}`}>{program.name}</span>
                      <WaitTimeChip band={program.waitBand} className="mt-2" />
                    </Link>
                  );
                })}
              </nav>
            </div>
            <p className="px-1 text-xs leading-5 text-muted-foreground">
              Wachttijden zijn indicatief. Een medewerker controleert niveau, planning en definitieve plaatsing.
            </p>
          </aside>

          <div>
            {error ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800" role="alert">
                Versturen is niet gelukt. Controleer de gegevens en probeer opnieuw.
              </div>
            ) : null}
            {selectedProgram ? (
              <IntakeWizard
                action={submitIntakeAction}
                allowedOptions={allowedOptions}
                formId={form.id}
                formStartedAt={Date.now()}
                programId={selectedProgram.id}
                programName={selectedProgram.name}
                questions={form.questions}
                slots={selectedProgram.slots}
              />
            ) : (
              <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                Deze zwemschool heeft nog geen actief programma voor intake.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-2xl border border-border bg-card p-6 text-center shadow-card">
        <h1 className="text-2xl font-bold text-foreground">Intake niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Open deze pagina via een zwemschooladres.</p>
      </section>
    </main>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
