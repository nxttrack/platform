import { GitBranch } from "lucide-react";
import Link from "next/link";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface } from "@/components/admin/admin-patterns";
import { EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { WaitTimeInsight } from "@/components/admin/wait-time-insight";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DirtyForm } from "@/components/ui/dirty-form";
import { createProgramAction, createProgramStageAction } from "@/lib/domain/actions";
import {
  approveCurriculumMigrationAction,
  createCurriculumDraftAction,
  executeCurriculumMigrationAction,
  previewCurriculumMigrationAction
} from "@/lib/domain/curriculum-actions";
import { getCurriculumOverviewData } from "@/lib/domain/curriculum";
import { getTenantCoreData } from "@/lib/domain/core";
import { calculateWaitTimeBands } from "@/lib/domain/wait-time";
import type { WaitTimeQuery } from "@/lib/domain/wait-time-contract";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminProgramPage({ searchParams }: PageProps) {
  const [data, curriculum] = await Promise.all([getTenantCoreData(), getCurriculumOverviewData()]);
  const waitTimeRequests: WaitTimeQuery[] = data.programs.flatMap((program): WaitTimeQuery[] => {
    const stages = data.stages.filter((stage) => stage.program_id === program.id);
    return stages.length > 0
      ? stages.map((stage) => ({ programId: program.id, stageId: stage.id }))
      : [{ programId: program.id, stageId: null }];
  });
  const waitTimeRows = await calculateWaitTimeBands({
    tenantId: data.tenant.id,
    persist: true,
    requests: waitTimeRequests
  });
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const migrationStatus = getParam(params, "migration");
  const versionById = new Map(curriculum.versions.map((version) => [version.id, version]));
  const publishedVersions = curriculum.versions.filter((version) => version.status === "published");

  return (
    <div className="space-y-5">
      <PageHeader action={<><AdminActionDrawer description="Een programma is een leertrack, los van abonnement of betaling." title="Nieuw programma" triggerLabel="Programma toevoegen" width="wide"><ProgramForm /></AdminActionDrawer><AdminActionDrawer description="Maak een persistent concept, leeg of als nieuwe versie van de laatst gepubliceerde leerlijn." title="Nieuwe leerlijnversie" triggerLabel="Leerlijn ontwerpen" triggerVariant="outline" width="wide"><CurriculumDraftForm data={data} /></AdminActionDrawer><AdminActionDrawer description="Legacy niveaus blijven beschikbaar voor bestaande niet-geversioneerde flows." title="Legacy niveau toevoegen" triggerLabel="Legacy niveau" triggerVariant="outline"><StageForm data={data} /></AdminActionDrawer></>} kicker="Lesproces" title="Programma's en leerlijnen" subtitle={`Beheer de leertracks, immutable curriculumversies en migraties voor ${data.tenant.name}.`} />
      <Feedback saved={saved} error={error} migrationStatus={migrationStatus} />

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Programmastructuur</h2><p className="text-[13px] text-muted-foreground">Open een programma om niveaus, badges en volgorde te beheren.</p></div>
        {data.programs.length === 0 ? (
          <EmptyState>Nog geen programma's.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {data.programs.map((program) => {
              const stages = data.stages.filter((stage) => stage.program_id === program.id);
              const predictions = waitTimeRows.filter((row) => row.query.programId === program.id);
              const versions = curriculum.versions.filter((version) => version.program_id === program.id);

              return (
                <article className="rounded-xl border border-border bg-muted/15 p-4" key={program.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{program.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{program.code ?? "zonder code"} · {stages.length} badje(s)</p>
                    </div>
                    <StatusPill tone={program.status === "active" ? "success" : program.status === "draft" ? "warning" : "neutral"}>{program.status}</StatusPill>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {versions.map((version) => <Link className={cn(buttonVariants({ size: "sm", variant: version.status === "draft" ? "default" : "outline" }))} href={`/admin/programma/leerlijn/${version.id}?step=${version.status === "draft" ? version.wizard_step : "review"}`} key={version.id}><GitBranch className="size-4" /> v{version.version_number} · {version.status === "draft" ? `concept r${version.revision}` : "gepubliceerd"}</Link>)}
                    {versions.length === 0 ? <span className="text-xs text-muted-foreground">Nog geen canonieke leerlijnversie.</span> : null}
                  </div>
                  <div className="mt-4 grid gap-2 lg:grid-cols-2">
                    {predictions.map(({ prediction, query }) => (
                      <div className="rounded-lg border border-border bg-card p-3" key={`${program.id}-${query.stageId ?? "program"}`}>
                        <p className="mb-2 text-xs font-bold text-foreground">
                          {query.stageId ? stages.find((stage) => stage.id === query.stageId)?.name ?? "Niveau" : "Programma algemeen"}
                        </p>
                        <WaitTimeInsight compact prediction={prediction} />
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{prediction.admin_explanation}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminListSurface>

      <AdminListSurface>
        <div className="mb-4"><h2 className="text-base font-bold">Begeleide curriculummigraties</h2><p className="text-[13px] text-muted-foreground">Een publicatie verplaatst nooit bestaande leerlingen. Preview, goedkeuring en uitvoering zijn afzonderlijke auditbare commands.</p></div>
        {publishedVersions.length >= 2 ? (
          <DirtyForm action={previewCurriculumMigrationAction} className="mb-5 grid gap-4 rounded-xl border border-border bg-muted/15 p-4 md:grid-cols-2">
            <input name="idempotencyKey" type="hidden" value={crypto.randomUUID()} />
            <SelectField label="Van versie" name="fromVersionId" required><option value="">Kies bronversie</option>{publishedVersions.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.version_number}</option>)}</SelectField>
            <SelectField label="Naar versie" name="toVersionId" required><option value="">Kies doelversie</option>{publishedVersions.map((version) => <option key={version.id} value={version.id}>{version.name} · v{version.version_number}</option>)}</SelectField>
            <div className="md:col-span-2"><TextAreaField label="Reden en changecontext" name="reason" required placeholder="Waarom is deze expliciete migratie nodig?" /></div>
            <div className="md:col-span-2"><SubmitButton>Impactpreview maken</SubmitButton></div>
          </DirtyForm>
        ) : <p className="mb-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Publiceer minimaal twee versies van hetzelfde programma om een migratie te previewen.</p>}

        <div className="grid gap-3">
          {curriculum.migrationPlans.map((plan) => {
            const impact = asRecord(plan.impact_json);
            const fromVersion = versionById.get(plan.from_version_id);
            const toVersion = versionById.get(plan.to_version_id);
            return <article className="rounded-xl border border-border p-4" key={plan.id}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold">{fromVersion?.name ?? "Bronversie"} → {toVersion?.name ?? "Doelversie"}</h3><p className="mt-1 text-xs text-muted-foreground">{plan.reason}</p></div><StatusPill tone={plan.status === "completed" ? "success" : plan.status === "approved" ? "info" : "warning"}>{plan.status}</StatusPill></div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4"><Impact label="Actieve leerlingen" value={numberValue(impact.activeEnrollments)} /><Impact label="Ongekoppelde badjes" value={numberValue(impact.unmappedCurrentStages)} /><Impact label="Ongekoppelde scores" value={numberValue(impact.unmappedAssessedItems)} /><Impact label="Gekopieerde observaties" value={numberValue(impact.copiedEffectiveObservations)} /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                {plan.status === "previewed" ? <ConfirmActionForm action={approveCurriculumMigrationAction} confirmLabel="Migratieplan goedkeuren" description="Goedkeuren verplaatst nog niets; uitvoering blijft een afzonderlijk command. Onopgeloste mappings blokkeren goedkeuring." hiddenFields={{ humanConfirmation: "confirmed", planId: plan.id }} title="Impactpreview goedkeuren?" triggerLabel="Goedkeuren" triggerVariant="outline" /> : null}
                {plan.status === "approved" ? <ConfirmActionForm action={executeCurriculumMigrationAction} confirmLabel="Migratie transactioneel uitvoeren" description="Alle geraakte actieve inschrijvingen worden gelockt. Alleen de laatste effectieve beoordelingen worden met lineage naar gelijk geïdentificeerde onderdelen overgezet; projecties worden opnieuw berekend." hiddenFields={{ humanConfirmation: "confirmed", idempotencyKey: crypto.randomUUID(), planId: plan.id }} title="Goedgekeurde migratie uitvoeren?" triggerLabel="Uitvoeren" triggerVariant="destructive" /> : null}
              </div>
            </article>;
          })}
          {curriculum.migrationPlans.length === 0 ? <EmptyState>Nog geen migratiepreviews.</EmptyState> : null}
        </div>
      </AdminListSurface>
    </div>
  );
}

function ProgramForm() {
  return <DirtyForm action={createProgramAction} className="grid gap-4 sm:grid-cols-2"><Field label="Naam" name="name" required placeholder="Zwemles A" /><Field label="Code" name="code" placeholder="zwemles-a" /><SelectField label="Status" name="status"><option value="active">Actief</option><option value="draft">Concept</option><option value="archived">Gearchiveerd</option></SelectField><Field label="Volgorde" name="sortOrder" type="number" defaultValue={0} /><Field label="Min. leeftijd maanden" name="minAgeMonths" type="number" /><Field label="Max. leeftijd maanden" name="maxAgeMonths" type="number" /><div className="sm:col-span-2"><TextAreaField label="Omschrijving" name="description" placeholder="Korte uitleg voor admin en publieke programmakaarten." /></div><div className="sm:col-span-2"><SubmitButton>Programma opslaan</SubmitButton></div></DirtyForm>;
}

function StageForm({ data }: { data: Awaited<ReturnType<typeof getTenantCoreData>> }) {
  return <DirtyForm action={createProgramStageAction} className="grid gap-4 sm:grid-cols-2"><SelectField label="Programma" name="programId" required><option value="">Kies programma</option>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</SelectField><Field label="Naam" name="name" required placeholder="Badje 1" /><Field label="Code" name="code" placeholder="badje-1" /><Field label="Badge label" name="badgeLabel" placeholder="Waterwennen" /><Field label="Kleur" name="colorHex" placeholder="#22AEEF" /><Field label="Volgorde" name="sortOrder" type="number" defaultValue={0} /><div className="sm:col-span-2"><SubmitButton>Stage opslaan</SubmitButton></div></DirtyForm>;
}

function CurriculumDraftForm({ data }: { data: Awaited<ReturnType<typeof getTenantCoreData>> }) {
  return <DirtyForm action={createCurriculumDraftAction} className="grid gap-4"><input name="idempotencyKey" type="hidden" value={crypto.randomUUID()} /><SelectField label="Programma" name="programId" required><option value="">Kies programma</option>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</SelectField><Field label="Versienaam" name="name" required placeholder="Zwem-ABC 2026" /><label className="flex min-h-12 items-center gap-3 rounded-xl border border-border px-4 text-sm font-semibold"><input className="size-4 accent-primary" defaultChecked name="cloneLatest" type="checkbox" />Kloon de laatst gepubliceerde versie indien aanwezig</label><SubmitButton>Conceptversie openen</SubmitButton></DirtyForm>;
}

function Feedback({ saved, error, migrationStatus }: { saved: boolean; error?: string; migrationStatus?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
  }

  if (migrationStatus) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Curriculummigratie: {migrationStatus}.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Opslaan is niet gelukt.</p>;
  }

  return null;
}

function Impact({ label, value }: { label: string; value: number }) { return <div className="rounded-lg bg-muted/40 px-3 py-2"><span className="block text-muted-foreground">{label}</span><strong className="mt-0.5 block text-sm text-foreground">{value}</strong></div>; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function numberValue(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
