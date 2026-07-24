import { Archive, Download, LockKeyhole, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { approveTenantDeletionAction, closeTenantAccountAction, permanentlyDeleteTenantAction, startTenantOffboardingAction } from "@/lib/domain/tenant-lifecycle-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function PlatformOffboardingPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = createAdminClient();
  const [{ data: tenants }, { data: runs }] = await Promise.all([
    admin.from("tenants").select("id, name, slug, status").neq("status", "suspended").order("name"),
    admin.from("tenant_offboarding_runs").select("id, tenant_id, status, reason, retention_ends_at, export_completed_at, closed_at, created_at, tenants(name, slug)").order("created_at", { ascending: false }).limit(30)
  ]);
  const params = (await searchParams) ?? {};
  return <div className="space-y-6">
    <PageHeader kicker="Tenant lifecycle" title="Gecontroleerde offboarding" subtitle="Exporteer eerst, sluit daarna, respecteer de bewaartermijn en verwijder alleen met dubbele ownerbevestiging." />
    {getParam(params, "saved") ? <p className="rounded-xl border border-success/20 bg-success/10 p-3 text-sm font-semibold text-success">Offboardingstap uitgevoerd en vastgelegd.</p> : null}
    {getParam(params, "error") ? <p className="rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm font-semibold text-danger">Stap geweigerd: {getParam(params, "error")}.</p> : null}
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Nieuwe offboarding</h2>
      <form action={startTenantOffboardingAction} className="mt-4 grid gap-4 md:grid-cols-3">
        <Field><FieldLabel htmlFor="tenantId">Tenant</FieldLabel><NativeSelect id="tenantId" name="tenantId" required><option value="">Kies tenant</option>{(tenants ?? []).map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}</NativeSelect></Field>
        <Field><FieldLabel htmlFor="retentionDays">Bewaartermijn</FieldLabel><NativeSelect defaultValue="90" id="retentionDays" name="retentionDays"><option value="30">30 dagen</option><option value="90">90 dagen</option><option value="180">180 dagen</option><option value="365">365 dagen</option></NativeSelect></Field>
        <Field><FieldLabel htmlFor="reason">Reden</FieldLabel><Input id="reason" name="reason" placeholder="Opzegging klant" /></Field>
        <Button className="md:col-span-3 md:w-fit" type="submit"><Archive className="size-4" />Procedure starten</Button>
      </form>
    </section>
    <div className="space-y-4">{(runs ?? []).map((run) => {
      const tenantRelation = Array.isArray(run.tenants) ? run.tenants[0] : run.tenants;
      const tenant = tenantRelation as { name: string; slug: string } | null;
      const retentionPassed = new Date(run.retention_ends_at).getTime() <= Date.now();
      return <article className="rounded-2xl border border-border bg-card p-5" key={run.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{tenant?.name ?? "Verwijderde tenant"}</h2><p className="text-sm text-muted-foreground">{tenant?.slug ?? run.tenant_id} · bewaren tot {formatDate(run.retention_ends_at)}</p></div><StatusPill tone={run.status === "deletion_approved" ? "danger" : run.status === "export_ready" ? "success" : "warning"}>{run.status}</StatusPill></div>
        <div className="mt-4 flex flex-wrap gap-3">
          {["requested", "export_ready"].includes(run.status) ? <a className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" href={`/api/platform/offboarding/${run.id}/export`}><Download className="size-4" />Data-export downloaden</a> : null}
          {run.status === "export_ready" ? <form action={closeTenantAccountAction}><input name="runId" type="hidden" value={run.id} /><Button type="submit" variant="outline"><LockKeyhole className="size-4" />Account sluiten</Button></form> : null}
        </div>
        {run.status === "retention" ? <form action={approveTenantDeletionAction} className="mt-4 grid gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 sm:grid-cols-[1fr_auto]"><Field><FieldLabel htmlFor={`slug-${run.id}`}>Typ tenant-slug ter goedkeuring</FieldLabel><Input disabled={!retentionPassed} id={`slug-${run.id}`} name="confirmationSlug" placeholder={tenant?.slug} required /></Field><input name="runId" type="hidden" value={run.id} /><Button className="self-end" disabled={!retentionPassed} type="submit" variant="outline">Definitieve verwijdering goedkeuren</Button>{!retentionPassed ? <p className="text-xs text-muted-foreground sm:col-span-2">Verwijdering blijft vergrendeld tot de bewaartermijn is verstreken.</p> : null}</form> : null}
        {run.status === "deletion_approved" ? <form action={permanentlyDeleteTenantAction} className="mt-4 grid gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4 sm:grid-cols-[1fr_auto]"><Field><FieldLabel htmlFor={`delete-${run.id}`}>Typ “VERWIJDER {tenant?.slug}”</FieldLabel><Input id={`delete-${run.id}`} name="confirmation" required /></Field><input name="runId" type="hidden" value={run.id} /><Button className="self-end" type="submit" variant="destructive"><Trash2 className="size-4" />Permanent verwijderen</Button></form> : null}
      </article>;
    })}</div>
  </div>;
}
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(value)); }
