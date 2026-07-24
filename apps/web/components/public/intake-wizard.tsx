"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  ContactRound,
  Info,
  Plus,
  Sparkles,
  UserRound,
  Waves
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { WaitTimeChip } from "@/components/public/wait-time-chip";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import {
  daypartLabels,
  rankIntakeSlots,
  swimmingExperienceOptions,
  type IntakeDaypart,
  type IntakeRecommendation,
  type PublicIntakeSlot,
  type SwimmingExperience
} from "@/lib/domain/intake-recommendation-contract";
import type { IntakeOption, PublicIntakeQuestion } from "@/lib/domain/public-site";
import { cn } from "@/lib/utils";

type IntakeWizardProps = {
  action: (formData: FormData) => void | Promise<void>;
  allowedOptions: IntakeOption[];
  formId: string | null;
  formStartedAt: number;
  programId: string | null;
  programName: string;
  questions: PublicIntakeQuestion[];
  slots: PublicIntakeSlot[];
};

type WizardStep = "child" | "guardians" | "experience" | "availability" | "choice";

const steps: Array<{ id: WizardStep; label: string; shortLabel: string }> = [
  { id: "child", label: "Kind", shortLabel: "Kind" },
  { id: "guardians", label: "Ouder(s)", shortLabel: "Ouder" },
  { id: "experience", label: "Zwemervaring", shortLabel: "Ervaring" },
  { id: "availability", label: "Voorkeur", shortLabel: "Voorkeur" },
  { id: "choice", label: "Beste opties", shortLabel: "Keuze" }
];

const optionLabels: Record<IntakeOption, string> = {
  enrollment: "Inschrijven",
  trial: "Proefles aanvragen",
  waitlist: "Wachtlijst",
  information_request: "Eerst informatie"
};

const excludedQuestionKeys = new Set(["swimming_experience", "swim_experience", "preferred_moment"]);

export function IntakeWizard(props: IntakeWizardProps) {
  const [hydrated, setHydrated] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [participantName, setParticipantName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [selectedOption, setSelectedOption] = useState<IntakeOption>(props.allowedOptions[0] ?? "enrollment");
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [hasSecondGuardian, setHasSecondGuardian] = useState(false);
  const [secondaryParentName, setSecondaryParentName] = useState("");
  const [secondaryParentEmail, setSecondaryParentEmail] = useState("");
  const [secondaryParentPhone, setSecondaryParentPhone] = useState("");
  const [experience, setExperience] = useState<SwimmingExperience | "">("");
  const [customAnswers, setCustomAnswers] = useState<Record<string, string | string[]>>({});
  const [preferredDays, setPreferredDays] = useState<number[]>([]);
  const [preferredDayparts, setPreferredDayparts] = useState<Partial<Record<number, IntakeDaypart[]>>>({});
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [consent, setConsent] = useState(false);
  const [preferredNotes, setPreferredNotes] = useState("");

  const currentStep = steps[stepIndex] ?? steps[0];
  const customQuestions = props.questions
    .filter((question) => !excludedQuestionKeys.has(question.fieldKey))
    .filter((question) => question.appliesToOptions.includes(selectedOption));
  const availableDays = useMemo(
    () =>
      Array.from(new Set(props.slots.map((slot) => slot.weekday)))
        .sort((left, right) => left - right)
        .map((weekday) => ({
          weekday,
          label: props.slots.find((slot) => slot.weekday === weekday)?.weekdayLabel ?? `Dag ${weekday}`,
          dayparts: Array.from(new Set(props.slots.filter((slot) => slot.weekday === weekday).map((slot) => slot.daypart)))
        })),
    [props.slots]
  );
  const recommendations = useMemo(
    () =>
      experience
        ? rankIntakeSlots({
            slots: props.slots,
            experience,
            preferredDays,
            preferredDayparts
          })
        : [],
    [experience, preferredDayparts, preferredDays, props.slots]
  );
  const selectedRecommendation = recommendations.find((recommendation) => recommendation.groupId === selectedGroupId) ?? null;
  const age = getAge(birthDate);
  const canContinue = getCanContinue({
    step: currentStep.id,
    participantName,
    birthDate,
    parentName,
    parentEmail,
    experience,
    customQuestions,
    customAnswers,
    preferredDays,
    preferredDayparts,
    recommendations,
    selectedGroupId,
    slotsAvailable: props.slots.length > 0
  });

  useEffect(() => {
    setHydrated(true);
  }, []);

  function goForward() {
    if (!canContinue) {
      return;
    }

    setStepIndex((current) => Math.min(steps.length - 1, current + 1));
  }

  function toggleDay(weekday: number) {
    setSelectedGroupId("");
    setPreferredDays((current) => {
      if (current.includes(weekday)) {
        setPreferredDayparts((parts) => {
          const next = { ...parts };
          delete next[weekday];
          return next;
        });
        return current.filter((day) => day !== weekday);
      }

      return [...current, weekday];
    });
  }

  function toggleDaypart(weekday: number, daypart: IntakeDaypart) {
    setSelectedGroupId("");
    setPreferredDayparts((current) => {
      const dayparts = current[weekday] ?? [];
      const next = dayparts.includes(daypart) ? dayparts.filter((part) => part !== daypart) : [...dayparts, daypart];
      return { ...current, [weekday]: next };
    });
  }

  return (
    <form action={props.action} className="overflow-hidden rounded-3xl border border-border bg-card shadow-card" data-hydrated={hydrated ? "true" : "false"} data-intake-wizard>
      <input name="programId" type="hidden" value={props.programId ?? ""} />
      <input name="formId" type="hidden" value={props.formId ?? ""} />
      <input name="formStartedAt" type="hidden" value={props.formStartedAt} />
      <input name="participantName" type="hidden" value={participantName} />
      <input name="participantBirthDate" type="hidden" value={birthDate} />
      <input name="selectedOption" type="hidden" value={selectedOption} />
      <input name="parentName" type="hidden" value={parentName} />
      <input name="parentEmail" type="hidden" value={parentEmail} />
      <input name="parentPhone" type="hidden" value={parentPhone} />
      <input name="secondaryParentName" type="hidden" value={hasSecondGuardian ? secondaryParentName : ""} />
      <input name="secondaryParentEmail" type="hidden" value={hasSecondGuardian ? secondaryParentEmail : ""} />
      <input name="secondaryParentPhone" type="hidden" value={hasSecondGuardian ? secondaryParentPhone : ""} />
      <input name="swimmingExperience" type="hidden" value={experience} />
      <input name="preferredDayparts" type="hidden" value={JSON.stringify(preferredDayparts)} />
      <input name="selectedGroupId" type="hidden" value={selectedGroupId} />
      <input name="preferredNotes" type="hidden" value={preferredNotes} />
      {preferredDays.map((weekday) => (
        <input key={weekday} name="preferredWeekdays" type="hidden" value={weekday} />
      ))}
      {preferredDays.map((weekday) => (
        <input key={`day-${weekday}`} name="preferredDays" type="hidden" value={(availableDays.find((day) => day.weekday === weekday)?.label ?? "").toLowerCase()} />
      ))}
      {customQuestions.flatMap((question) => {
        const value = customAnswers[question.fieldKey];
        const values = Array.isArray(value) ? value : value ? [value] : [];
        return values.map((answer) => <input key={`${question.fieldKey}-${answer}`} name={`answer_${question.fieldKey}`} type="hidden" value={answer} />);
      })}
      <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
        <label htmlFor="companyWebsite">Bedrijfswebsite</label>
        <input autoComplete="off" id="companyWebsite" name="companyWebsite" tabIndex={-1} type="text" />
      </div>

      <div className="border-b border-border bg-gradient-to-r from-primary/[0.08] via-aqua/[0.06] to-transparent px-5 py-5 sm:px-7">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs font-semibold text-muted-foreground">
          <span>
            Stap {stepIndex + 1} van {steps.length}
          </span>
          <span>{Math.round(((stepIndex + 1) / steps.length) * 100)}% voltooid</span>
        </div>
        <Progress aria-label="Voortgang intake" value={((stepIndex + 1) / steps.length) * 100} />
        <ol aria-label="Stappen" className="mt-4 grid grid-cols-5 gap-1.5 sm:gap-2">
          {steps.map((step, index) => (
            <li
              aria-current={index === stepIndex ? "step" : undefined}
              className={cn(
                "flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-1 py-2 text-[10px] font-semibold transition sm:px-2 sm:text-xs",
                index === stepIndex && "border-primary/30 bg-white text-primary shadow-soft",
                index < stepIndex && "border-emerald-200 bg-emerald-50 text-emerald-800",
                index > stepIndex && "border-transparent bg-white/50 text-muted-foreground"
              )}
              key={step.id}
            >
              {index < stepIndex ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : <span className="hidden size-4 shrink-0 place-items-center rounded-full bg-muted sm:grid">{index + 1}</span>}
              <span className="truncate sm:hidden">{step.shortLabel}</span>
              <span className="hidden truncate sm:inline">{step.label}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="grid lg:min-h-[590px] lg:grid-cols-[minmax(0,1fr)_270px]">
        <section aria-labelledby={`step-${currentStep.id}`} className="p-5 sm:p-7">
          {currentStep.id === "child" ? (
            <ChildStep
              age={age}
              allowedOptions={props.allowedOptions}
              birthDate={birthDate}
              onBirthDateChange={setBirthDate}
              onNameChange={setParticipantName}
              onOptionChange={setSelectedOption}
              option={selectedOption}
              participantName={participantName}
            />
          ) : null}
          {currentStep.id === "guardians" ? (
            <GuardiansStep
              hasSecondGuardian={hasSecondGuardian}
              onHasSecondGuardianChange={setHasSecondGuardian}
              onParentEmailChange={setParentEmail}
              onParentNameChange={setParentName}
              onParentPhoneChange={setParentPhone}
              onSecondaryParentEmailChange={setSecondaryParentEmail}
              onSecondaryParentNameChange={setSecondaryParentName}
              onSecondaryParentPhoneChange={setSecondaryParentPhone}
              parentEmail={parentEmail}
              parentName={parentName}
              parentPhone={parentPhone}
              secondaryParentEmail={secondaryParentEmail}
              secondaryParentName={secondaryParentName}
              secondaryParentPhone={secondaryParentPhone}
            />
          ) : null}
          {currentStep.id === "experience" ? (
            <ExperienceStep
              answers={customAnswers}
              experience={experience}
              onAnswersChange={setCustomAnswers}
              onExperienceChange={setExperience}
              questions={customQuestions}
            />
          ) : null}
          {currentStep.id === "availability" ? (
            <AvailabilityStep
              availableDays={availableDays}
              onDayToggle={toggleDay}
              onDaypartToggle={toggleDaypart}
              preferredDayparts={preferredDayparts}
              preferredDays={preferredDays}
            />
          ) : null}
          {currentStep.id === "choice" ? (
            <ChoiceStep
              consent={consent}
              notes={preferredNotes}
              onConsentChange={setConsent}
              onNotesChange={setPreferredNotes}
              onSelect={setSelectedGroupId}
              recommendations={recommendations}
              selectedGroupId={selectedGroupId}
            />
          ) : null}
        </section>

        <aside className="hidden border-l border-border bg-slate-50/70 p-6 lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Jullie intake</p>
          <h2 className="mt-2 text-lg font-bold text-foreground">{props.programName}</h2>
          <div className="mt-6 space-y-4 text-sm">
            <SummaryItem complete={!!participantName && !!birthDate} icon={<UserRound className="size-4" />} label="Kind">
              {participantName || "Nog invullen"}
              {age !== null ? ` · ${age} jaar` : ""}
            </SummaryItem>
            <SummaryItem complete={!!parentName && isEmail(parentEmail)} icon={<ContactRound className="size-4" />} label="Contact">
              {parentName || "Nog invullen"}
            </SummaryItem>
            <SummaryItem complete={!!experience} icon={<Waves className="size-4" />} label="Ervaring">
              {swimmingExperienceOptions.find((option) => option.value === experience)?.label ?? "Nog kiezen"}
            </SummaryItem>
            <SummaryItem complete={preferredDays.length > 0} icon={<ChevronDown className="size-4" />} label="Momenten">
              {preferredDays.length > 0 ? `${preferredDays.length} voorkeursdag${preferredDays.length === 1 ? "" : "en"}` : "Nog kiezen"}
            </SummaryItem>
          </div>
          {selectedRecommendation ? (
            <div className="mt-6 rounded-2xl border border-primary/20 bg-white p-4 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wider text-primary">Eerste voorkeur</p>
              <p className="mt-2 font-bold text-foreground">
                {selectedRecommendation.weekdayLabel} · {selectedRecommendation.startsAt}
              </p>
              <WaitTimeChip band={selectedRecommendation.waitBand} className="mt-3" />
            </div>
          ) : null}
          <div className="mt-6 flex gap-2 rounded-2xl border border-border bg-white p-4 text-xs leading-5 text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            We tonen een wachttijdindicatie, nooit aantallen. De zwemschool bevestigt de definitieve plaatsing persoonlijk.
          </div>
        </aside>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-5 py-4 sm:px-7">
        <Button disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))} type="button" variant="ghost">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Vorige
        </Button>
        {stepIndex < steps.length - 1 ? (
          <Button disabled={!canContinue} onClick={goForward} size="lg" type="button">
            Volgende
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        ) : (
          <SubmitButton disabled={!canContinue || !consent} size="lg">
            Aanmelding versturen
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

function StepHeading({ icon, id, title, description }: { icon: React.ReactNode; id: string; title: string; description: string }) {
  return (
    <header className="mb-7">
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl" id={id}>
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
    </header>
  );
}

function ChildStep(props: {
  age: number | null;
  allowedOptions: IntakeOption[];
  birthDate: string;
  onBirthDateChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onOptionChange: (value: IntakeOption) => void;
  option: IntakeOption;
  participantName: string;
}) {
  return (
    <div className="animate-in fade-in-0">
      <StepHeading description="We beginnen met de gegevens van het kind. De volgende vraag verschijnt zodra je antwoord compleet is." icon={<UserRound className="size-5" />} id="step-child" title="Wie wil je aanmelden?" />
      <div className="grid max-w-2xl gap-5">
        <Field>
          <FieldLabel htmlFor="wizardParticipantName">Naam kind</FieldLabel>
          <Input autoComplete="name" autoFocus className="h-12" id="wizardParticipantName" onChange={(event) => props.onNameChange(event.target.value)} placeholder="Voor- en achternaam" value={props.participantName} />
        </Field>
        {props.participantName.trim() ? (
          <Field className="animate-in fade-in-0 slide-in-from-bottom-2">
            <FieldLabel htmlFor="wizardBirthDate">Geboortedatum kind</FieldLabel>
            <Input className="h-12" id="wizardBirthDate" max={new Date().toISOString().slice(0, 10)} onChange={(event) => props.onBirthDateChange(event.target.value)} type="date" value={props.birthDate} />
            {props.age !== null ? <FieldDescription>{props.participantName.split(" ")[0]} is {props.age} jaar.</FieldDescription> : null}
          </Field>
        ) : null}
        {props.birthDate ? (
          <fieldset className="animate-in fade-in-0 slide-in-from-bottom-2">
            <legend className="text-sm font-semibold text-foreground">Waar kunnen we bij helpen?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {props.allowedOptions.map((option) => (
                <label className="cursor-pointer rounded-xl border border-border bg-white px-4 py-3 text-sm font-semibold transition has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:text-primary" key={option}>
                  <input checked={props.option === option} className="sr-only" onChange={() => props.onOptionChange(option)} type="radio" />
                  {optionLabels[option]}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </div>
    </div>
  );
}

function GuardiansStep(props: {
  hasSecondGuardian: boolean;
  onHasSecondGuardianChange: (value: boolean) => void;
  onParentEmailChange: (value: string) => void;
  onParentNameChange: (value: string) => void;
  onParentPhoneChange: (value: string) => void;
  onSecondaryParentEmailChange: (value: string) => void;
  onSecondaryParentNameChange: (value: string) => void;
  onSecondaryParentPhoneChange: (value: string) => void;
  parentEmail: string;
  parentName: string;
  parentPhone: string;
  secondaryParentEmail: string;
  secondaryParentName: string;
  secondaryParentPhone: string;
}) {
  return (
    <div className="animate-in fade-in-0">
      <StepHeading description="Vul eerst de primaire contactpersoon in. Een tweede ouder of verzorger is optioneel." icon={<ContactRound className="size-5" />} id="step-guardians" title="Ouder(s) of verzorger(s)" />
      <div className="grid max-w-2xl gap-5 sm:grid-cols-2">
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="wizardParentName">Naam ouder/verzorger 1</FieldLabel>
          <Input autoComplete="name" autoFocus className="h-12" id="wizardParentName" onChange={(event) => props.onParentNameChange(event.target.value)} value={props.parentName} />
        </Field>
        {props.parentName.trim() ? (
          <Field className="animate-in fade-in-0 slide-in-from-bottom-2">
            <FieldLabel htmlFor="wizardParentEmail">E-mail</FieldLabel>
            <Input autoComplete="email" className="h-12" id="wizardParentEmail" onChange={(event) => props.onParentEmailChange(event.target.value)} type="email" value={props.parentEmail} />
          </Field>
        ) : null}
        {isEmail(props.parentEmail) ? (
          <Field className="animate-in fade-in-0 slide-in-from-bottom-2">
            <FieldLabel htmlFor="wizardParentPhone">Telefoon (optioneel)</FieldLabel>
            <Input autoComplete="tel" className="h-12" id="wizardParentPhone" onChange={(event) => props.onParentPhoneChange(event.target.value)} type="tel" value={props.parentPhone} />
          </Field>
        ) : null}
      </div>

      {isEmail(props.parentEmail) ? (
        <div className="mt-6 max-w-2xl animate-in fade-in-0">
          {!props.hasSecondGuardian ? (
            <Button onClick={() => props.onHasSecondGuardianChange(true)} type="button" variant="outline">
              <Plus aria-hidden="true" className="size-4" />
              Ouder/verzorger 2 toevoegen
            </Button>
          ) : (
            <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-foreground">Ouder/verzorger 2</h3>
                <button className="text-xs font-semibold text-muted-foreground hover:text-foreground" onClick={() => props.onHasSecondGuardianChange(false)} type="button">
                  Verwijderen
                </button>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2">
                  <FieldLabel htmlFor="wizardSecondaryName">Naam</FieldLabel>
                  <Input className="h-11" id="wizardSecondaryName" onChange={(event) => props.onSecondaryParentNameChange(event.target.value)} value={props.secondaryParentName} />
                </Field>
                {props.secondaryParentName.trim() ? (
                  <>
                    <Field>
                      <FieldLabel htmlFor="wizardSecondaryEmail">E-mail (optioneel)</FieldLabel>
                      <Input className="h-11" id="wizardSecondaryEmail" onChange={(event) => props.onSecondaryParentEmailChange(event.target.value)} type="email" value={props.secondaryParentEmail} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="wizardSecondaryPhone">Telefoon (optioneel)</FieldLabel>
                      <Input className="h-11" id="wizardSecondaryPhone" onChange={(event) => props.onSecondaryParentPhoneChange(event.target.value)} type="tel" value={props.secondaryParentPhone} />
                    </Field>
                  </>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ExperienceStep(props: {
  answers: Record<string, string | string[]>;
  experience: SwimmingExperience | "";
  onAnswersChange: (answers: Record<string, string | string[]>) => void;
  onExperienceChange: (experience: SwimmingExperience) => void;
  questions: PublicIntakeQuestion[];
}) {
  return (
    <div className="animate-in fade-in-0">
      <StepHeading description="Kies de omschrijving die nu het beste past. De zwemschool controleert het niveau altijd bij de start." icon={<Waves className="size-5" />} id="step-experience" title="Hoeveel zwemervaring is er?" />
      <fieldset>
        <legend className="sr-only">Zwemervaring</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {swimmingExperienceOptions.map((option) => (
            <label
              className="cursor-pointer rounded-2xl border border-border bg-white p-4 transition hover:border-primary/30 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06] has-[:checked]:shadow-soft"
              key={option.value}
            >
              <input checked={props.experience === option.value} className="sr-only" onChange={() => props.onExperienceChange(option.value)} type="radio" />
              <span className="flex items-start gap-3">
                <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border", props.experience === option.value ? "border-primary bg-primary text-white" : "border-border")}>
                  {props.experience === option.value ? <Check className="size-3.5" /> : null}
                </span>
                <span>
                  <span className="block text-sm font-bold text-foreground">{option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {props.experience ? (
        <ProgressiveQuestions answers={props.answers} onChange={props.onAnswersChange} questions={props.questions} />
      ) : null}
    </div>
  );
}

function ProgressiveQuestions(props: {
  answers: Record<string, string | string[]>;
  onChange: (answers: Record<string, string | string[]>) => void;
  questions: PublicIntakeQuestion[];
}) {
  return (
    <div className="mt-7 space-y-5 border-t border-border pt-6">
      {props.questions.map((question, index) => {
        const previous = props.questions[index - 1];
        const shouldShow = index === 0 || (previous ? hasAnswer(props.answers[previous.fieldKey]) : true);

        if (!shouldShow) {
          return null;
        }

        const value = props.answers[question.fieldKey] ?? (question.fieldType === "checkbox" ? [] : "");
        return (
          <Field className="animate-in fade-in-0 slide-in-from-bottom-2" key={question.fieldKey}>
            <FieldLabel htmlFor={`question-${question.fieldKey}`}>
              {question.label}
              {question.required ? " *" : " (optioneel)"}
            </FieldLabel>
            {question.helpText ? <FieldDescription>{question.helpText}</FieldDescription> : null}
            {question.fieldType === "textarea" ? (
              <Textarea id={`question-${question.fieldKey}`} onChange={(event) => props.onChange({ ...props.answers, [question.fieldKey]: event.target.value })} value={typeof value === "string" ? value : ""} />
            ) : null}
            {question.fieldType === "select" ? (
              <NativeSelect className="h-11" id={`question-${question.fieldKey}`} onChange={(event) => props.onChange({ ...props.answers, [question.fieldKey]: event.target.value })} value={typeof value === "string" ? value : ""}>
                <option value="">Kies een antwoord</option>
                {question.options.map((option) => <option key={option}>{option}</option>)}
              </NativeSelect>
            ) : null}
            {question.fieldType === "checkbox" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const values = Array.isArray(value) ? value : [];
                  return (
                    <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/[0.05]" key={option}>
                      <input
                        checked={values.includes(option)}
                        onChange={() =>
                          props.onChange({
                            ...props.answers,
                            [question.fieldKey]: values.includes(option) ? values.filter((item) => item !== option) : [...values, option]
                          })
                        }
                        type="checkbox"
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            ) : null}
            {(question.fieldType === "text" || question.fieldType === "date") ? (
              <Input className="h-11" id={`question-${question.fieldKey}`} onChange={(event) => props.onChange({ ...props.answers, [question.fieldKey]: event.target.value })} type={question.fieldType} value={typeof value === "string" ? value : ""} />
            ) : null}
          </Field>
        );
      })}
    </div>
  );
}

function AvailabilityStep(props: {
  availableDays: Array<{ weekday: number; label: string; dayparts: IntakeDaypart[] }>;
  onDayToggle: (weekday: number) => void;
  onDaypartToggle: (weekday: number, daypart: IntakeDaypart) => void;
  preferredDayparts: Partial<Record<number, IntakeDaypart[]>>;
  preferredDays: number[];
}) {
  return (
    <div className="animate-in fade-in-0">
      <StepHeading description="Je ziet alleen dagen en dagdelen waarop dit programma lesmomenten heeft. Meerdere voorkeuren geven meer passende opties." icon={<ChevronDown className="size-5" />} id="step-availability" title="Wanneer komt zwemles uit?" />
      {props.availableDays.length > 0 ? (
        <>
          <fieldset>
            <legend className="text-sm font-semibold text-foreground">Voorkeursdagen</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {props.availableDays.map((day) => {
                const selected = props.preferredDays.includes(day.weekday);
                return (
                  <button
                    aria-pressed={selected}
                    className={cn(
                      "rounded-full border px-4 py-2.5 text-sm font-semibold transition",
                      selected ? "border-primary bg-primary text-primary-foreground shadow-glow" : "border-border bg-white text-foreground hover:border-primary/40"
                    )}
                    key={day.weekday}
                    onClick={() => props.onDayToggle(day.weekday)}
                    type="button"
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
          {props.preferredDays.length > 0 ? (
            <div className="mt-7 space-y-4 animate-in fade-in-0 slide-in-from-bottom-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Kies per dag één of meer dagdelen</h3>
                <p className="mt-1 text-xs text-muted-foreground">Alleen beschikbare dagdelen worden getoond.</p>
              </div>
              {props.preferredDays.map((weekday) => {
                const day = props.availableDays.find((candidate) => candidate.weekday === weekday);
                if (!day) return null;
                return (
                  <fieldset className="rounded-2xl border border-border bg-muted/20 p-4" key={weekday}>
                    <legend className="px-1 text-sm font-bold text-foreground">{day.label}</legend>
                    <div className="flex flex-wrap gap-2">
                      {day.dayparts.map((daypart) => {
                        const selected = props.preferredDayparts[weekday]?.includes(daypart) ?? false;
                        return (
                          <button
                            aria-pressed={selected}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-sm font-semibold transition",
                              selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-white text-muted-foreground hover:text-foreground"
                            )}
                            key={daypart}
                            onClick={() => props.onDaypartToggle(weekday, daypart)}
                            type="button"
                          >
                            {selected ? <Check aria-hidden="true" className="mr-1 inline size-3.5" /> : null}
                            {daypartLabels[daypart]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-900">
          Voor dit programma zijn nog geen vaste lesmomenten gepubliceerd. Je kunt de intake wel versturen; de zwemschool neemt contact op over passende mogelijkheden.
        </div>
      )}
    </div>
  );
}

function ChoiceStep(props: {
  consent: boolean;
  notes: string;
  onConsentChange: (value: boolean) => void;
  onNotesChange: (value: string) => void;
  onSelect: (groupId: string) => void;
  recommendations: IntakeRecommendation[];
  selectedGroupId: string;
}) {
  return (
    <div className="animate-in fade-in-0">
      <StepHeading description="Dit zijn de drie beste combinaties op basis van zwemervaring, jullie voorkeursmomenten en de actuele wachttijdindicatie." icon={<Sparkles className="size-5" />} id="step-choice" title="Kies jullie eerste voorkeur" />
      {props.recommendations.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="sr-only">Aanbevolen lesmomenten</legend>
          {props.recommendations.map((recommendation) => (
            <label
              className="block cursor-pointer rounded-2xl border border-border bg-white p-4 transition hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.04] has-[:checked]:shadow-card sm:p-5"
              data-intake-recommendation
              key={recommendation.groupId}
            >
              <input checked={props.selectedGroupId === recommendation.groupId} className="sr-only" onChange={() => props.onSelect(recommendation.groupId)} type="radio" />
              <span className="flex items-start gap-3">
                <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold", props.selectedGroupId === recommendation.groupId ? "border-primary bg-primary text-white" : "border-border text-muted-foreground")}>
                  {props.selectedGroupId === recommendation.groupId ? <Check className="size-4" /> : recommendation.rank}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="block font-bold text-foreground">
                        {recommendation.weekdayLabel} · {recommendation.startsAt}–{recommendation.endsAt}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {recommendation.stageName ? `${recommendation.stageName} · ` : ""}
                        {daypartLabels[recommendation.daypart]}
                      </span>
                    </span>
                    <WaitTimeChip band={recommendation.waitBand} />
                  </span>
                  <span className="mt-3 block text-xs leading-5 text-muted-foreground">
                    {recommendation.reasons.slice(0, 2).join(" · ")}
                  </span>
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-900">
          Er zijn nog geen drie passende vaste momenten gepubliceerd. Verstuur je voorkeuren gerust; de zwemschool neemt persoonlijk contact op.
        </div>
      )}
      <Field className="mt-6">
        <FieldLabel htmlFor="wizardNotes">Aanvulling voor de planning (optioneel)</FieldLabel>
        <Textarea id="wizardNotes" onChange={(event) => props.onNotesChange(event.target.value)} placeholder="Bijvoorbeeld: om de week lukt woensdag niet." value={props.notes} />
      </Field>
      <label className="mt-5 flex cursor-pointer gap-3 rounded-2xl border border-border bg-muted/30 p-4 text-sm leading-6">
        <input checked={props.consent} className="mt-1 size-4 accent-primary" name="consentGiven" onChange={(event) => props.onConsentChange(event.target.checked)} required type="checkbox" />
        <span>
          Ik geef toestemming om deze gegevens te gebruiken voor contact en planning rond deze aanmelding.
          <span className="mt-1 block text-xs text-muted-foreground">De gekozen tijd is een voorkeur en wordt door de zwemschool bevestigd.</span>
        </span>
      </label>
    </div>
  );
}

function SummaryItem({ children, complete, icon, label }: { children: React.ReactNode; complete: boolean; icon: React.ReactNode; label: string }) {
  return (
    <div className="flex gap-3">
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-xl", complete ? "bg-emerald-100 text-emerald-800" : "bg-white text-muted-foreground")}>
        {complete ? <CircleCheck className="size-4" /> : icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold text-muted-foreground">{label}</span>
        <span className="block truncate font-medium text-foreground">{children}</span>
      </span>
    </div>
  );
}

function getCanContinue(input: {
  step: WizardStep;
  participantName: string;
  birthDate: string;
  parentName: string;
  parentEmail: string;
  experience: SwimmingExperience | "";
  customQuestions: PublicIntakeQuestion[];
  customAnswers: Record<string, string | string[]>;
  preferredDays: number[];
  preferredDayparts: Partial<Record<number, IntakeDaypart[]>>;
  recommendations: IntakeRecommendation[];
  selectedGroupId: string;
  slotsAvailable: boolean;
}) {
  switch (input.step) {
    case "child":
      return input.participantName.trim().length >= 2 && !!input.birthDate && getAge(input.birthDate) !== null;
    case "guardians":
      return input.parentName.trim().length >= 2 && isEmail(input.parentEmail);
    case "experience":
      return (
        !!input.experience &&
        input.customQuestions.every((question) => !question.required || hasAnswer(input.customAnswers[question.fieldKey]))
      );
    case "availability":
      return (
        !input.slotsAvailable ||
        (input.preferredDays.length > 0 && input.preferredDays.every((weekday) => (input.preferredDayparts[weekday]?.length ?? 0) > 0))
      );
    case "choice":
      return input.recommendations.length === 0 || input.recommendations.some((recommendation) => recommendation.groupId === input.selectedGroupId);
  }
}

function hasAnswer(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.length > 0 : !!value?.trim();
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function getAge(dateValue: string) {
  if (!dateValue) {
    return null;
  }

  const birthDate = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(birthDate.getTime()) || birthDate > new Date()) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const birthdayPassed =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());

  if (!birthdayPassed) {
    age -= 1;
  }

  return age >= 0 && age <= 100 ? age : null;
}
