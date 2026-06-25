import { Activity, Globe2, Layers3, Rocket, Search, Server, Settings } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { updateIntegrationStatusAction, updatePlatformSettingsAction, upsertSectorTemplateAction } from "@/lib/platform-admin/platform-completion-actions";
import type { PlatformCompletionSnapshot, PlatformIntegrationStatusRow, PlatformSettingsRow, SectorTemplateRow } from "@/lib/platform-admin/platform-completion-read-model";

const sectorLabels: Record<string, string> = {
  swim_school: "Zwemschool",
  football_school: "Voetbalschool",
  sports_club: "Sportclub",
  martial_arts_school: "Vechtsport",
  dance_school: "Dansschool",
  generic_lessons: "Generieke lessen"
};

export function PlatformSettingsCompletionPage({
  snapshot,
  notice,
  error
}: {
  snapshot: PlatformCompletionSnapshot;
  notice?: string | null;
  error?: string | null;
}) {
  if (snapshot.status === "not_configured" || snapshot.status === "no_access") {
    return <FallbackPage title="Platform instellingen" snapshot={snapshot} />;
  }

  const readySnapshot = snapshot as Extract<PlatformCompletionSnapshot, { status: "ready" | "query_error" }>;
  const domainTotals = readySnapshot.tenants.reduce(
    (totals, tenant) => {
      for (const domain of tenant.domains) {
        totals.total += 1;
        totals[domain.status as "pending" | "verified" | "disabled"] = (totals[domain.status as "pending" | "verified" | "disabled"] ?? 0) + 1;
      }
      return totals;
    },
    { total: 0, pending: 0, verified: 0, disabled: 0 }
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Platformbeheer"
        title="Instellingen, status en audit"
        subtitle="Globale platforminstellingen, tenant search, domeinstatus, integratiestatus en audit in één platform-only werkplek."
        action={<StatusPill tone={snapshot.status === "ready" ? "success" : "warning"}>{snapshot.status}</StatusPill>}
      />
      <Flash notice={notice} error={error} errors={snapshot.errors} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Tenants" value={readySnapshot.tenants.length} detail="zoekresultaat" />
        <MetricCard label="Domeinen" value={domainTotals.total} detail={`${domainTotals.verified} verified`} tone={domainTotals.pending > 0 ? "warning" : "success"} />
        <MetricCard label="Integraties" value={readySnapshot.integrations.length} detail={`${readySnapshot.integrations.filter((item) => item.status === "ready").length} ready`} />
        <MetricCard label="Audit" value={readySnapshot.audit.length} detail="laatste events" />
      </div>

      <PlatformSettingsCard settings={readySnapshot.settings} />
      <ReleaseMetadataCard snapshot={readySnapshot} />
      <ObservabilityStatusCard snapshot={readySnapshot} />
      <IntegrationStatusGrid integrations={readySnapshot.integrations} />

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <TenantSearchCard snapshot={readySnapshot} />
        <AuditSearchCard snapshot={readySnapshot} />
      </div>
    </div>
  );
}

export function PlatformTemplatesCompletionPage({
  snapshot,
  notice,
  error
}: {
  snapshot: PlatformCompletionSnapshot;
  notice?: string | null;
  error?: string | null;
}) {
  if (snapshot.status === "not_configured" || snapshot.status === "no_access") {
    return <FallbackPage title="Sector templates" snapshot={snapshot} />;
  }

  const readySnapshot = snapshot as Extract<PlatformCompletionSnapshot, { status: "ready" | "query_error" }>;

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Platformbeheer"
        title="Sector templates"
        subtitle="Beheer sectorlabels, feature flags en onboarding-checklists zonder swim-first kernmodellen te hardcoden."
        action={<StatusPill tone="info">{readySnapshot.templates.length} templates</StatusPill>}
      />
      <Flash notice={notice} error={error} errors={readySnapshot.errors} />

      <Card>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Nieuwe sector template</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gebruik key=value regels voor terminologie en feature flags.</p>
          </div>
          <Layers3 className="h-5 w-5 text-primary" />
        </div>
        <SectorTemplateForm />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {readySnapshot.templates.length === 0 ? (
          <Card>
            <p className="text-sm font-semibold">Nog geen sector templates.</p>
          </Card>
        ) : (
          readySnapshot.templates.map((template) => (
            <Card key={template.id}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold">{template.name}</h2>
                    <StatusPill tone={statusTone(template.status)}>{template.status}</StatusPill>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sectorLabels[template.sector] ?? template.sector} - {template.code}
                  </p>
                </div>
                <StatusPill tone="neutral">{template.default_locale}</StatusPill>
              </div>
              <SectorTemplateForm template={template} />
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function ReleaseMetadataCard({ snapshot }: { snapshot: Extract<PlatformCompletionSnapshot, { status: "ready" | "query_error" }> }) {
  const release = snapshot.runtimeRelease;

  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Deployment release metadata</h2>
          <p className="mt-1 text-sm text-muted-foreground">Actuele runtime metadata en laatste geverifieerde releases vanuit de GitHub runner.</p>
        </div>
        <Rocket className="h-5 w-5 text-primary" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <MiniInfo label="Environment" value={release.environment} />
        <MiniInfo label="Commit" value={shortCommit(release.commit)} />
        <MiniInfo label="Target" value={release.deploymentTarget ?? "onbekend"} />
        <MiniInfo label="Build" value={release.builtAt ? formatDate(release.builtAt) : "onbekend"} />
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border">
        <div className="grid grid-cols-[1fr_120px_110px_100px] gap-3 bg-muted px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <span>Release</span>
          <span>Status</span>
          <span>Health</span>
          <span>Run</span>
        </div>
        {snapshot.releases.length === 0 ? (
          <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">Nog geen release-records. De deploy runner vult dit na activatie/health verification.</p>
        ) : (
          snapshot.releases.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_120px_110px_100px] gap-3 border-t border-border px-4 py-3 text-sm">
              <div>
                <p className="font-semibold">{shortCommit(item.commit_sha)}</p>
                <p className="text-xs text-muted-foreground">{item.environment} - {item.deployment_target ?? "target onbekend"} - {item.created_at ? formatDate(item.created_at) : ""}</p>
              </div>
              <StatusPill tone={item.status === "verified" ? "success" : item.status === "failed" ? "danger" : "info"}>{item.status}</StatusPill>
              <StatusPill tone={item.health_status === "ready" || item.health_status === "healthy" ? "success" : item.health_status === "failed" ? "danger" : "warning"}>{item.health_status}</StatusPill>
              <span className="text-xs text-muted-foreground">#{item.github_run_number ?? item.github_run_id}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function ObservabilityStatusCard({ snapshot }: { snapshot: Extract<PlatformCompletionSnapshot, { status: "ready" | "query_error" }> }) {
  const observability = snapshot.observability;

  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Observability runtime</h2>
          <p className="mt-1 text-sm text-muted-foreground">Monitorbare endpoints, externe log sink en error reporting configuratie zonder secrets te tonen.</p>
        </div>
        <Server className="h-5 w-5 text-primary" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <RuntimeStatusItem title="Structured logs" configured={observability.logSink.configured} detail={`${observability.logSink.provider} ${observability.logSink.endpointHost ?? ""}`} />
        <RuntimeStatusItem title="Error reporting" configured={observability.errorReporting.configured} detail={`${observability.errorReporting.provider} ${observability.errorReporting.endpointHost ?? ""}`} />
        <RuntimeStatusItem title="Uptime monitor" configured={observability.uptime.externalMonitorConfigured} detail={`${observability.uptime.healthPath} + ${observability.uptime.readyPath}`} />
      </div>
    </Card>
  );
}

function PlatformSettingsCard({ settings }: { settings: PlatformSettingsRow | null }) {
  const value = settings ?? {
    platform_name: "NXTTRACK",
    default_locale: "nl-NL",
    default_timezone: "Europe/Amsterdam",
    support_email: "support@nxttrack.nl",
    tenant_domain_suffix: "staging.nxttrack.nl",
    staging_domain: "staging.nxttrack.nl",
    production_domain: "nxttrack.nl",
    maintenance_mode: false,
    signup_mode: "invite_only",
    release_channel: "staging"
  };

  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Globale platforminstellingen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Basisconfiguratie voor releasekanaal, domeinen, support en toegang.</p>
        </div>
        <Settings className="h-5 w-5 text-primary" />
      </div>
      <form action={updatePlatformSettingsAction} className="grid gap-3 lg:grid-cols-4">
        <TextInput label="Platform naam" name="platform_name" defaultValue={value.platform_name} required />
        <TextInput label="Locale" name="default_locale" defaultValue={value.default_locale} required />
        <TextInput label="Timezone" name="default_timezone" defaultValue={value.default_timezone} required />
        <TextInput label="Support e-mail" name="support_email" defaultValue={value.support_email ?? ""} type="email" />
        <TextInput label="Tenant domeinsuffix" name="tenant_domain_suffix" defaultValue={value.tenant_domain_suffix ?? ""} />
        <TextInput label="Staging domein" name="staging_domain" defaultValue={value.staging_domain ?? ""} />
        <TextInput label="Productie domein" name="production_domain" defaultValue={value.production_domain ?? ""} />
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signup modus</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={value.signup_mode} name="signup_mode">
            <option value="invite_only">Alleen uitnodiging</option>
            <option value="request_access">Aanvraag toestaan</option>
            <option value="open">Open</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Release kanaal</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={value.release_channel} name="release_channel">
            <option value="staging">Staging</option>
            <option value="production">Production</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </label>
        <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm lg:mt-5">
          <input defaultChecked={value.maintenance_mode} name="maintenance_mode" type="checkbox" />
          Maintenance mode
        </label>
        <div className="flex items-end lg:col-span-2">
          <button className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow" type="submit">
            Instellingen opslaan
          </button>
        </div>
      </form>
    </Card>
  );
}

function RuntimeStatusItem({ title, configured, detail }: { title: string; configured: boolean; detail: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold">{title}</p>
        <StatusPill tone={configured ? "success" : "warning"}>{configured ? "configured" : "missing"}</StatusPill>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail || "Geen endpoint geconfigureerd"}</p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-bold">{value}</p>
    </div>
  );
}

function IntegrationStatusGrid({ integrations }: { integrations: PlatformIntegrationStatusRow[] }) {
  return (
    <Card>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Globale domein- en integratiestatus</h2>
          <p className="mt-1 text-sm text-muted-foreground">Handmatige platformstatus voor SMTP, SendGrid, Supabase, Mollie, VPS/Caddy en runner checks.</p>
        </div>
        <Activity className="h-5 w-5 text-primary" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {integrations.map((integration) => (
          <form key={integration.id} action={updateIntegrationStatusAction} className="rounded-2xl border border-border bg-background p-4">
            <input name="id" type="hidden" value={integration.id} />
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold">{integration.label}</p>
                <p className="text-xs text-muted-foreground">
                  {integration.category} - {integration.integration_key}
                </p>
              </div>
              <StatusPill tone={statusTone(integration.status)}>{integration.status}</StatusPill>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <select className="h-10 rounded-xl border border-border bg-card px-3 text-sm" defaultValue={integration.status} name="status">
                <option value="unknown">Unknown</option>
                <option value="ready">Ready</option>
                <option value="warning">Warning</option>
                <option value="incident">Incident</option>
                <option value="disabled">Disabled</option>
              </select>
              <select className="h-10 rounded-xl border border-border bg-card px-3 text-sm" defaultValue={integration.mode} name="mode">
                <option value="staging">Staging</option>
                <option value="production">Production</option>
                <option value="global">Global</option>
              </select>
              <input className="h-10 rounded-xl border border-border bg-card px-3 text-sm md:col-span-2" defaultValue={integration.endpoint_label ?? ""} name="endpoint_label" placeholder="Endpoint/secret/check" />
              <input className="h-10 rounded-xl border border-border bg-card px-3 text-sm md:col-span-2" defaultValue={integration.last_error ?? ""} name="last_error" placeholder="Laatste fout of opmerking" />
              <input className="h-10 rounded-xl border border-border bg-card px-3 text-sm md:col-span-2" defaultValue={integration.runbook_url ?? ""} name="runbook_url" placeholder="Runbook URL" />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Laatste check: {integration.last_checked_at ? formatDate(integration.last_checked_at) : "nog niet"}</span>
              <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted" type="submit">
                Status opslaan
              </button>
            </div>
          </form>
        ))}
      </div>
    </Card>
  );
}

function TenantSearchCard({ snapshot }: { snapshot: Extract<PlatformCompletionSnapshot, { status: "ready" | "query_error" }> }) {
  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Tenant search</h2>
          <p className="mt-1 text-sm text-muted-foreground">Zoek tenant, sector, status, domeinen en tenant owners.</p>
        </div>
        <Search className="h-5 w-5 text-primary" />
      </div>
      <form className="mb-4 grid gap-3 md:grid-cols-[1fr_150px_130px_auto]">
        <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={snapshot.filters.query} name="query" placeholder="Zoek naam of slug" />
        <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={snapshot.filters.sector} name="sector">
          <option value="">Alle sectoren</option>
          {Object.entries(sectorLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={snapshot.filters.status} name="status">
          <option value="">Alle statussen</option>
          <option value="active">Actief</option>
          <option value="inactive">Inactief</option>
          <option value="suspended">Geschorst</option>
        </select>
        <button className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white" type="submit">
          Filter
        </button>
      </form>
      <div className="space-y-3">
        {snapshot.tenants.map((tenant) => (
          <div key={tenant.id} className="rounded-2xl border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{tenant.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tenant.slug} - {sectorLabels[tenant.sector] ?? tenant.sector} - {tenant.super_admin_count} owner(s)
                </p>
              </div>
              <StatusPill tone={tenant.status === "active" ? "success" : "warning"}>{tenant.status}</StatusPill>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {tenant.domains.length === 0 ? (
                <span className="text-xs text-muted-foreground">Geen domeinen</span>
              ) : (
                tenant.domains.map((domain) => (
                  <span key={domain.hostname} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    <Globe2 className="h-3 w-3" />
                    {domain.hostname} ({domain.status})
                  </span>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AuditSearchCard({ snapshot }: { snapshot: Extract<PlatformCompletionSnapshot, { status: "ready" | "query_error" }> }) {
  const tables = [...new Set(snapshot.audit.map((row) => row.source_table))].sort();
  return (
    <Card>
      <h2 className="text-lg font-bold">Audit search</h2>
      <p className="mt-1 text-sm text-muted-foreground">Laatste platform- en tenantmutaties. Filter op source table.</p>
      <form className="mt-4 flex gap-3">
        <input type="hidden" name="query" value={snapshot.filters.query} />
        <input type="hidden" name="sector" value={snapshot.filters.sector} />
        <input type="hidden" name="status" value={snapshot.filters.status} />
        <select className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm" defaultValue={snapshot.filters.auditTable} name="auditTable">
          <option value="">Alle tabellen</option>
          {tables.map((table) => (
            <option key={table} value={table}>
              {table}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white" type="submit">
          Audit filter
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {snapshot.audit.length === 0 ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Geen audit events gevonden.</p>
        ) : (
          snapshot.audit.map((event) => (
            <div key={event.id} className="rounded-2xl border border-border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {event.source_table} - {event.action}
                </p>
                <StatusPill tone={event.risk_level === "critical" ? "danger" : event.risk_level === "sensitive" ? "warning" : "neutral"}>{event.risk_level}</StatusPill>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.tenant_name ?? "platform scope"} - {formatDate(event.created_at)}
              </p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function SectorTemplateForm({ template }: { template?: SectorTemplateRow }) {
  return (
    <form action={upsertSectorTemplateAction} className="grid gap-3">
      {template ? <input name="id" type="hidden" value={template.id} /> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sector</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" defaultValue={template?.sector ?? "swim_school"} name="sector">
            {Object.entries(sectorLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <TextInput label="Code" name="code" defaultValue={template?.code ?? ""} required />
        <TextInput label="Naam" name="name" defaultValue={template?.name ?? ""} required />
      </div>
      <TextInput label="Omschrijving" name="description" defaultValue={template?.description ?? ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</span>
          <select className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" defaultValue={template?.status ?? "draft"} name="status">
            <option value="draft">Draft</option>
            <option value="active">Actief</option>
            <option value="archived">Gearchiveerd</option>
          </select>
        </label>
        <TextInput label="Locale" name="default_locale" defaultValue={template?.default_locale ?? "nl-NL"} required />
      </div>
      <TextareaInput label="Terminologie" name="terminology_text" defaultValue={toKeyValue(template?.terminology)} placeholder="participant=leerling\nguardian=ouder/verzorger\ninstructor=instructeur" />
      <TextareaInput label="Feature flags" name="feature_flags_text" defaultValue={toKeyValue(template?.feature_flags)} placeholder="public_site=true\nintake=true\nmanual_payments=true" />
      <TextareaInput label="Onboarding checklist" name="onboarding_checklist_text" defaultValue={(template?.onboarding_checklist ?? []).join("\n")} placeholder="Branding instellen\nProgrammas controleren\nSMTP testen" />
      <button className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-glow" type="submit">
        Template opslaan
      </button>
    </form>
  );
}

function Flash({ notice, error, errors }: { notice?: string | null; error?: string | null; errors: string[] }) {
  return (
    <>
      {notice ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{notice}</div> : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div> : null}
      {errors.length > 0 ? (
        <Card>
          <h2 className="text-sm font-semibold">Aandacht nodig</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {errors.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function FallbackPage({ title, snapshot }: { title: string; snapshot: Extract<PlatformCompletionSnapshot, { status: "not_configured" | "no_access" }> }) {
  return (
    <div>
      <PageHeader kicker="Platformbeheer" title={title} subtitle={snapshot.error} action={<StatusPill tone="warning">{snapshot.status}</StatusPill>} />
    </div>
  );
}

function MetricCard({ label, value, detail, tone = "info" }: { label: string; value: number; detail: string; tone?: "success" | "warning" | "info" }) {
  const tones = {
    success: "text-emerald-700",
    warning: "text-amber-700",
    info: "text-foreground"
  };
  return (
    <Card>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tones[tone]}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </Card>
  );
}

function TextInput({ label, name, defaultValue, type = "text", required = false }: { label: string; name: string; defaultValue: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <input className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none ring-primary/20 focus:ring-4" defaultValue={defaultValue} name={name} required={required} type={type} />
    </label>
  );
}

function TextareaInput({ label, name, defaultValue, placeholder }: { label: string; name: string; defaultValue: string; placeholder: string }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <textarea className="mt-1 min-h-28 w-full rounded-xl border border-border bg-background px-3 py-3 font-mono text-xs outline-none ring-primary/20 focus:ring-4" defaultValue={defaultValue} name={name} placeholder={placeholder} />
    </label>
  );
}

function statusTone(status: string) {
  if (status === "ready" || status === "active") return "success";
  if (status === "incident" || status === "archived") return "danger";
  if (status === "warning" || status === "draft") return "warning";
  return "neutral";
}

function toKeyValue(value: Record<string, string | boolean> | undefined) {
  return Object.entries(value ?? {})
    .map(([key, item]) => `${key}=${item}`)
    .join("\n");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function shortCommit(value: string | null) {
  return value ? value.slice(0, 7) : "onbekend";
}
