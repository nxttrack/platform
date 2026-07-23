import { Ban, FileCheck2, FileWarning, RotateCcw } from "lucide-react";

import { ImportWizard } from "@/components/admin/import-wizard";
import { AdminSection, EmptyState } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { cancelImportJobAction } from "@/lib/domain/premium-operations-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type ImportJob = { created_at: string; duplicate_count: number; id: string; import_type: string; invalid_count: number; row_count: number; source_name: string; status: string; valid_count: number };

export default async function ImportsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePrivateShellContext("/admin/importeren");
  const tenant = getActiveTenant(context);
  const { data, error } = await createAdminClient().from("import_jobs").select("id, import_type, source_name, status, row_count, valid_count, invalid_count, duplicate_count, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(`Could not load import jobs: ${error.message}`);
  const jobs = (data ?? []) as ImportJob[];
  const params = (await searchParams) ?? {};
  return <div className="space-y-6"><PageHeader kicker="Onboarding & migratie" title="Herstelbare importwizard" subtitle="Upload, map, valideer en detecteer duplicaten voordat operationele data verandert." />
    {getParam(params, "saved") ? <p className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Importjob veilig opgeslagen en gevalideerd.</p> : null}{getParam(params, "error") ? <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Import mislukt: {errorLabel(getParam(params, "error") ?? "")}</p> : null}
    <AdminSection title="Nieuwe import"><ImportWizard /></AdminSection>
    <AdminSection title="Importhistorie" description="Gevalideerde jobs zijn een preview. Annuleren verwijdert geen bronbewijs en wijzigt geen operationele gegevens.">{jobs.length ? <div className="grid gap-3">{jobs.map((job) => <article className="rounded-2xl border border-border p-4" key={job.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{job.source_name}</h3><p className="mt-1 text-xs text-muted-foreground">{job.import_type} · {formatDate(job.created_at)}</p></div><StatusPill tone={job.status === "completed" ? "success" : job.status === "failed" || job.status === "cancelled" ? "danger" : "info"}>{job.status}</StatusPill></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Count icon={FileCheck2} label="Geldig" value={job.valid_count} /><Count icon={FileWarning} label="Ongeldig" value={job.invalid_count} /><Count icon={RotateCcw} label="Duplicaat" value={job.duplicate_count} /><Count icon={Ban} label="Totaal" value={job.row_count} /></div>{["uploaded", "mapping", "validated", "ready", "failed"].includes(job.status) ? <form action={cancelImportJobAction} className="mt-3 text-right"><input name="jobId" type="hidden" value={job.id} /><button className="text-sm font-semibold text-danger hover:underline" type="submit">Import annuleren</button></form> : null}</article>)}</div> : <EmptyState>Nog geen importjobs.</EmptyState>}</AdminSection>
  </div>;
}
function Count({ icon: Icon, label, value }: { icon: typeof FileCheck2; label: string; value: number }) { return <div className="rounded-xl bg-muted p-3"><Icon className="size-4 text-primary" /><p className="mt-2 text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold text-foreground">{value}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function errorLabel(value: string) { return ({ file: "kies een CSV tot 2 MB", content: "controleer headers en rijaantal", save: "job kon niet worden opgeslagen", rows: "previewregels konden niet worden opgeslagen", cancel: "annuleren is niet gelukt" } as Record<string, string>)[value] ?? value; }
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
