"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { IntakeQuestion, IntakeQuestionOption, PublicLessonTimeSuggestion, PublicProgram, StageRecommendationCondition, StageRecommendationRule } from "@/lib/public-site/tenant-site";

export type IntakeWizardCopy = {
  intakeOptionLabels: Record<string, string>;
  preferredDays: { label: string; value: string }[];
  preferredTimes: { label: string; value: string }[];
  labels: {
    age: string;
    birthdate: string;
    child: string;
    childName: string;
    chosenProgram: string;
    duration: string;
    email: string;
    extraQuestions: string;
    guardian: string;
    guardianName: string;
    intakeIntroFallback: string;
    intakeOption: string;
    missingInformation: string;
    nextStep: string;
    notes: string;
    phone: string;
    previousStep: string;
    preferredDays: string;
    preferredTimes: string;
    price: string;
    chooseLessonPreferences: string;
    lessonPreferenceHelp: string;
    lessonPreferenceLimit: string;
    recommendedLessonTimes: string;
    recommendedLessonTimesSub: string;
    recommendedStage: string;
    requiredStepError: string;
    reviewAndSubmit: string;
    select: string;
    smartScore: string;
    waitTimeNone: string;
    waitTimeShort: string;
    waitTimeLong: string;
    submitIntake: string;
    availableSpots: string;
    whyThisTime: string;
    noLessonTimes: string;
    wizardStepAdvice: string;
    wizardStepContact: string;
    wizardStepPreferences: string;
    wizardStepProgram: string;
    wizardStepQuestions: string;
    yes: string;
    no: string;
    experienceNone: string;
    experienceWaterFamiliar: string;
    experienceSome: string;
    experienceLonger: string;
  };
};

type IntakeWizardProps = {
  action: (formData: FormData) => void | Promise<void>;
  copy: IntakeWizardCopy;
  initialProgramSlug?: string | null;
  language: string;
  programs: PublicProgram[];
};

type FormValue = string | string[];

const stepKeys = ["program", "contact", "preferences", "questions", "advice"] as const;

export function IntakeWizard({ action, copy, initialProgramSlug, language, programs }: IntakeWizardProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const intakePrograms = useMemo(() => programs.filter((candidate) => Boolean(candidate.intakeConfig)), [programs]);
  const initialProgram = useMemo(
    () => (initialProgramSlug ? (intakePrograms.find((candidate) => candidate.slug === initialProgramSlug) ?? null) : null),
    [initialProgramSlug, intakePrograms]
  );
  const [selectedProgramSlug, setSelectedProgramSlug] = useState<string | null>(initialProgram?.slug ?? null);
  const [selectedIntakeType, setSelectedIntakeType] = useState<string | null>(null);
  const [selectedLessonPreferences, setSelectedLessonPreferences] = useState<string[]>([]);
  const program = useMemo(() => (selectedProgramSlug ? (intakePrograms.find((candidate) => candidate.slug === selectedProgramSlug) ?? null) : null), [intakePrograms, selectedProgramSlug]);
  const config = program?.intakeConfig ?? null;
  const activeQuestions = useMemo(() => config?.questions.filter((question) => questionIsActive(question, answerMap(values))) ?? [], [config?.questions, values]);
  const recommendation = useMemo(() => buildStageRecommendation({ program, questions: config?.questions ?? [], rules: config?.stageRecommendationRules ?? [], values }), [config?.questions, config?.stageRecommendationRules, program, values]);
  const lessonTimes = useMemo(() => (program ? rankLessonTimes({ program, recommendedStageId: recommendation.stageId, values }).slice(0, 5) : []), [program, recommendation.stageId, values]);
  const selectedLessonPreferenceDetails = useMemo(
    () =>
      selectedLessonPreferences.flatMap((slotId) => {
        const item = lessonTimes.find((candidate) => candidate.slot.groupId === slotId);

        return item
          ? [
              JSON.stringify({
                group_id: item.slot.groupId,
                group_name: item.slot.groupName,
                weekday: weekdayValue(item.slot.weekday),
                starts_at: item.slot.startsAt,
                ends_at: item.slot.endsAt,
                stage_name: item.slot.stageName,
                wait_time: item.waitTime
              })
            ]
          : [];
      }),
    [lessonTimes, selectedLessonPreferences]
  );
  const publicIntakeOptions = useMemo(() => {
    const options = config?.allowedOptions.filter((option) => option !== "waitlist") ?? [];

    return options.length > 0 ? options : ["registration"];
  }, [config?.allowedOptions]);
  const intakeType = selectedIntakeType && publicIntakeOptions.includes(selectedIntakeType) ? selectedIntakeType : (publicIntakeOptions[0] ?? "registration");
  const steps = [
    copy.labels.wizardStepProgram,
    copy.labels.wizardStepContact,
    copy.labels.wizardStepPreferences,
    copy.labels.wizardStepQuestions,
    copy.labels.wizardStepAdvice
  ];

  if (intakePrograms.length === 0) {
    return null;
  }

  const updateValues = () => {
    const form = formRef.current;

    if (!form) {
      return;
    }

    setValues(valuesFromForm(new FormData(form)));
  };

  const goToStep = (nextStep: number) => {
    updateValues();

    if (nextStep > 0 && (!program || !config)) {
      setError(copy.labels.requiredStepError);
      setStep(0);
      return;
    }

    setError(null);
    setStep(Math.max(0, Math.min(stepKeys.length - 1, nextStep)));
  };

  const chooseProgram = (slug: string) => {
    setSelectedProgramSlug(slug);
    setSelectedIntakeType(null);
    setSelectedLessonPreferences([]);
    setError(null);
  };

  const toggleLessonPreference = (slotId: string) => {
    setError(null);
    setSelectedLessonPreferences((current) => {
      const visibleSlotIds = new Set(lessonTimes.map((item) => item.slot.groupId));
      const visibleCurrent = current.filter((id) => visibleSlotIds.has(id));

      if (visibleCurrent.includes(slotId)) {
        return visibleCurrent.filter((id) => id !== slotId);
      }

      if (visibleCurrent.length >= 2) {
        setError(copy.labels.lessonPreferenceLimit);
        return visibleCurrent;
      }

      return [...visibleCurrent, slotId];
    });
  };

  const next = () => {
    const form = formRef.current;

    if (!form) {
      return;
    }

    const nextValues = valuesFromForm(new FormData(form));
    setValues(nextValues);

    if (!program || !config) {
      setStep(0);
      setError(copy.labels.requiredStepError);
      return;
    }

    const validation = validateStep(step, nextValues, config.questions.filter((question) => questionIsActive(question, answerMap(nextValues))));

    if (validation) {
      setError(validation);
      return;
    }

    setError(null);
    setStep((current) => Math.min(stepKeys.length - 1, current + 1));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step !== stepKeys.length - 1) {
      event.preventDefault();
      next();
      return;
    }

    const form = formRef.current;
    const nextValues = form ? valuesFromForm(new FormData(form)) : values;

    if (!program || !config) {
      event.preventDefault();
      setStep(0);
      setError(copy.labels.requiredStepError);
      return;
    }

    const validation = validateStep(step, nextValues, activeQuestions, selectedLessonPreferenceDetails, lessonTimes.length);

    if (validation) {
      event.preventDefault();
      setError(validation);
      return;
    }

    setError(null);
  };

  return (
    <form action={action} className="mx-auto max-w-6xl rounded-3xl border border-border bg-card p-4 shadow-card md:p-7" onChange={updateValues} onSubmit={handleSubmit} ref={formRef}>
      <input name="program_slug" type="hidden" value={program?.slug ?? ""} />
      <input name="public_language" type="hidden" value={language} />
      {selectedLessonPreferenceDetails.map((value) => (
        <input key={value} name="answer_lesson_time_preferences" type="hidden" value={value} />
      ))}

      <div className="grid gap-6">
        <header className="rounded-3xl bg-muted/55 p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.chosenProgram}</p>
              <h2 className="mt-2 text-2xl font-bold">{program?.name ?? copy.labels.wizardStepProgram}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{config?.intro ?? program?.summary ?? copy.labels.intakeIntroFallback}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <DetailPill label={copy.labels.age} value={program?.ageLabel ?? null} />
              <DetailPill label={copy.labels.duration} value={program?.durationLabel ?? null} />
              <DetailPill label={copy.labels.price} value={program?.priceLabel ?? null} />
            </div>
          </div>
          <nav aria-label="Inschrijfformulier stappen" className="mt-5 overflow-x-auto pb-1">
            <div className="grid min-w-[42rem] grid-cols-5 gap-2">
              {steps.map((label, index) => (
                <button
                  aria-current={index === step ? "step" : undefined}
                  className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-bold transition ${index === step ? "bg-primary text-[var(--primary-foreground)] shadow-glow" : "bg-background text-muted-foreground hover:bg-card hover:text-foreground"}`}
                  key={label}
                  onClick={() => goToStep(index)}
                  type="button"
                >
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs ${index === step ? "bg-white/20 text-[var(--primary-foreground)]" : "bg-primary/10 text-primary"}`}>{index + 1}</span>
                  <span className="min-w-0 leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </nav>
        </header>

        <div className="min-w-0">
          {error ? <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{error}</div> : null}

          <section className={step === 0 ? "grid gap-5" : "hidden"}>
            <PanelTitle eyebrow={`Stap 1 / ${steps.length}`} title={copy.labels.wizardStepProgram} />
            <div className="grid gap-3">
              <p className="text-sm font-semibold">{copy.labels.chosenProgram}</p>
              <div className="grid gap-2 md:grid-cols-2">
                {intakePrograms.map((candidate) => (
                  <label className={`cursor-pointer rounded-2xl border p-4 transition ${program?.slug === candidate.slug ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border bg-background hover:border-primary/40"}`} key={candidate.id}>
                    <input checked={program?.slug === candidate.slug} className="sr-only" name="program_choice" onChange={() => chooseProgram(candidate.slug)} type="radio" value={candidate.slug} />
                    <p className="font-bold">{candidate.name}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{candidate.summary ?? candidate.description ?? copy.labels.intakeIntroFallback}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <DetailPill label={copy.labels.age} value={candidate.ageLabel} />
                      <DetailPill label={copy.labels.duration} value={candidate.durationLabel} />
                      <DetailPill label={copy.labels.price} value={candidate.priceLabel} />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {program && config ? (
            <div className="grid gap-3">
              <p className="text-sm font-semibold">{copy.labels.intakeOption}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {publicIntakeOptions.map((option, index) => (
                  <label className={`cursor-pointer rounded-2xl border p-4 transition ${intakeType === option ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border bg-background hover:border-primary/40"}`} key={option}>
                    <input checked={intakeType === option} className="sr-only" name="intake_type" onChange={() => setSelectedIntakeType(option)} type="radio" value={option} />
                    <p className="font-bold">{copy.intakeOptionLabels[option] ?? option}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{index === 0 ? copy.labels.intakeIntroFallback : copy.labels.reviewAndSubmit}</p>
                  </label>
                ))}
              </div>
            </div>
            ) : null}
          </section>

          <section className={step === 1 ? "grid gap-5" : "hidden"}>
            <PanelTitle eyebrow={`Stap 2 / ${steps.length}`} title={copy.labels.wizardStepContact} />
            <FormGrid title={copy.labels.guardian}>
              <TextField label={copy.labels.guardianName} name="parent_name" />
              <TextField label={copy.labels.email} name="parent_email" />
              <TextField label={copy.labels.phone} name="parent_phone" />
            </FormGrid>
            <FormGrid title={copy.labels.child}>
              <TextField label={copy.labels.childName} name="participant_name" />
              <TextField label={copy.labels.birthdate} name="participant_birthdate" type="date" />
            </FormGrid>
          </section>

          <section className={step === 2 ? "grid gap-5" : "hidden"}>
            <PanelTitle eyebrow={`Stap 3 / ${steps.length}`} title={copy.labels.wizardStepPreferences} />
            <fieldset className="rounded-2xl border border-border p-4">
              <legend className="px-1 text-sm font-bold">{copy.labels.preferredDays}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {copy.preferredDays.map((day) => (
                  <CheckboxField key={day.value} label={day.label} name="preferred_days" value={day.value} />
                ))}
              </div>
            </fieldset>
            <fieldset className="rounded-2xl border border-border p-4">
              <legend className="px-1 text-sm font-bold">{copy.labels.preferredTimes}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
                {copy.preferredTimes.map((time) => (
                  <CheckboxField key={time.value} label={time.label} name="preferred_time_windows" value={time.value} />
                ))}
              </div>
            </fieldset>
          </section>

          <section className={step === 3 ? "grid gap-5" : "hidden"}>
            <PanelTitle eyebrow={`Stap 4 / ${steps.length}`} title={copy.labels.wizardStepQuestions} />
            {activeQuestions.length > 0 ? (
              <FormGrid title={copy.labels.extraQuestions}>
                {activeQuestions.map((question) => (
                  <QuestionField copy={copy} key={question.name} question={question} />
                ))}
              </FormGrid>
            ) : (
              <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">Geen aanvullende vragen voor deze configuratie.</div>
            )}
            <TextAreaField label={copy.labels.notes} name="notes" />
          </section>

          <section className={step === 4 ? "grid gap-5" : "hidden"}>
            <PanelTitle eyebrow={`Stap 5 / ${steps.length}`} title={copy.labels.wizardStepAdvice} />
            <div className="grid gap-4 rounded-3xl border border-primary/20 bg-primary/5 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">{copy.labels.recommendedStage}</p>
                  <h3 className="mt-1 text-2xl font-bold">{recommendation.stageLabel ?? "-"}</h3>
                </div>
              </div>
              {recommendation.missingInformation.length > 0 ? <p className="text-sm font-semibold text-amber-700">{copy.labels.missingInformation}: {recommendation.missingInformation.join(" ")}</p> : null}
              <ul className="grid gap-2 text-sm text-muted-foreground">
                {recommendation.reasons.map((reason) => (
                  <li className="flex gap-2" key={reason}>
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="font-bold">{copy.labels.recommendedLessonTimes}</h3>
                  <p className="text-sm text-muted-foreground">{copy.labels.recommendedLessonTimesSub}</p>
                  {copy.labels.lessonPreferenceHelp ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{copy.labels.lessonPreferenceHelp}</p> : null}
                </div>
              </div>
              {lessonTimes.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {lessonTimes.map((item, index) => (
                    <label className={`cursor-pointer rounded-2xl border bg-background p-4 shadow-soft transition ${selectedLessonPreferences.includes(item.slot.groupId) ? "border-primary ring-4 ring-primary/10" : "border-border hover:border-primary/40"}`} key={item.slot.groupId}>
                      <input
                        checked={selectedLessonPreferences.includes(item.slot.groupId)}
                        className="sr-only"
                        name="lesson_time_preference_marker"
                        onChange={() => toggleLessonPreference(item.slot.groupId)}
                        type="checkbox"
                        value={item.slot.groupId}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">Optie {index + 1}</span>
                        <WaitTimePill copy={copy} waitTime={item.waitTime} />
                      </div>
                      <h4 className="mt-4 font-bold">{weekdayLabel(copy, item.slot.weekday)}</h4>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {item.slot.startsAt}-{item.slot.endsAt}
                      </p>
                      <p className="mt-2 text-sm font-semibold">{item.slot.groupName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.slot.stageName}{item.slot.locationName ? ` - ${item.slot.locationName}` : ""}</p>
                      {selectedLessonPreferences.includes(item.slot.groupId) ? <p className="mt-3 text-xs font-bold text-primary">{copy.labels.chooseLessonPreferences}</p> : null}
                    </label>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">{copy.labels.noLessonTimes}</div>
              )}
            </div>
          </section>

          <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-border pt-5">
            <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold text-foreground hover:bg-muted" disabled={step === 0} onClick={() => goToStep(step - 1)} type="button">
              <ArrowLeft className="h-4 w-4" />
              {copy.labels.previousStep}
            </button>
            {step < stepKeys.length - 1 ? (
              <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-[var(--primary-foreground)] shadow-glow hover:bg-primary/90" onClick={next} type="button">
                {copy.labels.nextStep}
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-[var(--primary-foreground)] shadow-glow hover:bg-primary/90" type="submit">
                {copy.labels.submitIntake}
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

function PanelTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-primary">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-bold">{title}</h2>
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

function TextField({ label, name, type = "text" }: { label: string; name: string; type?: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} type={type} />
    </label>
  );
}

function TextAreaField({ label, name }: { label: string; name: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold md:col-span-2">
      <span>{label}</span>
      <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} />
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

function QuestionField({ copy, question }: { copy: IntakeWizardCopy; question: IntakeQuestion }) {
  const name = `answer_${question.name}`;

  if (question.type === "textarea" || question.type === "free_text") {
    return <TextAreaField label={question.label} name={name} />;
  }

  if (question.type === "single_select") {
    return <SelectQuestionField copy={copy} label={question.label} name={name} options={question.options ?? []} />;
  }

  if (question.type === "multi_select") {
    return <MultiOptionField label={question.label} name={name} options={question.options ?? []} />;
  }

  if (question.type === "yes_no") {
    return (
      <MultiOptionField
        label={question.label}
        name={name}
        options={[
          { label: copy.labels.yes, value: "yes" },
          { label: copy.labels.no, value: "no" }
        ]}
        radio
      />
    );
  }

  if (question.type === "consent") {
    return (
      <label className="flex min-h-12 items-start gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold md:col-span-2">
        <input className="mt-0.5 h-4 w-4 accent-primary" name={name} type="checkbox" value="accepted" />
        <span>
          {question.label}
          {question.helpText ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{question.helpText}</span> : null}
        </span>
      </label>
    );
  }

  if (question.type === "swim_experience_scale") {
    return (
      <MultiOptionField
        label={question.label}
        name={name}
        options={[
          { label: copy.labels.experienceNone, value: "none" },
          { label: copy.labels.experienceWaterFamiliar, value: "water_familiar" },
          { label: copy.labels.experienceSome, value: "some" },
          { label: copy.labels.experienceLonger, value: "longer" }
        ]}
        radio
      />
    );
  }

  return <TextField label={question.label} name={name} type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"} />;
}

function SelectQuestionField({ copy, label, name, options }: { copy: IntakeWizardCopy; label: string; name: string; options: IntakeQuestionOption[] }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name}>
        <option value="">{copy.labels.select}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiOptionField({ label, name, options, radio }: { label: string; name: string; options: IntakeQuestionOption[]; radio?: boolean }) {
  return (
    <fieldset className="rounded-xl border border-border bg-background p-3 md:col-span-2">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold" key={option.value}>
            <input className="h-4 w-4 accent-primary" name={name} type={radio ? "radio" : "checkbox"} value={option.value} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
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

function valuesFromForm(formData: FormData) {
  const values: Record<string, FormValue> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      continue;
    }

    if (key in values) {
      const existing = values[key];
      values[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      values[key] = value;
    }
  }

  return values;
}

function validateStep(step: number, values: Record<string, FormValue>, questions: IntakeQuestion[], selectedLessonPreferences: string[] = [], availableLessonTimeCount = 0) {
  if (step === 1) {
    if (!stringValue(values.parent_name) || !stringValue(values.parent_email) || !stringValue(values.participant_name)) {
      return "Vul minimaal naam ouder/verzorger, e-mail en naam kind in.";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(stringValue(values.parent_email))) {
      return "Vul een geldig e-mailadres in.";
    }
  }

  if (step === 2 && (arrayValue(values.preferred_days).length === 0 || arrayValue(values.preferred_time_windows).length === 0)) {
    return "Kies minimaal een voorkeursdag en een voorkeurstijd.";
  }

  if (step === 3) {
    const answers = answerMap(values);

    for (const question of questions) {
      if (!question.required || !questionIsActive(question, answers)) {
        continue;
      }

      const answer = answers[question.name];
      const answerValues = Array.isArray(answer) ? answer : answer ? [answer] : [];

      if (answerValues.length === 0 || (question.type === "consent" && !answerValues.includes("accepted"))) {
        return `${question.label} is verplicht.`;
      }
    }
  }

  if (step === 4 && availableLessonTimeCount > 0 && selectedLessonPreferences.length === 0) {
    return "Kies minimaal een voorgestelde lestijd als voorkeur.";
  }

  return null;
}

function answerMap(values: Record<string, FormValue>) {
  const answers: Record<string, FormValue> = {};

  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("answer_")) {
      answers[key.slice("answer_".length)] = value;
    }
  }

  return answers;
}

function buildStageRecommendation(input: { program: PublicProgram | null; questions: IntakeQuestion[]; rules: StageRecommendationRule[]; values: Record<string, FormValue> }) {
  if (!input.program) {
    return {
      stageId: null,
      stageLabel: null,
      score: 0,
      reasons: [],
      missingInformation: []
    };
  }

  const answers = answerMap(input.values);
  const stages = [...input.program.stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const evaluated = input.rules
    .map((rule) => evaluateStageRule(rule, stages, answers))
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .sort((left, right) => right.score - left.score);
  const best = evaluated[0] ?? null;
  const fallbackStage = stages[0] ?? null;
  const stage = best?.stage ?? fallbackStage;
  const missingInformation = input.questions.flatMap((question) => {
    if (!question.required || !questionIsActive(question, answers)) {
      return [];
    }

    return answerValues(answers[question.name]).length > 0 ? [] : [`${question.label} ontbreekt.`];
  });
  const score = Math.max(0, Math.min(100, Math.round((best?.score ?? 45) + (arrayValue(input.values.preferred_days).length > 0 ? 8 : 0) + (arrayValue(input.values.preferred_time_windows).length > 0 ? 7 : 0) - missingInformation.length * 5)));
  const reasons = [
    `${input.program.name} is gekozen als programma.`,
    stage ? `${stage.name} is nu de beste startinschatting.` : "Er is nog geen niveau beschikbaar.",
    `${arrayValue(input.values.preferred_days).length} voorkeursdag(en) en ${arrayValue(input.values.preferred_time_windows).length} tijdvak(ken) zijn meegenomen.`
  ];

  return {
    stageId: stage?.id ?? null,
    stageLabel: stage?.name ?? null,
    score,
    reasons,
    missingInformation
  };
}

function evaluateStageRule(rule: StageRecommendationRule, stages: PublicProgram["stages"], answers: Record<string, FormValue>) {
  const stage = stages.find((candidate) => (rule.stageId ? candidate.id === rule.stageId : false) || (rule.stageCode ? candidate.code === rule.stageCode : false));

  if (!stage) {
    return null;
  }

  let score = typeof rule.baseScore === "number" ? rule.baseScore : 40;

  for (const condition of rule.conditions ?? []) {
    if (matchesStageCondition(condition, answers)) {
      score += condition.points ?? 10;
    }
  }

  return { stage, score };
}

function matchesStageCondition(condition: StageRecommendationCondition, answers: Record<string, FormValue>) {
  const values = answerValues(answers[condition.question]);
  const expected = Array.isArray(condition.value) ? condition.value.map(String) : condition.value === null || typeof condition.value === "undefined" ? [] : [String(condition.value)];

  if (condition.operator === "exists") {
    return values.length > 0;
  }

  if (condition.operator === "equals") {
    return values.some((value) => expected.includes(value));
  }

  if (condition.operator === "not_equals") {
    return values.every((value) => !expected.includes(value));
  }

  if (condition.operator === "in") {
    return values.some((value) => expected.includes(value));
  }

  if (condition.operator === "contains") {
    return values.some((value) => expected.some((expectedValue) => value.toLowerCase().includes(expectedValue.toLowerCase())));
  }

  if (condition.operator === "gte" || condition.operator === "lte") {
    const numericValue = Number(values[0]);
    const numericExpected = Number(expected[0]);

    if (!Number.isFinite(numericValue) || !Number.isFinite(numericExpected)) {
      return false;
    }

    return condition.operator === "gte" ? numericValue >= numericExpected : numericValue <= numericExpected;
  }

  return false;
}

function rankLessonTimes(input: { program: PublicProgram; recommendedStageId: string | null; values: Record<string, FormValue> }) {
  const preferredDays = arrayValue(input.values.preferred_days);
  const preferredTimes = arrayValue(input.values.preferred_time_windows);
  const candidateSlots = input.recommendedStageId ? input.program.lessonTimeSuggestions.filter((slot) => slot.stageId === input.recommendedStageId) : input.program.lessonTimeSuggestions;

  return candidateSlots
    .map((slot) => {
      const weekday = weekdayValue(slot.weekday);
      const stageMatch = input.recommendedStageId ? slot.stageId === input.recommendedStageId : false;
      const dayMatch = preferredDays.includes(weekday);
      const timeMatch = preferredTimes.includes(slot.timeBucket);
      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(30 + (stageMatch ? 25 : 8) + (dayMatch ? 18 : preferredDays.length === 0 ? 8 : 0) + (timeMatch ? 16 : preferredTimes.length === 0 ? 8 : 0) + Math.min(11, slot.openSpots * 2))
        )
      );
      const reasons = [
        stageMatch ? "niveau matcht" : "niveau vraagt check",
        dayMatch ? "voorkeursdag matcht" : "andere dag",
        timeMatch ? "tijdvak matcht" : "ander tijdvak",
        `${slot.openSpots} vrije plek${slot.openSpots === 1 ? "" : "ken"}`
      ];
      const waitTime = waitTimeForSlot({ dayMatch, openSpots: slot.openSpots, score, stageMatch, timeMatch });

      return { slot, score, reasons, waitTime };
    })
    .sort((left, right) => right.score - left.score || right.slot.openSpots - left.slot.openSpots);
}

function waitTimeForSlot(input: { dayMatch: boolean; openSpots: number; score: number; stageMatch: boolean; timeMatch: boolean }): "none" | "short" | "long" {
  if (input.openSpots >= 2 && input.stageMatch && input.dayMatch && input.timeMatch && input.score >= 80) {
    return "none";
  }

  if (input.openSpots > 0 && input.score >= 58) {
    return "short";
  }

  return "long";
}

function WaitTimePill({ copy, waitTime }: { copy: IntakeWizardCopy; waitTime: "none" | "short" | "long" }) {
  const label = waitTime === "none" ? copy.labels.waitTimeNone : waitTime === "short" ? copy.labels.waitTimeShort : copy.labels.waitTimeLong;
  const className =
    waitTime === "none"
      ? "bg-emerald-50 text-emerald-700"
      : waitTime === "short"
        ? "bg-amber-50 text-amber-700"
        : "bg-rose-50 text-rose-700";

  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function questionIsActive(question: IntakeQuestion, answers: Record<string, FormValue>) {
  if (!question.condition) {
    return true;
  }

  const values = answerValues(answers[question.condition.question]);
  const expected = Array.isArray(question.condition.value) ? question.condition.value : question.condition.value ? [question.condition.value] : [];

  if (question.condition.operator === "exists") {
    return values.length > 0;
  }

  if (question.condition.operator === "equals") {
    return values.some((value) => expected.includes(value));
  }

  if (question.condition.operator === "not_equals") {
    return values.every((value) => !expected.includes(value));
  }

  if (question.condition.operator === "in") {
    return values.some((value) => expected.includes(value));
  }

  return true;
}

function answerValues(value: FormValue | undefined) {
  return arrayValue(value).filter(Boolean);
}

function stringValue(value: FormValue | undefined) {
  return Array.isArray(value) ? (value[0] ?? "").trim() : (value ?? "").trim();
}

function arrayValue(value: FormValue | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return value ? [value.trim()].filter(Boolean) : [];
}

function weekdayLabel(copy: IntakeWizardCopy, weekday: number) {
  return copy.preferredDays.find((day) => day.value === weekdayValue(weekday))?.label ?? `Dag ${weekday}`;
}

function weekdayValue(weekday: number) {
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][weekday - 1] ?? "monday";
}
