import {
  Activity,
  CloudCog,
  DatabaseBackup,
  HeartPulse,
  Mail,
  Plus,
  ScanSearch,
  ShieldCheck,
  Siren
} from "lucide-react";
import Link from "next/link";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PlatformTenantsTable } from "@/components/admin/resource-tables";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { PersonalizablePlatformMetrics } from "@/components/platform/personalizable-metrics";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createPlatformIncidentAction, resolvePlatformIncidentAction } from "@/lib/domain/platform-health-actions";
import { getPlatformHealthDashboard } from "@/lib/domain/platform-health";
import { cn } from "@/lib/utils";
import { getDashboardWidgetPreferences } from "@/lib/ui/dashboard-preferences";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function PlatformPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/platform");
  const params = (await searchParams) ?? {};
  const data = await getPlatformHealthDashboard();
  const widgetPreferences = await getDashboardWidgetPreferences({
    dashboardKey: "platform_command_center",
    defaults: ["organizations", "average_health", "healthy", "watch", "risk", "incidents"].map((key, position) => ({ key, position, visible: true, width: "small" as const })),
    tenantId: null,
    userId: context.user.id
  });
  const query = getParam(params, "q");
  const canManage = context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin") ?? false;
  const priorityTenants = [...data.tenants]
    .filter((tenant) => tenant.health.topActions.length)
    .sort((left, right) => left.health.score - right.health.score)
    .slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <AdminActionDrawer description="Leg een operationeel of tenantspecifiek incident vast. De wijziging wordt in de control-plane audittrail opgenomen." icon={<Siren className="size-4" />} title="Incident registreren" triggerLabel="Incident" triggerVariant="outline" width="wide">
                <IncidentForm tenants={data.tenants} />
              </AdminActionDrawer>
            ) : null}
            <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow" href="/platform/onboarding"><Plus className="size-4" />Zwemschool onboarden</Link>
          </div>
        }
        kicker={`Control plane · ${data.environment}`}
        subtitle={`Ingelogd als ${context.user.displayName ?? context.user.email ?? "platformgebruiker"}. Eén uitlegbare cockpit voor tenantgezondheid, servicebewijs, incidenten en customer success.`}
        title="Platform Command Center"
      />
      <RouteFeedback
        error={getParam(params, "error") ? "De control-plane actie kon niet veilig worden uitgevoerd." : null}
        success={successMessage(getParam(params, "saved"))}
      />

      <PersonalizablePlatformMetrics initial={widgetPreferences.map((preference) => ({
        ...preference,
        ...({
          organizations: { label: "Organisaties", value: data.tenants.length, tone: "neutral" as const },
          average_health: { label: "Gem. health", value: `${data.summary.averageScore}/100`, tone: data.summary.averageScore >= 85 ? "success" as const : "warning" as const },
          healthy: { label: "Gezond", value: data.summary.healthy, tone: "success" as const },
          watch: { label: "Aandacht", value: data.summary.watch, tone: data.summary.watch ? "warning" as const : "neutral" as const },
          risk: { label: "Risico", value: data.summary.risk, tone: data.summary.risk ? "danger" as const : "success" as const },
          incidents: { label: "Incidenten", value: data.summary.openIncidents, tone: data.summary.openIncidents ? "danger" as const : "success" as const }
        } as const)[preference.key as "organizations" | "average_health" | "healthy" | "watch" | "risk" | "incidents"]
      }))} />

      <section className="overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-950 text-white shadow-card">
        <div className="relative overflow-hidden px-5 py-6 md:px-7">
          <div aria-hidden="true" className="absolute -right-20 -top-32 size-96 rounded-full bg-blue-500/15 blur-3xl" />
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-300"><HeartPulse className="size-4" />Platformbrede Tenant Health</p>
              <h2 className="mt-2 text-3xl font-bold">Van losse controles naar gerichte customer success.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Iedere score toont tien afzonderlijke componenten en bronbewijs. Een lage score is een operationeel signaal, geen automatisch oordeel over een klant.</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <HealthCount label="Gezond" tone="success" value={data.summary.healthy} />
              <HealthCount label="Volgen" tone="warning" value={data.summary.watch} />
              <HealthCount label="Actie" tone="danger" value={data.summary.risk} />
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-slate-800 sm:grid-cols-2 xl:grid-cols-4">
          <ServiceEvidence icon={Activity} heartbeat={findHeartbeat(data.heartbeats, "runtime_monitor")} label="Runtime & cron" />
          <ServiceEvidence icon={DatabaseBackup} heartbeat={findHeartbeat(data.heartbeats, "storage_backup")} label="Storage-back-up" />
          <ServiceEvidence icon={ScanSearch} heartbeat={findHeartbeat(data.heartbeats, "clamav_scanner")} label="ClamAV scanner" />
          <ServiceEvidence icon={Mail} heartbeat={data.email.healthy ? syntheticHeartbeat(`Actief via ${data.email.provider} · ${data.email.fromEmail}`, "pass") : syntheticHeartbeat("Mailproviderconfiguratie vraagt controle.", "fail")} label="Mail delivery" />
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Prioriteiten</p><h2 className="mt-1 text-xl font-bold">Customer-success wachtrij</h2><p className="mt-1 text-sm text-muted-foreground">Laagste score eerst; iedere aanbeveling linkt naar het brongebied.</p></div>
            <StatusPill tone={priorityTenants.length ? "warning" : "success"}>{priorityTenants.length} tenants</StatusPill>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {priorityTenants.map((tenant) => (
              <article className="rounded-xl border border-border bg-muted/20 p-4" key={tenant.id}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold text-foreground">{tenant.name}</p><p className="mt-1 text-xs text-muted-foreground">{tenant.primaryDomain}</p></div>
                  <HealthScore score={tenant.health.score} status={tenant.health.status} />
                </div>
                <div className="mt-3 space-y-2">
                  {tenant.health.topActions.map((action) => (
                    <Link className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-xs transition hover:border-primary/25" href={action.actionHref} key={action.key}>
                      <span><strong className="block text-foreground">{action.label}</strong><span className="mt-0.5 block line-clamp-1 text-muted-foreground">{action.evidence}</span></span>
                      <StatusPill tone={action.score >= 60 ? "warning" : "danger"}>{action.score}</StatusPill>
                    </Link>
                  ))}
                </div>
                <Link className="mt-3 inline-flex text-xs font-bold text-primary hover:underline" href={`/platform/organisaties/${tenant.id}`}>Volledig tenantdossier openen</Link>
              </article>
            ))}
            {!priorityTenants.length ? <p className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground lg:col-span-2">Geen actuele customer-success prioriteiten.</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">Incident center</p><h2 className="mt-1 text-xl font-bold">Open incidenten</h2></div><StatusPill tone={data.incidents.length ? "danger" : "success"}>{data.incidents.length}</StatusPill></div>
          <div className="mt-4 space-y-3">
            {data.incidents.slice(0, 8).map((incident) => {
              const tenant = incident.tenant_id ? data.tenants.find((candidate) => candidate.id === incident.tenant_id) : null;
              return (
                <article className={cn("rounded-xl border p-3", incident.severity === "critical" ? "border-danger/25 bg-danger/5" : "border-border bg-muted/20")} key={incident.id}>
                  <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-foreground">{incident.title}</p><p className="mt-1 text-[11px] text-muted-foreground">{tenant?.name ?? "Platformbreed"} · {formatDateTime(incident.opened_at)}</p></div><StatusPill tone={incident.severity === "critical" ? "danger" : incident.severity === "warning" ? "warning" : "info"}>{incident.severity}</StatusPill></div>
                  <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{incident.summary}</p>
                  {canManage ? (
                    <ConfirmActionForm
                      action={resolvePlatformIncidentAction}
                      className="mt-3"
                      confirmLabel="Incident oplossen"
                      description="Bevestig alleen wanneer herstel of mitigatie is gecontroleerd. De oplossing wordt volledig geaudit."
                      hiddenFields={{ incidentId: incident.id, humanConfirmation: "resolve" }}
                      title={`${incident.title} als opgelost markeren?`}
                      triggerLabel="Opgelost"
                      triggerVariant="outline"
                    />
                  ) : null}
                </article>
              );
            })}
            {!data.incidents.length ? <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">Geen open incidenten.</p> : null}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Organisaties</p><h2 className="mt-1 text-xl font-bold">Tenantportfolio</h2><p className="mt-1 text-sm text-muted-foreground">Zoek, filter en vergelijk health, beheeractiviteit, domein en gebruikers.</p></div>
          <div className="flex gap-2"><StatusPill tone={data.platformOwners === 1 ? "success" : "warning"}>{data.platformOwners} platform owner(s)</StatusPill><StatusPill tone="info">{data.environment}</StatusPill></div>
        </div>
        <PlatformTenantsTable
          initialSearch={query}
          rows={data.tenants.map((tenant) => ({
            createdAt: tenant.createdAt,
            domain: tenant.primaryDomain,
            healthScore: tenant.health.score,
            healthStatus: tenant.health.status,
            href: `/platform/organisaties/${tenant.id}`,
            id: tenant.id,
            lastAdminLoginAt: tenant.lastAdminLoginAt,
            memberCount: tenant.memberCount,
            name: tenant.name,
            sector: sectorLabel(tenant.sector),
            slug: tenant.slug,
            status: tenant.status
          }))}
        />
      </section>
    </div>
  );
}

function IncidentForm({ tenants }: { tenants: Awaited<ReturnType<typeof getPlatformHealthDashboard>>["tenants"] }) {
  return (
    <form action={createPlatformIncidentAction} className="space-y-4">
      <SelectField label="Scope" name="tenantId" defaultValue=""><option value="">Platformbreed</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</SelectField>
      <SelectField label="Ernst" name="severity" defaultValue="warning"><option value="info">Informatie</option><option value="warning">Waarschuwing</option><option value="critical">Kritiek</option></SelectField>
      <Field label="Titel" name="title" required maxLength={160} />
      <TextAreaField label="Feiten, impact en huidige mitigatie" name="summary" required maxLength={2000} />
      <p className="rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-950"><ShieldCheck className="mr-1 inline size-4" />Registreer geen wachtwoorden, API-sleutels of medische persoonsgegevens.</p>
      <SubmitButton>Incident registreren</SubmitButton>
    </form>
  );
}

function ServiceEvidence({ heartbeat, icon: Icon, label }: { heartbeat: ReturnType<typeof findHeartbeat>; icon: typeof Activity; label: string }) {
  const state = heartbeatState(heartbeat);
  return (
    <article className="bg-slate-950 p-5">
      <div className="flex items-start justify-between gap-3"><span className={cn("grid size-10 place-items-center rounded-xl", state === "pass" ? "bg-emerald-400/10 text-emerald-300" : state === "fail" ? "bg-red-400/10 text-red-300" : "bg-amber-400/10 text-amber-300")}><Icon className="size-5" /></span><StatusPill tone={state === "pass" ? "success" : state === "fail" ? "danger" : "warning"}>{state === "pass" ? "recent groen" : state === "fail" ? "actie nodig" : "bewijs ontbreekt"}</StatusPill></div>
      <p className="mt-4 font-bold">{label}</p>
      <p className="mt-1 min-h-10 text-xs leading-5 text-slate-400">{heartbeat?.detail ?? "Nog geen service-heartbeat ontvangen."}</p>
      {heartbeat?.checked_at ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{formatDateTime(heartbeat.checked_at)}</p> : null}
    </article>
  );
}

function findHeartbeat(heartbeats: Array<{ service_key: string; status: string; detail: string; checked_at: string; expires_at: string }>, key: string) {
  return heartbeats.find((heartbeat) => heartbeat.service_key === key) ?? null;
}

function syntheticHeartbeat(detail: string, status: string) {
  return { service_key: "synthetic", detail, status, checked_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() };
}

function heartbeatState(heartbeat: ReturnType<typeof findHeartbeat>) {
  if (!heartbeat || new Date(heartbeat.expires_at) <= new Date()) return "unknown";
  return heartbeat.status;
}

function HealthCount({ label, tone, value }: { label: string; tone: "success" | "warning" | "danger"; value: number }) {
  return <div className="min-w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center"><p className={cn("text-2xl font-bold", tone === "success" ? "text-emerald-300" : tone === "warning" ? "text-amber-300" : "text-red-300")}>{value}</p><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p></div>;
}

function HealthScore({ score, status }: { score: number; status: string }) {
  return <StatusPill tone={status === "healthy" ? "success" : status === "watch" ? "warning" : "danger"}>{score}/100 · {status}</StatusPill>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function successMessage(value?: string) {
  return ({ incident: "Incident geregistreerd en toegevoegd aan tenant health.", resolved: "Incident als opgelost gemarkeerd en geaudit." } as Record<string, string>)[value ?? ""] ?? null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}

function sectorLabel(sector: string) {
  return ({ swim_school: "Zwemschool", dance_school: "Dansschool", football_school: "Voetbalschool", generic_lessons: "Lessenorganisatie", martial_arts_school: "Vechtsportschool", sports_club: "Sportclub" } as Record<string, string>)[sector] ?? sector;
}
