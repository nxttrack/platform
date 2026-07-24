import { Ban, FileCheck2, FileWarning, RotateCcw } from "lucide-react";

import { ImportWizard } from "@/components/admin/import-wizard";
import { AdminSection, EmptyState } from "@/components/admin/domain-ui";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { cancelImportJobAction } from "@/lib/domain/premium-operations-actions";
import { applyImportAction, dryRunImportAction, getImportFields, rollbackImportAction, saveImportMappingAction, validateImportAction } from "@/lib/domain/import-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type ImportJob = { created_at: string; duplicate_count: number; id: string; import_type: string; invalid_count: number; mapping: Record<string, unknown>; row_count: number; source_name: string; status: string; summary: Record<string, unknown>; valid_count: number; validation_report: Record<string, unknown> };
type ErrorRow = { row_number: number; validation_errors: unknown; validation_status: string };
type ImportEvent = { created_at: string; event_type: string; details: Record<string, unknown> };

export default async function ImportsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePrivateShellContext("/admin/importeren");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { data, error } = await admin.from("import_jobs").select("id, import_type, source_name, status, row_count, valid_count, invalid_count, duplicate_count, mapping, summary, validation_report, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(`Could not load import jobs: ${error.message}`);
  const jobs = (data ?? []) as ImportJob[];
  const params = (await searchParams) ?? {};
  const selectedJobId = getParam(params, "job");
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const [errorRows, events] = selectedJob ? await Promise.all([getErrorRows(admin, tenant.id, selectedJob.id), getEvents(admin, tenant.id, selectedJob.id)]) : [[], []];
  return <div className="space-y-6"><PageHeader kicker="Onboarding & migratie" title="Herstelbare importwizard" subtitle="Upload, map, valideer en detecteer duplicaten voordat operationele data verandert." />
    {getParam(params, "saved") ? <p className="rounded-xl border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Importstap veilig uitgevoerd en geaudit.</p> : null}{getParam(params, "error") ? <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Import mislukt: {errorLabel(getParam(params, "error") ?? "")}</p> : null}
    <AdminSection title="Nieuwe import"><ImportWizard /></AdminSection>
    {selectedJob ? <ImportWorkbench job={selectedJob} errorRows={errorRows} events={events} /> : null}
    <AdminSection title="Importhistorie" description="Elke job bewaart mapping, validatie, dry-run, mutaties en rollback als audittrail.">{jobs.length ? <div className="grid gap-3">{jobs.map((job) => <article className={`rounded-2xl border p-4 ${selectedJob?.id === job.id ? "border-primary bg-primary/5" : "border-border"}`} key={job.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-foreground">{job.source_name}</h3><p className="mt-1 text-xs text-muted-foreground">{job.import_type} · {formatDate(job.created_at)}</p></div><StatusPill tone={job.status === "completed" ? "success" : job.status === "failed" || job.status === "cancelled" ? "danger" : "info"}>{job.status}</StatusPill></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><Count icon={FileCheck2} label="Geldig" value={job.valid_count} /><Count icon={FileWarning} label="Ongeldig" value={job.invalid_count} /><Count icon={RotateCcw} label="Duplicaat" value={job.duplicate_count} /><Count icon={Ban} label="Totaal" value={job.row_count} /></div><div className="mt-3 flex justify-end gap-3"><a className="text-sm font-semibold text-primary hover:underline" href={`/admin/importeren?job=${job.id}`}>Open werkbank</a>{["uploaded", "mapping", "validated", "ready", "failed"].includes(job.status) ? <form action={cancelImportJobAction}><input name="jobId" type="hidden" value={job.id} /><button className="text-sm font-semibold text-danger hover:underline" type="submit">Annuleren</button></form> : null}</div></article>)}</div> : <EmptyState>Nog geen importjobs.</EmptyState>}</AdminSection>
  </div>;
}

function ImportWorkbench({ job, errorRows, events }: { job: ImportJob; errorRows: ErrorRow[]; events: ImportEvent[] }) {
  const headers = Array.isArray(job.summary.headers) ? job.summary.headers.filter((value): value is string => typeof value === "string") : [];
  const fields = getImportFields(job.import_type);
  return <AdminSection title={`Werkbank · ${job.source_name}`} description="Volg de poorten in volgorde. Apply maakt uitsluitend nieuwe records; duplicaten worden overgeslagen.">
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <div className="space-y-4">
        <form action={saveImportMappingAction} className="rounded-2xl border border-border p-4">
          <input name="jobId" type="hidden" value={job.id} />
          <h3 className="font-bold">1. Veldmapping</h3><p className="mt-1 text-sm text-muted-foreground">Koppel canonieke NXTTRACK-velden aan de bronkolommen.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">{fields.map((field) => <label className="grid gap-1 text-sm font-semibold" key={field.key}>{field.label}{field.required ? " *" : ""}<NativeSelect name={`map_${field.key}`} defaultValue={typeof job.mapping[field.key] === "string" ? String(job.mapping[field.key]) : ""}><option value="">Niet mappen</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</NativeSelect></label>)}</div>
          <Button className="mt-4" type="submit" variant="outline">Mapping opslaan</Button>
        </form>
        <div className="grid gap-3 sm:grid-cols-3">
          <GateForm action={validateImportAction} disabled={!["mapping", "validated", "ready"].includes(job.status)} id={job.id} label="2. Valideren" />
          <GateForm action={dryRunImportAction} disabled={!["validated", "ready"].includes(job.status)} id={job.id} label="3. Dry-run" />
          <GateForm action={applyImportAction} disabled={job.status !== "ready"} id={job.id} label="4. Apply" tone="primary" />
        </div>
        {job.status === "completed" ? <form action={rollbackImportAction} className="rounded-2xl border border-warning/30 bg-warning/5 p-4"><input name="jobId" type="hidden" value={job.id} /><p className="text-sm text-muted-foreground">Rollback verwijdert uitsluitend records die door deze job zijn aangemaakt, in veilige omgekeerde volgorde.</p><Button className="mt-3" type="submit" variant="outline">Import terugdraaien</Button></form> : null}
        {errorRows.length ? <div className="rounded-2xl border border-danger/20 p-4"><h3 className="font-bold">Foutregels</h3><div className="mt-3 space-y-2">{errorRows.map((row) => <div className="rounded-lg bg-danger/5 px-3 py-2 text-sm" key={row.row_number}><span className="font-semibold">Rij {row.row_number}</span> · {formatErrors(row.validation_errors)} <StatusPill tone={row.validation_status === "duplicate" ? "warning" : "danger"}>{row.validation_status}</StatusPill></div>)}</div></div> : null}
      </div>
      <div className="rounded-2xl border border-border p-4"><h3 className="font-bold">Auditlog</h3><div className="mt-3 space-y-3">{events.map((event) => <div className="border-l-2 border-primary pl-3" key={`${event.created_at}-${event.event_type}`}><p className="text-sm font-semibold">{event.event_type}</p><p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p></div>)}</div></div>
    </div>
  </AdminSection>;
}
function GateForm({ action, disabled, id, label, tone }: { action: (data: FormData) => Promise<void>; disabled: boolean; id: string; label: string; tone?: "primary" }) { return <form action={action}><input name="jobId" type="hidden" value={id} /><Button className="w-full" disabled={disabled} type="submit" variant={tone === "primary" ? "default" : "outline"}>{label}</Button></form>; }
function Count({ icon: Icon, label, value }: { icon: typeof FileCheck2; label: string; value: number }) { return <div className="rounded-xl bg-muted p-3"><Icon className="size-4 text-primary" /><p className="mt-2 text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold text-foreground">{value}</p></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function errorLabel(value: string) { return ({ file: "kies een CSV tot 2 MB", content: "controleer headers en rijaantal", save: "job kon niet worden opgeslagen", rows: "previewregels konden niet worden opgeslagen", cancel: "annuleren is niet gelukt", invalid_rows: "los eerst alle foutregels op", apply: "apply is teruggedraaid; bekijk het auditlog" } as Record<string, string>)[value] ?? value; }
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function formatErrors(value: unknown) { return Array.isArray(value) ? value.join(", ") || "Duplicaat" : "Controle vereist"; }
async function getErrorRows(admin: ReturnType<typeof createAdminClient>, tenantId: string, jobId: string) { const { data } = await admin.from("import_rows").select("row_number, validation_errors, validation_status").eq("tenant_id", tenantId).eq("import_job_id", jobId).in("validation_status", ["invalid", "duplicate"]).order("row_number").limit(100); return (data ?? []) as ErrorRow[]; }
async function getEvents(admin: ReturnType<typeof createAdminClient>, tenantId: string, jobId: string) { const { data } = await admin.from("import_job_events").select("created_at, event_type, details").eq("tenant_id", tenantId).eq("import_job_id", jobId).order("created_at", { ascending: false }); return (data ?? []) as ImportEvent[]; }
