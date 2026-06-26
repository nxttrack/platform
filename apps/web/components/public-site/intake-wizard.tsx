"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";

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
    recommendedLessonTimes: string;
    recommendedLessonTimesSub: string;
    recommendedStage: string;
    requiredStepError: string;
    reviewAndSubmit: string;
    select: string;
    smartScore: string;
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
  language: string;
  program: PublicProgram;
};

type FormValue = string | string[];

const stepKeys = ["program", "contact", "preferences", "questions", "advice"] as const;

export function IntakeWizard({ action, copy, language, program }: IntakeWizardProps) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, FormValue>>({});
  const config = program.intakeConfig;
  const activeQuestions = useMemo(() => config?.questions.filter((question) => questionIsActive(question, answerMap(values))) ?? [], [config?.questions, values]);
  const recommendation = useMemo(() => buildStageRecommendation({ program, questions: config?.questions ?? [], rules: config?.stageRecommendationRules ?? [], values }), [config?.questions, config?.stageRecommendationRules, program, values]);
  const lessonTimes = useMemo(() => rankLessonTimes({ copy, program, recommendedStageId: recommendation.stageId, values }).slice(0, 3), [copy, program, recommendation.stageId, values]);
  const steps = [
    copy.labels.wizardStepProgram,
    copy.labels.wizardStepContact,
    copy.labels.wizardStepPreferences,
    copy.labels.wizardStepQuestions,
    copy.labels.wizardStepAdvice
  ];

  if (!config) {
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
    setError(null);
    setStep(Math.max(0, Math.min(stepKeys.length - 1, nextStep)));
  };

  const next = () => {
    const form = formRef.current;

    if (!form) {
      return;
    }

    const nextValues = valuesFromForm(new FormData(form));
    setValues(nextValues);
    const validation = validateStep(step, nextValues, config.questions.filter((question) => questionIsActive(question, answerMap(nextValues))));

    if (validation) {
      setError(validation);
      return;
    }

    setError(null);
    setStep((current) => Math.min(stepKeys.length - 1, current + 1));
  };

  return (
    <form action={action} className="mx-auto max-w-6xl rounded-3xl border border-border bg-card p-4 shadow-card md:p-7" onChange={updateValues} ref={formRef}>
      <input name="program_slug" type="hidden" value={program.slug} />
      <input name="public_language" type="hidden" value={language} />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="rounded-3xl bg-muted/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.chosenProgram}</p>
          <h2 className="mt-2 text-2xl font-bold">{program.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{config.intro ?? program.summary ?? copy.labels.intakeIntroFallback}</p>
          <div className="mt-5 grid gap-2">
            <DetailPill label={copy.labels.age} value={program.ageLabel} />
            <DetailPill label={copy.labels.duration} value={program.durationLabel} />
            <DetailPill label={copy.labels.price} value={program.priceLabel} />
          </div>
          <div className="mt-6 grid gap-2">
            {steps.map((label, index) => (
              <button
                className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-bold transition ${index === step ? "bg-primary text-[var(--primary-foreground)] shadow-glow" : "bg-background text-muted-foreground hover:bg-card hover:text-foreground"}`}
                key={label}
                onClick={() => goToStep(index)}
                type="button"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs">{index + 1}</span>
                {label}
              </button>
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          {error ? <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">{error}</div> : null}

          <section className={step === 0 ? "grid gap-5" : "hidden"}>
            <PanelTitle eyebrow={`Stap 1 / ${steps.length}`} title={copy.labels.wizardStepProgram} />
            <label className="grid gap-2 text-sm font-semibold">
              {copy.labels.intakeOption}
              <select className="h-12 rounded-xl border border-border bg-card px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="intake_type">
                {config.allowedOptions.map((option) => (
                  <option key={option} value={option}>
                    {copy.intakeOptionLabels[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
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
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold text-[var(--primary-foreground)]">{copy.labels.smartScore}: {recommendation.score}/100</span>
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
                </div>
              </div>
              {lessonTimes.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-3">
                  {lessonTimes.map((item, index) => (
                    <article className="rounded-2xl border border-border bg-background p-4 shadow-soft" key={item.slot.groupId}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">#{index + 1}</span>
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{item.score}/100</span>
                      </div>
                      <h4 className="mt-4 font-bold">{weekdayLabel(copy, item.slot.weekday)}</h4>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {item.slot.startsAt}-{item.slot.endsAt}
                      </p>
                      <p className="mt-2 text-sm font-semibold">{item.slot.groupName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.slot.stageName}{item.slot.locationName ? ` - ${item.slot.locationName}` : ""}</p>
                      <p className="mt-3 text-xs font-bold text-primary">{copy.labels.availableSpots}: {item.slot.openSpots}/{item.slot.capacityLimit}</p>
                      <p className="mt-3 text-xs text-muted-foreground">{copy.labels.whyThisTime}: {item.reasons.join(" ")}</p>
                    </article>
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

function validateStep(step: number, values: Record<string, FormValue>, questions: IntakeQuestion[]) {
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

function buildStageRecommendation(input: { program: PublicProgram; questions: IntakeQuestion[]; rules: StageRecommendationRule[]; values: Record<string, FormValue> }) {
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

function rankLessonTimes(input: { copy: IntakeWizardCopy; program: PublicProgram; recommendedStageId: string | null; values: Record<string, FormValue> }) {
  const preferredDays = arrayValue(input.values.preferred_days);
  const preferredTimes = arrayValue(input.values.preferred_time_windows);

  return input.program.lessonTimeSuggestions
    .map((slot) => {
      const weekday = weekdayValue(slot.weekday);
      const stageMatch = input.recommendedStageId ? slot.stageId === input.recommendedStageId : false;
      const dayMatch = preferredDays.includes(weekday);
      const timeMatch = preferredTimes.includes(slot.timeBucket) || (slot.weekday >= 6 && preferredTimes.includes("weekend"));
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

      return { slot, score, reasons };
    })
    .sort((left, right) => right.score - left.score || right.slot.openSpots - left.slot.openSpots);
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
