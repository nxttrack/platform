import { Archive, DatabaseBackup, Download, LockKeyhole, ShieldCheck, Trash2 } from "lucide-react";

import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  approveTenantDeletionAction,
  closeTenantAccountAction,
  finalizeTenantBackupErasureAction,
  permanentlyDeleteTenantAction,
  recordTenantStorageBackupAction,
  startTenantOffboardingAction
} from "@/lib/domain/tenant-lifecycle-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PlatformOffboardingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = createAdminClient();
  const [{ data: tenants }, { data: runs }] = await Promise.all([
    admin.from("tenants").select("id, name, slug, status").neq("status", "suspended").order("name"),
    admin
      .from("tenant_offboarding_runs")
      .select("id, tenant_id, tenant_name_snapshot, tenant_slug_snapshot, status, reason, retention_ends_at, export_completed_at, export_errors, storage_backup_reference, storage_backup_checksum, storage_backup_completed_at, erasure_error, erased_at, backup_erasure_due_at, backup_erasure_status, closed_at, created_at, tenants(name, slug)")
      .order("created_at", { ascending: false })
      .limit(30)
  ]);
  const params = (await searchParams) ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Tenant lifecycle"
        title="Gecontroleerde offboarding"
        subtitle="Export, versleutelde objectback-up, retentie, provider- en Auth-wissing en het verstrijken van back-ups zijn afzonderlijke bewijsstappen."
      />
      {getParam(params, "saved") ? <Feedback tone="success">Offboardingstap uitgevoerd en vastgelegd.</Feedback> : null}
      {getParam(params, "error") ? <Feedback tone="danger">Stap geweigerd: {getParam(params, "error")}.</Feedback> : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-lg font-bold">Nieuwe offboarding</h2>
        <form action={startTenantOffboardingAction} className="mt-4 grid gap-4 md:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="tenantId">Tenant</FieldLabel>
            <NativeSelect id="tenantId" name="tenantId" required>
              <option value="">Kies tenant</option>
              {(tenants ?? []).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="retentionDays">Actieve bewaartermijn</FieldLabel>
            <NativeSelect defaultValue="90" id="retentionDays" name="retentionDays">
              <option value="30">30 dagen</option>
              <option value="90">90 dagen</option>
              <option value="180">180 dagen</option>
              <option value="365">365 dagen</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="backupRetentionDays">Back-upuitloop</FieldLabel>
            <NativeSelect defaultValue="30" id="backupRetentionDays" name="backupRetentionDays">
              <option value="7">7 dagen</option>
              <option value="14">14 dagen</option>
              <option value="30">30 dagen</option>
              <option value="90">90 dagen</option>
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="reason">Reden</FieldLabel>
            <Input id="reason" name="reason" placeholder="Opzegging klant" />
          </Field>
          <Button className="md:col-span-4 md:w-fit" type="submit"><Archive className="size-4" />Procedure starten</Button>
        </form>
      </section>

      <div className="space-y-4">
        {(runs ?? []).map((run) => {
          const tenantRelation = Array.isArray(run.tenants) ? run.tenants[0] : run.tenants;
          const tenant = tenantRelation as { name: string; slug: string } | null;
          const name = tenant?.name ?? run.tenant_name_snapshot ?? "Verwijderde tenant";
          const slug = tenant?.slug ?? run.tenant_slug_snapshot ?? "onbekend";
          const retentionPassed = new Date(run.retention_ends_at).getTime() <= Date.now();
          const backupRetentionPassed = Boolean(run.backup_erasure_due_at && new Date(run.backup_erasure_due_at).getTime() <= Date.now());
          const exportErrors = Array.isArray(run.export_errors) ? run.export_errors : [];
          const canExport = ["requested", "export_failed", "export_ready"].includes(run.status);
          const canRecordBackup = canExport;
          const canErase = run.status === "deletion_approved" || run.status === "erasure_attention_required";

          return (
            <article className="rounded-2xl border border-border bg-card p-5" key={run.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{name}</h2>
                  <p className="text-sm text-muted-foreground">{slug} · actieve data bewaren tot {formatDate(run.retention_ends_at)}</p>
                </div>
                <StatusPill tone={statusTone(run.status)}>{run.status}</StatusPill>
              </div>

              {exportErrors.length > 0 ? <Feedback tone="danger">De laatste export is afgekeurd; er is geen downloadbaar exportbewijs vrijgegeven.</Feedback> : null}
              {run.erasure_error ? <Feedback tone="danger">Wissing gestopt: {run.erasure_error}</Feedback> : null}

              <div className="mt-4 flex flex-wrap gap-3">
                {canExport ? (
                  <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" href={`/api/platform/offboarding/${run.id}/export`}>
                    <Download className="size-4" />{run.status === "export_failed" ? "Export opnieuw uitvoeren" : "Data-export downloaden"}
                  </a>
                ) : null}
                {run.status === "export_ready" && run.storage_backup_completed_at ? (
                  <form action={closeTenantAccountAction}>
                    <input name="runId" type="hidden" value={run.id} />
                    <Button type="submit" variant="outline"><LockKeyhole className="size-4" />Account sluiten</Button>
                  </form>
                ) : null}
              </div>

              {canRecordBackup ? (
                <form action={recordTenantStorageBackupAction} className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-[1fr_1fr_auto]">
                  <Field>
                    <FieldLabel htmlFor={`backup-reference-${run.id}`}>Versleuteld back-upbewijs</FieldLabel>
                    <Input defaultValue={run.storage_backup_reference ?? ""} id={`backup-reference-${run.id}`} name="backupReference" placeholder="GitHub run/artifact of immutable archiefreferentie" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`backup-checksum-${run.id}`}>Manifest SHA-256</FieldLabel>
                    <Input defaultValue={run.storage_backup_checksum ?? ""} id={`backup-checksum-${run.id}`} minLength={64} name="backupChecksum" pattern="[a-fA-F0-9]{64}" required />
                  </Field>
                  <Button className="self-end" type="submit" variant="outline"><DatabaseBackup className="size-4" />Back-up vastleggen</Button>
                  <input name="runId" type="hidden" value={run.id} />
                  <FieldDescription className="md:col-span-3">
                    Download en verifieer eerst de versleutelde artifact uit het Storage-backuprunbook; alleen een referentie en checksum invoeren is geen vervanging voor die controle.
                  </FieldDescription>
                </form>
              ) : null}

              {run.status === "retention" ? (
                <form action={approveTenantDeletionAction} className="mt-4 grid gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 sm:grid-cols-[1fr_auto]">
                  <Field>
                    <FieldLabel htmlFor={`slug-${run.id}`}>Typ tenant-slug ter goedkeuring</FieldLabel>
                    <Input disabled={!retentionPassed} id={`slug-${run.id}`} name="confirmationSlug" placeholder={slug} required />
                  </Field>
                  <input name="runId" type="hidden" value={run.id} />
                  <Button className="self-end" disabled={!retentionPassed} type="submit" variant="outline">Definitieve verwijdering goedkeuren</Button>
                  {!retentionPassed ? <p className="text-xs text-muted-foreground sm:col-span-2">Verwijdering blijft vergrendeld tot de bewaartermijn is verstreken.</p> : null}
                </form>
              ) : null}

              {canErase ? (
                <form action={permanentlyDeleteTenantAction} className="mt-4 grid gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 sm:grid-cols-[1fr_auto]">
                  <Field>
                    <FieldLabel htmlFor={`delete-${run.id}`}>Typ “VERWIJDER {slug}”</FieldLabel>
                    <Input id={`delete-${run.id}`} name="confirmation" required />
                  </Field>
                  <input name="runId" type="hidden" value={run.id} />
                  <Button className="self-end" type="submit" variant="destructive"><Trash2 className="size-4" />{run.status === "erasure_attention_required" ? "Wissing hervatten" : "Permanent verwijderen"}</Button>
                </form>
              ) : null}

              {run.status === "backup_retention" ? (
                <form action={finalizeTenantBackupErasureAction} className="mt-4 grid gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 sm:grid-cols-[1fr_auto]">
                  <Field>
                    <FieldLabel htmlFor={`backup-expired-${run.id}`}>Typ “BACK-UPS VERSTREKEN {slug}”</FieldLabel>
                    <Input disabled={!backupRetentionPassed} id={`backup-expired-${run.id}`} name="confirmation" required />
                  </Field>
                  <input name="runId" type="hidden" value={run.id} />
                  <Button className="self-end" disabled={!backupRetentionPassed} type="submit"><ShieldCheck className="size-4" />Offboarding voltooien</Button>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Tenantdata, Storage, exclusieve Auth-accounts en providerklanten zijn gewist. De run blijft open tot de vastgelegde providerback-upuitloop op {formatDate(run.backup_erasure_due_at)} aantoonbaar verstreken is.
                  </p>
                </form>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Feedback({ children, tone }: { children: React.ReactNode; tone: "success" | "danger" }) {
  return <p className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${tone === "success" ? "border-success/20 bg-success/10 text-success" : "border-danger/20 bg-danger/10 text-danger"}`}>{children}</p>;
}

function statusTone(status: string): "success" | "danger" | "warning" | "neutral" {
  if (status === "completed" || status === "export_ready") return "success";
  if (status === "deletion_approved" || status === "erasure_attention_required" || status === "export_failed") return "danger";
  if (status === "cancelled") return "neutral";
  return "warning";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value?: string | null) {
  return value ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value)) : "onbekend";
}
