import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface } from "@/components/admin/admin-patterns";
import { DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { createProgramAction, createProgramStageAction } from "@/lib/domain/actions";
import { getTenantCoreData } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminProgramPage({ searchParams }: PageProps) {
  const data = await getTenantCoreData();
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
          <DataList>
            {data.programs.map((program) => {
              const stages = data.stages.filter((stage) => stage.program_id === program.id);

              return (
                <DataListRow
                  key={program.id}
                  title={program.name}
                  meta={
                    <span>
                      {program.code ?? "zonder code"} · {stages.length} badje(s)
                    </span>
                  }
                  aside={<StatusPill tone={program.status === "active" ? "success" : program.status === "draft" ? "warning" : "neutral"}>{program.status}</StatusPill>}
                />
              );
            })}
          </DataList>
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
