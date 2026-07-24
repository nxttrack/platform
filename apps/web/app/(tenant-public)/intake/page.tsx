import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field as FieldRoot, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { submitIntakeAction } from "@/lib/domain/intake-actions";
import { getPublicTenantSiteData, getTenantSlugFromRequest, type IntakeOption, type PublicIntakeQuestion } from "@/lib/domain/public-site";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const optionLabels: Record<IntakeOption, string> = {
  enrollment: "Inschrijven",
  trial: "Proefles",
  waitlist: "Wachtlijst",
  information_request: "Informatieaanvraag"
};

const optionDescriptions: Record<IntakeOption, string> = {
  enrollment: "Ik wil mijn kind aanmelden voor lessen.",
  trial: "Ik wil eerst een proefles aanvragen.",
  waitlist: "Ik wil op de wachtlijst komen.",
  information_request: "Ik wil eerst contact of extra informatie."
};

const preferredDays = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

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
  const allowedOptions = form.allowedOptions.length > 0 ? form.allowedOptions : (Object.keys(optionLabels) as IntakeOption[]);

  return (
    <main>
      <section className="bg-card px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{data.tenant.name}</p>
          <h1 className="mt-2 text-4xl font-bold text-foreground md:text-5xl">{form.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{form.intro ?? "Vul de gegevens in. De zwemschool neemt daarna contact op."}</p>
        </div>
      </section>

      <section className="px-4 py-10">
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[0.7fr_1.3fr]">
          <aside className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 shadow-soft">
              <h2 className="text-lg font-bold text-foreground">Programma</h2>
              <div className="mt-4 space-y-2">
                {data.programs.map((program) => (
                  <Link className={`block rounded-lg border px-3 py-2 text-sm font-semibold ${selectedProgram?.id === program.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-white text-foreground"}`} href={`/intake?programma=${program.id}`} key={program.id}>
                    {program.name}
                  </Link>
                ))}
              </div>
            </div>
            {received ? (
              <div className="rounded-xl border border-success/20 bg-success/10 p-5 text-sm text-success">
                <p className="font-bold">Aanmelding ontvangen.</p>
                {reference ? <p className="mt-1">Referentie: {reference}</p> : null}
              </div>
            ) : null}
            {error ? <div className="rounded-xl border border-danger/20 bg-danger/10 p-5 text-sm font-semibold text-danger">Versturen is niet gelukt. Controleer de velden en probeer opnieuw.</div> : null}
          </aside>

          <form action={submitIntakeAction} className="rounded-xl border border-border bg-card p-5 shadow-card">
            <input name="programId" type="hidden" value={selectedProgram?.id ?? ""} />
            <input name="formId" type="hidden" value={form.id ?? ""} />
            <input name="formStartedAt" type="hidden" value={Date.now()} />
            <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
              <label htmlFor="companyWebsite">Bedrijfswebsite</label>
              <input autoComplete="off" id="companyWebsite" name="companyWebsite" tabIndex={-1} type="text" />
            </div>

            <div className="mb-6">
              <h2 className="text-lg font-bold text-foreground">Waarvoor meld je je aan?</h2>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {allowedOptions.map((option, index) => (
                  <label className="cursor-pointer rounded-lg border border-border bg-white p-3 text-sm transition has-[:checked]:border-primary has-[:checked]:bg-primary/10" key={option}>
                    <input className="sr-only" defaultChecked={index === 0} name="selectedOption" required type="radio" value={option} />
                    <span className="font-bold text-foreground">{optionLabels[option]}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{optionDescriptions[option]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Naam ouder/verzorger" name="parentName" required />
              <Field label="E-mail" name="parentEmail" required type="email" />
              <Field label="Telefoon" name="parentPhone" type="tel" />
              <Field label="Naam kind" name="participantName" required />
              <Field label="Geboortedatum kind" name="participantBirthDate" type="date" />
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-semibold text-foreground">Voorkeursdagen</p>
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {preferredDays.map((day) => (
                    <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm" key={day}>
                      <input name="preferredDays" type="checkbox" value={day.toLowerCase()} />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <TextArea label="Voorkeur of planning" name="preferredNotes" />
              <TextArea label="Bericht" name="message" />
              {form.questions.map((question) => (
                <QuestionField key={question.fieldKey} question={question} />
              ))}
              <label className="flex gap-3 rounded-lg border border-border bg-muted/50 p-3 text-sm md:col-span-2">
                <input className="mt-1" name="consentGiven" required type="checkbox" />
                <span>Ik geef toestemming om deze gegevens te gebruiken voor contact over deze aanmelding.</span>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Link className="text-sm font-semibold text-muted-foreground hover:text-foreground" href="/programmas">
                Terug naar programma's
              </Link>
              <Button size="lg" type="submit">
                Aanmelding versturen
              </Button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function QuestionField({ question }: { question: PublicIntakeQuestion }) {
  const name = `answer_${question.fieldKey}`;

  if (question.fieldType === "textarea") {
    return <TextArea label={question.label} name={name} required={question.required} />;
  }

  if (question.fieldType === "select") {
    return (
      <FieldRoot>
        <FieldLabel htmlFor={name}>{question.label}</FieldLabel>
        <NativeSelect className="h-11" id={name} name={name} required={question.required}>
          <option value="">Kies</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      </FieldRoot>
    );
  }

  if (question.fieldType === "checkbox") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{question.label}</p>
        <div className="space-y-2">
          {question.options.map((option) => (
            <label className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm" key={option}>
              <input name={name} type="checkbox" value={option} />
              {option}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return <Field label={question.label} name={name} required={question.required} type={question.fieldType === "date" ? "date" : "text"} />;
}

function Field({ label, name, type = "text", required = false }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <FieldRoot>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input className="h-11" id={name} name={name} required={required} type={type} />
    </FieldRoot>
  );
}

function TextArea({ label, name, required = false }: { label: string; name: string; required?: boolean }) {
  return (
    <FieldRoot className="md:col-span-2">
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Textarea id={name} name={name} required={required} />
    </FieldRoot>
  );
}

function Unavailable() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <section className="max-w-lg rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <h1 className="text-2xl font-bold text-foreground">Intake niet beschikbaar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Open deze pagina via een tenant-subdomain.</p>
      </section>
    </main>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
