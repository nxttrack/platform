import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface } from "@/components/admin/admin-patterns";
import { EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { WaitTimeInsight } from "@/components/admin/wait-time-insight";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { createProgramAction, createProgramStageAction } from "@/lib/domain/actions";
import { getTenantCoreData } from "@/lib/domain/core";
import { calculateWaitTimeBands } from "@/lib/domain/wait-time";
import type { WaitTimeQuery } from "@/lib/domain/wait-time-contract";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminProgramPage({ searchParams }: PageProps) {
  const data = await getTenantCoreData();
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

  return (
    <div className="space-y-5">
      <PageHeader action={<><AdminActionDrawer description="Een programma is een leertrack, los van abonnement of betaling." title="Nieuw programma" triggerLabel="Programma toevoegen" width="wide"><ProgramForm /></AdminActionDrawer><AdminActionDrawer description="Voeg een voortgangsniveau toe binnen een bestaand programma." title="Niveau toevoegen" triggerLabel="Niveau toevoegen" triggerVariant="outline"><StageForm data={data} /></AdminActionDrawer></>} kicker="Lesproces" title="Programma's en niveaus" subtitle={`Beheer de leertracks en voortgangsniveaus voor ${data.tenant.name}.`} />
      <Feedback saved={saved} error={error} />

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Programmastructuur</h2><p className="text-[13px] text-muted-foreground">Open een programma om niveaus, badges en volgorde te beheren.</p></div>
        {data.programs.length === 0 ? (
          <EmptyState>Nog geen programma's.</EmptyState>
        ) : (
          <div className="grid gap-3">
            {data.programs.map((program) => {
              const stages = data.stages.filter((stage) => stage.program_id === program.id);
              const predictions = waitTimeRows.filter((row) => row.query.programId === program.id);

              return (
                <article className="rounded-xl border border-border bg-muted/15 p-4" key={program.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{program.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{program.code ?? "zonder code"} · {stages.length} badje(s)</p>
                    </div>
                    <StatusPill tone={program.status === "active" ? "success" : program.status === "draft" ? "warning" : "neutral"}>{program.status}</StatusPill>
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
    </div>
  );
}

function ProgramForm() {
  return <DirtyForm action={createProgramAction} className="grid gap-4 sm:grid-cols-2"><Field label="Naam" name="name" required placeholder="Zwemles A" /><Field label="Code" name="code" placeholder="zwemles-a" /><SelectField label="Status" name="status"><option value="active">Actief</option><option value="draft">Concept</option><option value="archived">Gearchiveerd</option></SelectField><Field label="Volgorde" name="sortOrder" type="number" defaultValue={0} /><Field label="Min. leeftijd maanden" name="minAgeMonths" type="number" /><Field label="Max. leeftijd maanden" name="maxAgeMonths" type="number" /><div className="sm:col-span-2"><TextAreaField label="Omschrijving" name="description" placeholder="Korte uitleg voor admin en publieke programmakaarten." /></div><div className="sm:col-span-2"><SubmitButton>Programma opslaan</SubmitButton></div></DirtyForm>;
}

function StageForm({ data }: { data: Awaited<ReturnType<typeof getTenantCoreData>> }) {
  return <DirtyForm action={createProgramStageAction} className="grid gap-4 sm:grid-cols-2"><SelectField label="Programma" name="programId" required><option value="">Kies programma</option>{data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</SelectField><Field label="Naam" name="name" required placeholder="Badje 1" /><Field label="Code" name="code" placeholder="badje-1" /><Field label="Badge label" name="badgeLabel" placeholder="Waterwennen" /><Field label="Kleur" name="colorHex" placeholder="#22AEEF" /><Field label="Volgorde" name="sortOrder" type="number" defaultValue={0} /><div className="sm:col-span-2"><SubmitButton>Stage opslaan</SubmitButton></div></DirtyForm>;
}

function Feedback({ saved, error }: { saved: boolean; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Opslaan is niet gelukt.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
