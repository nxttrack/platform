import { ArrowLeft, CheckCircle2, CircleAlert, FlaskConical, LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AdminSection, DataList, DataListRow, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DirtyForm } from "@/components/ui/dirty-form";
import {
  publishCurriculumDraftAction,
  saveCurriculumDraftStepAction,
  validateCurriculumDraftAction
} from "@/lib/domain/curriculum-actions";
import { getCurriculumWizardData } from "@/lib/domain/curriculum";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const wizardSteps = [
  { key: "framework", label: "Diplomakader" },
  { key: "stages", label: "Badjes" },
  { key: "competencies", label: "Competenties" },
  { key: "items", label: "Onderdelen" },
  { key: "policies", label: "Regels" },
  { key: "review", label: "Controle" }
] as const;
type WizardStepKey = (typeof wizardSteps)[number]["key"];

export default async function CurriculumWizardPage({
  params,
  searchParams
}: {
  params: Promise<{ versionId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { versionId } = await params;
  const [data, query] = await Promise.all([
    getCurriculumWizardData(versionId),
    searchParams ?? Promise.resolve({})
  ]);
  const step = readStep(readParam(query, "step"));
  const editId = readParam(query, "edit");
  const isDraft = data.version.status === "draft";
  const latestValidation = data.validations[0];
  const currentValidation = latestValidation?.revision === data.version.revision ? latestValidation : null;

  return (
    <div className="space-y-5">
      <Link className={cn(buttonVariants({ size: "sm", variant: "ghost" }), "w-fit")} href="/admin/programma">
        <ArrowLeft className="size-4" /> Terug naar programma’s
      </Link>
      <PageHeader
        action={<StatusPill tone={isDraft ? "warning" : "success"}>{isDraft ? `Concept · revisie ${data.version.revision}` : `Gepubliceerd · v${data.version.version_number}`}</StatusPill>}
        kicker="Leerlijnwizard"
        title={data.version.name}
        subtitle={`${data.program.name} · ${data.stages.length} badjes · ${data.items.length} onderdelen · formule ${data.version.formula_version}`}
      />
      <Feedback query={query} />
      <ol aria-label="Stappen leerlijnwizard" className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {wizardSteps.map((item, index) => {
          const active = item.key === step;
          const completed = wizardStepRank(data.version.wizard_step) > index || !isDraft;
          return (
            <li key={item.key}>
              <Link
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex min-h-14 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold transition",
                  active && "border-primary bg-primary/5 text-primary",
                  completed && !active && "border-success/30 text-success"
                )}
                href={`/admin/programma/leerlijn/${versionId}?step=${item.key}`}
              >
                {completed ? <CheckCircle2 className="size-4" /> : <span className="grid size-5 place-items-center rounded-full bg-muted text-xs">{index + 1}</span>}
                {item.label}
              </Link>
            </li>
          );
        })}
      </ol>

      {step === "framework" ? <FrameworkStep data={data} editable={isDraft} /> : null}
      {step === "stages" ? <StagesStep data={data} editable={isDraft} editId={editId} /> : null}
      {step === "competencies" ? <CompetenciesStep data={data} editable={isDraft} editId={editId} /> : null}
      {step === "items" ? <ItemsStep data={data} editable={isDraft} editId={editId} /> : null}
      {step === "policies" ? <PoliciesStep data={data} editable={isDraft} /> : null}
      {step === "review" ? <ReviewStep currentValidation={currentValidation} data={data} editable={isDraft} /> : null}
    </div>
  );
}

function FrameworkStep({ data, editable }: StepProps) {
  const framework = asRecord(asRecord(data.version.wizard_state_json).framework);
  return (
    <AdminSection title="Diplomakader en rekenbasis" description="De productprogressie blijft rating/5. Weging is expliciet; coverage blijft altijd een afzonderlijke waarde.">
      {editable ? (
        <DirtyForm action={saveCurriculumDraftStepAction} className="grid gap-4 md:grid-cols-2">
          <StepHidden data={data} step="framework" />
          <Field defaultValue={data.version.name} label="Naam leerlijnversie" name="name" required />
          <Field defaultValue={stringValue(framework.diplomaCode)} label="Diplomacode" name="diplomaCode" placeholder="A, B, C of eigen code" />
          <div className="md:col-span-2"><TextAreaField defaultValue={stringValue(framework.description)} label="Doel en context" name="description" /></div>
          <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-4 text-sm font-semibold md:col-span-2">
            <input className="size-4 accent-primary" defaultChecked={data.version.weighting_enabled} name="weightingEnabled" type="checkbox" />
            Expliciete onderdeelweging gebruiken
          </label>
          <div className="md:col-span-2"><SubmitButton>Opslaan en naar badjes</SubmitButton></div>
        </DirtyForm>
      ) : <ReadOnlyNotice />}
    </AdminSection>
  );
}

function StagesStep({ data, editable, editId }: StepProps & { editId?: string }) {
  const selected = data.stages.find((stage) => stage.id === editId);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
      <AdminSection title="Badjes en fasen" description="De volgorde bepaalt de huidige badjereis; de diplomareis omvat alle verplichte onderdelen.">
        <DataList>
          {data.stages.map((stage) => <DataListRow key={stage.id} title={stage.name} meta={`${stage.stable_key} · ${data.items.filter((item) => item.curriculum_stage_id === stage.id).length} onderdelen`} aside={editable ? <Link className="text-primary" href={`?step=stages&edit=${stage.id}`}>Bewerken</Link> : null} />)}
        </DataList>
      </AdminSection>
      <AdminSection title={selected ? "Badje bewerken" : "Badje toevoegen"} description="Een stabiele key verandert niet tussen curriculumversies.">
        {editable ? (
          <DirtyForm action={saveCurriculumDraftStepAction} className="grid gap-4">
            <StepHidden data={data} entityId={selected?.id} step="stages" />
            <Field defaultValue={selected?.name} label="Naam" name="name" required placeholder="Badje 1" />
            <Field defaultValue={selected?.stable_key} label="Stabiele key" name="stableKey" required placeholder="badje_1" />
            <TextAreaField defaultValue={selected?.description ?? undefined} label="Beschrijving" name="description" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field defaultValue={selected?.color_hex ?? "#22AEEF"} label="Kleur" name="colorHex" pattern="^#[0-9A-Fa-f]{6}$" />
              <Field defaultValue={selected?.sort_order ?? data.stages.length * 10 + 10} label="Volgorde" name="sortOrder" type="number" min={0} />
            </div>
            <SubmitButton>{selected ? "Badje bijwerken" : "Badje toevoegen"}</SubmitButton>
          </DirtyForm>
        ) : <ReadOnlyNotice />}
      </AdminSection>
    </div>
  );
}

function CompetenciesStep({ data, editable, editId }: StepProps & { editId?: string }) {
  const selected = data.competencies.find((competency) => competency.id === editId);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.72fr)]">
      <AdminSection title="Competentiematrix" description="Competenties groeperen onderdelen zonder de autoritatieve itemscore te vervangen.">
        <DataList>
          {data.competencies.map((competency) => <DataListRow key={competency.id} title={competency.name} meta={`${competency.stable_key} · ${data.itemCompetencies.filter((link) => link.competency_id === competency.id).length} koppelingen`} aside={editable ? <Link className="text-primary" href={`?step=competencies&edit=${competency.id}`}>Bewerken</Link> : null} />)}
        </DataList>
      </AdminSection>
      <AdminSection title={selected ? "Competentie bewerken" : "Competentie toevoegen"}>
        {editable ? (
          <DirtyForm action={saveCurriculumDraftStepAction} className="grid gap-4">
            <StepHidden data={data} entityId={selected?.id} step="competencies" />
            <Field defaultValue={selected?.name} label="Naam" name="name" required />
            <Field defaultValue={selected?.stable_key} label="Stabiele key" name="stableKey" required placeholder="waterveiligheid" />
            <TextAreaField defaultValue={selected?.description ?? undefined} label="Beschrijving" name="description" />
            <Field defaultValue={selected?.sort_order ?? data.competencies.length * 10 + 10} label="Volgorde" name="sortOrder" type="number" min={0} />
            <SubmitButton>{selected ? "Competentie bijwerken" : "Competentie toevoegen"}</SubmitButton>
          </DirtyForm>
        ) : <ReadOnlyNotice />}
      </AdminSection>
    </div>
  );
}

function ItemsStep({ data, editable, editId }: StepProps & { editId?: string }) {
  const selected = data.items.find((item) => item.id === editId);
  const selectedLinks = new Set(data.itemCompetencies.filter((link) => link.curriculum_item_id === selected?.id).map((link) => link.competency_id));
  const context = asRecord(selected?.context_json);
  const childInstructionVideo = asRecord(context.childInstructionVideo);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(25rem,0.85fr)]">
      <AdminSection title="Curriculumonderdelen" description="Een onderdeel heeft één stabiele identiteit; carryover verwijst later naar deze identiteit en maakt geen kopie.">
        <div className="space-y-4">
          {data.stages.map((stage) => (
            <section className="rounded-xl border border-border" key={stage.id}>
              <h3 className="border-b border-border bg-muted/30 px-4 py-3 text-sm font-bold">{stage.name}</h3>
              <DataList>
                {data.items.filter((item) => item.curriculum_stage_id === stage.id).map((item) => <DataListRow key={item.id} title={item.name} meta={`${item.mastery_threshold}/5 drempel · gewicht ${item.weight} · ${item.required_for_graduation ? "diplomavereiste" : "optioneel"}`} aside={editable ? <Link className="text-primary" href={`?step=items&edit=${item.id}`}>Bewerken</Link> : null} />)}
              </DataList>
            </section>
          ))}
        </div>
      </AdminSection>
      <AdminSection title={selected ? "Onderdeel bewerken" : "Onderdeel toevoegen"}>
        {editable && data.stages.length > 0 ? (
          <DirtyForm action={saveCurriculumDraftStepAction} className="grid gap-4">
            <StepHidden data={data} entityId={selected?.id} step="items" />
            <SelectField defaultValue={selected?.curriculum_stage_id} label="Badje" name="stageId" required>{data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</SelectField>
            <Field defaultValue={selected?.name} label="Naam" name="name" required />
            <Field defaultValue={selected ? identityKey(data, selected.identity_id) : undefined} label="Stabiele key" name="stableKey" required placeholder="drijven_rug" />
            <TextAreaField defaultValue={selected?.description ?? undefined} label="Beoordelingsomschrijving" name="description" />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField defaultValue={stringValue(context.waterDepth)} label="Waterdiepte" name="waterDepth"><option value="">Niet vastgelegd</option><option value="shallow">Ondiep</option><option value="deep">Diep</option><option value="both">Beide</option></SelectField>
              <SelectField defaultValue={stringValue(context.equipment)} label="Materiaal" name="equipment"><option value="">Niet vastgelegd</option><option value="none">Zonder hulpmiddel</option><option value="board">Plankje</option><option value="mixed">Wisselend</option></SelectField>
              <Field defaultValue={selected?.weight ?? 1} label="Gewicht" name="weight" type="number" min={0.0001} step={0.1} />
              <SelectField defaultValue={String(selected?.mastery_threshold ?? 4)} label="Beheersingsdrempel" name="masteryThreshold">{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} van 5</option>)}</SelectField>
              <Field defaultValue={selected?.sort_order ?? 10} label="Volgorde" name="sortOrder" type="number" min={0} />
              <Field defaultValue={stringValue(context.environment)} label="Omgeving/context" name="environment" />
            </div>
            <TextAreaField defaultValue={stringValue(context.notes)} label="Contextnotitie" name="contextNotes" />
            <fieldset className="rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-bold">Kinderportaal · instructievideo</legend>
              <div className="mt-2 grid gap-4">
                <Field defaultValue={stringValue(childInstructionVideo.title)} label="Kindveilige titel" name="childVideoTitle" />
                <Field defaultValue={stringValue(childInstructionVideo.url)} description="HTTPS- of interne URL naar de goedgekeurde videorendition." label="Video-URL" name="childVideoUrl" />
                <Field defaultValue={stringValue(childInstructionVideo.captionsUrl)} description="WebVTT-captions zijn verplicht vóór goedkeuring." label="Captions-URL" name="childVideoCaptionsUrl" />
                <TextAreaField defaultValue={stringValue(childInstructionVideo.transcript)} label="Transcript" name="childVideoTranscript" />
                <Checkbox defaultChecked={childInstructionVideo.status === "approved"} label="Goedgekeurd voor het kinderportaal" name="childVideoApproved" />
              </div>
            </fieldset>
            <fieldset className="rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-bold">Competenties</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{data.competencies.map((competency) => <Checkbox defaultChecked={selectedLinks.has(competency.id)} key={competency.id} label={competency.name} name="competencyIds" value={competency.id} />)}</div>
            </fieldset>
            <fieldset className="rounded-xl border border-border p-4">
              <legend className="px-1 text-sm font-bold">Bijdrage</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Checkbox defaultChecked={selected?.contributes_to_stage ?? true} label="Telt mee voor badje" name="contributesToStage" />
                <Checkbox defaultChecked={selected?.contributes_to_diploma ?? true} label="Telt mee voor diploma" name="contributesToDiploma" />
                <Checkbox defaultChecked={selected?.required_for_transition ?? true} label="Vereist voor doorstroom" name="requiredForTransition" />
                <Checkbox defaultChecked={selected?.required_for_graduation ?? true} label="Vereist voor afzwemcontrole" name="requiredForGraduation" />
              </div>
            </fieldset>
            <SubmitButton>{selected ? "Onderdeel bijwerken" : "Onderdeel toevoegen"}</SubmitButton>
          </DirtyForm>
        ) : editable ? <p className="text-sm text-muted-foreground">Voeg eerst minimaal één badje toe.</p> : <ReadOnlyNotice />}
      </AdminSection>
    </div>
  );
}

function PoliciesStep({ data, editable }: StepProps) {
  const policies = asRecord(asRecord(data.version.wizard_state_json).policies);
  return (
    <AdminSection title="Doorstroom-, afzwem- en carryoverbeleid" description="Eligibility, goedkeuring, uitvoering, afzwemcontrole en diploma-uitgifte blijven afzonderlijke states. Geen percentage verplaatst een leerling of reikt een diploma uit.">
      {editable ? (
        <DirtyForm action={saveCurriculumDraftStepAction} className="grid gap-4 md:grid-cols-2">
          <StepHidden data={data} step="policies" />
          <SelectField defaultValue={String(numberValue(policies.transitionThreshold, 4))} label="Minimale score doorstroom" name="transitionThreshold">{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} van 5</option>)}</SelectField>
          <SelectField defaultValue={String(numberValue(policies.graduationThreshold, 4))} label="Minimale score afzwemcontrole" name="graduationThreshold">{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} van 5</option>)}</SelectField>
          <Field defaultValue={numberValue(policies.coveragePercent, 100)} label="Minimale coverage (%)" name="coveragePercent" type="number" min={1} />
          <SelectField defaultValue="reference_open_items" label="Open onderdelen bij doorstroom" name="carryoverMode"><option value="reference_open_items">Verwijs naar originele onderdelen</option></SelectField>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm leading-6 md:col-span-2"><ShieldCheck className="mb-2 size-5 text-primary" />Publicatie maakt opeenvolgende transition rules met menselijke goedkeuring. Automatisch verplaatsen en automatisch diploma uitgeven staan hard uit.</div>
          <div className="md:col-span-2"><SubmitButton>Regels opbouwen en controleren</SubmitButton></div>
        </DirtyForm>
      ) : <ReadOnlyNotice />}
    </AdminSection>
  );
}

function ReviewStep({ data, editable, currentValidation }: StepProps & { currentValidation: StepProps["data"]["validations"][number] | null }) {
  const coverage = asRecord(currentValidation?.coverage_json);
  const impact = asRecord(currentValidation?.impact_json);
  const findings = arrayOfRecords(currentValidation?.findings_json);
  const stageCoverage = arrayOfRecords(coverage.stages);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        <AdminSection title="Coverage- en publicatiecontrole" description="De controle hoort bij exact deze revisie; iedere wijziging maakt opnieuw valideren verplicht.">
          {!currentValidation ? <p className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">Nog geen controle voor revisie {data.version.revision}.</p> : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2"><StatusPill tone={currentValidation.is_valid ? "success" : "danger"}>{currentValidation.is_valid ? "Publiceerbaar" : "Blokkerende bevindingen"}</StatusPill><StatusPill tone="neutral">Revisie {currentValidation.revision}</StatusPill></div>
              {findings.length ? <ul className="space-y-2">{findings.map((finding, index) => <li className="flex gap-2 rounded-xl border border-danger/20 bg-danger/5 p-3 text-sm" key={`${stringValue(finding.code)}-${index}`}><CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />{findingLabel(stringValue(finding.code), numberValue(finding.count, 0))}</li>)}</ul> : null}
              <div className="grid gap-3 md:grid-cols-2">{stageCoverage.map((stage) => <article className="rounded-xl border border-border p-4" key={stringValue(stage.stageId)}><h3 className="font-bold">{stringValue(stage.name)}</h3><p className="mt-1 text-sm text-muted-foreground">{numberValue(stage.itemCount, 0)} onderdelen · {numberValue(stage.requiredTransitionCount, 0)} voor doorstroom · {numberValue(stage.requiredDiplomaCount, 0)} voor diploma</p></article>)}</div>
              <div className="rounded-xl border border-border bg-muted/20 p-4"><p className="text-xs font-bold uppercase tracking-wider text-primary">Rekenvoorbeeld</p><p className="mt-2 text-sm leading-6">Eén onderdeel met score 5 op zes verplichte onderdelen = ongerond 1/6 van de diplomareis, weergegeven als <strong>16,7%</strong>. Coverage is dan eveneens 1/6, maar blijft een aparte metric.</p></div>
            </div>
          )}
          {editable ? <form action={validateCurriculumDraftAction} className="mt-4"><input name="versionId" type="hidden" value={data.version.id} /><Button type="submit" variant="outline"><FlaskConical className="size-4" /> Revisie valideren</Button></form> : null}
        </AdminSection>
        <AdminSection title="Impact en immutable publicatie">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Metric label="Actieve leerlingen op bronversie" value={numberValue(impact.activeEnrollmentsOnSourceVersion, 0)} />
            <Metric label="Automatische migratie" value={impact.automaticMigration === true ? "Aan" : "Uit"} />
            <Metric label="Badjes" value={data.stages.length} />
            <Metric label="Onderdelen" value={data.items.length} />
          </dl>
          {editable && data.canPublish ? (
            <div className="mt-4">
              <ConfirmActionForm
                action={publishCurriculumDraftAction}
                confirmLabel="Immutable publiceren"
                description="Na publicatie zijn curricula, regels en koppelingen immutable. Bestaande leerlingen blijven op hun huidige versie; migratie vereist een afzonderlijke impactpreview en goedkeuring."
                hiddenFields={{
                  expectedRevision: String(data.version.revision),
                  humanConfirmation: "confirmed",
                  idempotencyKey: crypto.randomUUID(),
                  versionId: data.version.id
                }}
                title="Leerlijnversie publiceren?"
                triggerLabel={<><LockKeyhole className="size-4" /> Publiceren</>}
              />
            </div>
          ) : null}
        </AdminSection>
      </div>
      <AdminSection title="Versiehistorie" description="Iedere save is persistent en optimistic-concurrency-safe.">
        <div className="space-y-2">{data.revisions.map((revision) => <div className="rounded-lg border border-border px-3 py-2 text-sm" key={revision.id}><p className="font-semibold">Revisie {revision.revision}</p><p className="text-xs text-muted-foreground">{revision.wizard_step} · {formatDateTime(revision.created_at)}</p></div>)}</div>
      </AdminSection>
    </div>
  );
}

type StepProps = { data: Awaited<ReturnType<typeof getCurriculumWizardData>>; editable: boolean };
function StepHidden({ data, step, entityId }: { data: StepProps["data"]; step: Exclude<WizardStepKey, "review">; entityId?: string }) {
  return <><input name="versionId" type="hidden" value={data.version.id} /><input name="expectedRevision" type="hidden" value={data.version.revision} /><input name="step" type="hidden" value={step} />{entityId ? <input name="entityId" type="hidden" value={entityId} /> : null}</>;
}
function Checkbox({ defaultChecked, label, name, value = "on" }: { defaultChecked: boolean; label: string; name: string; value?: string }) { return <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked={defaultChecked} name={name} type="checkbox" value={value} />{label}</label>; }
function ReadOnlyNotice() { return <p className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-4 text-sm"><LockKeyhole className="size-4 text-success" />Deze gepubliceerde versie is immutable en alleen-lezen.</p>; }
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="rounded-xl border border-border p-3"><dt className="text-xs font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-bold">{value}</dd></div>; }
function Feedback({ query }: { query: Record<string, string | string[] | undefined> }) { const error = readParam(query, "error"); const success = ["saved", "validated", "published", "created"].find((key) => readParam(query, key) === "1"); if (!error && !success) return null; return <p className={cn("rounded-xl border px-4 py-3 text-sm font-semibold", error ? "border-danger/30 bg-danger/5 text-danger" : "border-success/30 bg-success/5 text-success")}>{error ? "De actie kon niet veilig worden afgerond. Controleer de revisie en verplichte velden." : "Opgeslagen."}</p>; }
function readStep(value?: string): WizardStepKey { return wizardSteps.some((step) => step.key === value) ? value as WizardStepKey : "framework"; }
function wizardStepRank(value: string) { const index = wizardSteps.findIndex((step) => step.key === value); return index < 0 ? 0 : index; }
function readParam(query: Record<string, string | string[] | undefined>, key: string) { const value = query[key]; return Array.isArray(value) ? value[0] : value; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function arrayOfRecords(value: unknown) { return Array.isArray(value) ? value.map(asRecord) : []; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function identityKey(data: StepProps["data"], identityId: string) { return data.identities.find((identity) => identity.id === identityId)?.stable_key ?? ""; }
function findingLabel(code: string, count: number) { return ({ no_stages: "Voeg minimaal één badje toe.", no_items: "Voeg minimaal één onderdeel toe.", empty_stages: `${count} badje(s) hebben geen meetellend onderdeel.`, no_competencies: "Voeg minimaal één competentie toe.", unlinked_competencies: `${count} competentie(s) zijn nog niet gekoppeld.`, transition_gaps: "De opeenvolgende doorstroomregels zijn niet compleet.", graduation_contract_incomplete: "Coverage en menselijke afzwemcontrole moeten beide zijn vastgelegd." } as Record<string, string>)[code] ?? code; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
