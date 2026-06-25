import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getObservabilityRuntimeStatus, type ObservabilityRuntimeStatus } from "@/lib/observability/config";
import { getReleaseMetadata, type ReleaseMetadata } from "@/lib/observability/release";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type PlatformSettingsRow = {
  id: string;
  platform_name: string;
  default_locale: string;
  default_timezone: string;
  support_email: string | null;
  tenant_domain_suffix: string | null;
  staging_domain: string | null;
  production_domain: string | null;
  maintenance_mode: boolean;
  signup_mode: string;
  release_channel: string;
  updated_at: string;
};

export type SectorTemplateRow = {
  id: string;
  sector: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  default_locale: string;
  terminology: Record<string, string>;
  feature_flags: Record<string, boolean>;
  onboarding_checklist: string[];
  updated_at: string;
};

export type PlatformIntegrationStatusRow = {
  id: string;
  integration_key: string;
  category: string;
  label: string;
  status: string;
  mode: string;
  endpoint_label: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  runbook_url: string | null;
  updated_at: string;
};

export type PlatformTenantSearchRow = {
  id: string;
  slug: string;
  name: string;
  sector: string;
  status: string;
  created_at: string;
  domains: { hostname: string; kind: string; status: string; is_primary: boolean }[];
  super_admin_count: number;
};

export type PlatformAuditRow = {
  id: string;
  tenant_id: string | null;
  source_table: string;
  source_record_id: string | null;
  action: string;
  risk_level: string;
  created_at: string;
  actor_profile_id: string | null;
  tenant_name: string | null;
};

export type DeploymentReleaseRow = {
  id: string;
  environment: string;
  deployment_target: string | null;
  commit_sha: string;
  version: string | null;
  release_path: string | null;
  github_run_id: string;
  github_run_number: string | null;
  github_ref_name: string | null;
  app_url: string | null;
  tenant_domain_suffix: string | null;
  status: string;
  health_status: string;
  activated_at: string | null;
  verified_at: string | null;
  created_at: string;
};

export type PlatformCompletionSnapshot =
  | {
      status: "not_configured" | "no_access";
      error: string;
      settings: null;
      templates: [];
      integrations: [];
      tenants: [];
      audit: [];
      releases: [];
      runtimeRelease: ReleaseMetadata;
      observability: ObservabilityRuntimeStatus;
      errors: string[];
    }
  | {
      status: "ready" | "query_error";
      settings: PlatformSettingsRow | null;
      templates: SectorTemplateRow[];
      integrations: PlatformIntegrationStatusRow[];
      tenants: PlatformTenantSearchRow[];
      audit: PlatformAuditRow[];
      releases: DeploymentReleaseRow[];
      runtimeRelease: ReleaseMetadata;
      observability: ObservabilityRuntimeStatus;
      errors: string[];
      filters: {
        query: string;
        sector: string;
        status: string;
        auditTable: string;
      };
    };

export async function getPlatformCompletionSnapshot(filters: Partial<{ query: string; sector: string; status: string; auditTable: string }> = {}): Promise<PlatformCompletionSnapshot> {
  const context = await getTrustedAuthContext();
  const runtimeRelease = getReleaseMetadata();
  const observability = getObservabilityRuntimeStatus();

  if (context.status !== "authenticated" || !context.platform?.roles.length) {
    return fallback("no_access", "Geen platform admin toegang gevonden.", runtimeRelease, observability);
  }

  if (!getSupabasePublicConfig()) {
    return fallback("not_configured", "Supabase is nog niet geconfigureerd in deze runtime.", runtimeRelease, observability);
  }

  const supabase = await createClient();
  const query = (filters.query ?? "").trim();
  const sector = (filters.sector ?? "").trim();
  const status = (filters.status ?? "").trim();
  const auditTable = (filters.auditTable ?? "").trim();
  let tenantQuery = supabase.from("tenants").select("id, slug, name, sector, status, created_at").order("created_at", { ascending: false }).limit(80);

  if (query) {
    tenantQuery = tenantQuery.or(`name.ilike.%${escapeFilter(query)}%,slug.ilike.%${escapeFilter(query)}%`);
  }

  if (sector) {
    tenantQuery = tenantQuery.eq("sector", sector);
  }

  if (status) {
    tenantQuery = tenantQuery.eq("status", status);
  }

  let auditQuery = supabase
    .from("audit_events")
    .select("id, tenant_id, source_table, source_record_id, action, risk_level, created_at, actor_profile_id")
    .order("created_at", { ascending: false })
    .limit(80);

  if (auditTable) {
    auditQuery = auditQuery.eq("source_table", auditTable);
  }

  const [settingsResult, templatesResult, integrationsResult, tenantsResult, domainsResult, membershipsResult, auditResult, releasesResult] = await Promise.all([
    supabase
      .from("platform_settings")
      .select("id, platform_name, default_locale, default_timezone, support_email, tenant_domain_suffix, staging_domain, production_domain, maintenance_mode, signup_mode, release_channel, updated_at")
      .eq("id", "global")
      .maybeSingle(),
    supabase
      .from("sector_templates")
      .select("id, sector, code, name, description, status, default_locale, terminology, feature_flags, onboarding_checklist, updated_at")
      .order("sector", { ascending: true })
      .order("status", { ascending: true }),
    supabase
      .from("platform_integration_statuses")
      .select("id, integration_key, category, label, status, mode, endpoint_label, last_checked_at, last_error, runbook_url, updated_at")
      .order("category", { ascending: true })
      .order("label", { ascending: true }),
    tenantQuery,
    supabase.from("tenant_domains").select("tenant_id, hostname, kind, status, is_primary").order("is_primary", { ascending: false }),
    supabase.from("tenant_memberships").select("tenant_id, role").eq("role", "tenant_owner").eq("status", "active"),
    auditQuery,
    supabase
      .from("deployment_releases")
      .select("id, environment, deployment_target, commit_sha, version, release_path, github_run_id, github_run_number, github_ref_name, app_url, tenant_domain_suffix, status, health_status, activated_at, verified_at, created_at")
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  const tenantRows = asRows<Omit<PlatformTenantSearchRow, "domains" | "super_admin_count">>(tenantsResult.data);
  const domainsByTenant = groupBy(asRows<{ tenant_id: string; hostname: string; kind: string; status: string; is_primary: boolean }>(domainsResult.data), "tenant_id");
  const ownerCounts = asRows<{ tenant_id: string; role: string }>(membershipsResult.data).reduce<Record<string, number>>((counts, membership) => {
    counts[membership.tenant_id] = (counts[membership.tenant_id] ?? 0) + 1;
    return counts;
  }, {});
  const tenants = tenantRows.map((tenant) => ({
    ...tenant,
    domains: domainsByTenant.get(tenant.id) ?? [],
    super_admin_count: ownerCounts[tenant.id] ?? 0
  }));
  const tenantNames = new Map(tenantRows.map((tenant) => [tenant.id, tenant.name]));
  const audit = asRows<Omit<PlatformAuditRow, "tenant_name">>(auditResult.data).map((row) => ({
    ...row,
    tenant_name: row.tenant_id ? tenantNames.get(row.tenant_id) ?? null : null
  }));
  const errors = collectErrors({
    platform_settings: settingsResult.error,
    sector_templates: templatesResult.error,
    platform_integration_statuses: integrationsResult.error,
    tenants: tenantsResult.error,
    tenant_domains: domainsResult.error,
    tenant_memberships: membershipsResult.error,
    audit_events: auditResult.error,
    deployment_releases: releasesResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    settings: (settingsResult.data as PlatformSettingsRow | null) ?? null,
    templates: asRows<SectorTemplateRow>(templatesResult.data),
    integrations: asRows<PlatformIntegrationStatusRow>(integrationsResult.data),
    tenants,
    audit,
    releases: asRows<DeploymentReleaseRow>(releasesResult.data),
    runtimeRelease,
    observability,
    errors,
    filters: { query, sector, status, auditTable }
  };
}

function fallback(status: "not_configured" | "no_access", error: string, runtimeRelease: ReleaseMetadata, observability: ObservabilityRuntimeStatus): PlatformCompletionSnapshot {
  return {
    status,
    error,
    settings: null,
    templates: [],
    integrations: [],
    tenants: [],
    audit: [],
    releases: [],
    runtimeRelease,
    observability,
    errors: [error]
  };
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => (error ? [`${table}: ${error.message}`] : []));
}

function groupBy<Row extends Record<Key, string | null>, Key extends keyof Row>(rows: Row[], key: Key) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const groupKey = row[key];

    if (!groupKey) {
      continue;
    }

    grouped.set(groupKey, [...(grouped.get(groupKey) ?? []), row]);
  }

  return grouped;
}

function escapeFilter(value: string) {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_").replaceAll(",", "\\,");
}
