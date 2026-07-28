import "server-only";

import { getPlatformEmailSettingsView } from "@/lib/email/platform-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { calculateTenantHealth, type TenantHealthScore } from "./tenant-health-contract";

export type PlatformHealthTenant = {
  id: string;
  slug: string;
  name: string;
  sector: string;
  status: string;
  createdAt: string;
  primaryDomain: string;
  memberCount: number;
  adminNames: string[];
  lastAdminLoginAt: string | null;
  health: TenantHealthScore;
};

export async function getPlatformHealthDashboard() {
  const admin = createAdminClient();
  const environment = normalizeEnvironment(process.env.APP_ENV ?? process.env.NODE_ENV);
  const [
    tenantsResult,
    domainsResult,
    settingsResult,
    membershipsResult,
    profilesResult,
    programsResult,
    groupsResult,
    resourcesResult,
    groupMembershipsResult,
    issuesResult,
    incidentsResult,
    heartbeatsResult,
    crmResult,
    messagesResult,
    recipesResult,
    badgesResult,
    mediaResult,
    plansResult,
    paymentsResult,
    platformMembershipsResult,
    email
  ] = await Promise.all([
    admin.from("tenants").select("id, slug, name, sector, status, created_at").order("created_at", { ascending: false }),
    admin.from("tenant_domains").select("tenant_id, hostname, status, is_primary"),
    admin.from("tenant_settings").select("tenant_id"),
    admin.from("tenant_memberships").select("tenant_id, user_id, role, status"),
    admin.from("profiles").select("id, full_name, email"),
    admin.from("programs").select("tenant_id, status"),
    admin.from("groups").select("id, tenant_id, capacity, status"),
    admin.from("resources").select("tenant_id, status"),
    admin.from("group_memberships").select("tenant_id, group_id, status").eq("is_test", false),
    admin.from("data_quality_issues").select("tenant_id, severity, status").eq("is_test", false).in("status", ["open", "ignored"]),
    admin.from("platform_incidents").select("id, tenant_id, title, summary, severity, status, source, opened_at, resolved_at").neq("status", "resolved").order("opened_at", { ascending: false }),
    admin.from("platform_service_heartbeats").select("service_key, environment, status, detail, metadata_json, checked_at, expires_at").eq("environment", environment),
    admin.from("intake_submissions").select("tenant_id").eq("is_test", false).limit(5000),
    admin.from("messages").select("tenant_id").eq("is_test", false).limit(5000),
    admin.from("tenant_automation_recipes").select("tenant_id, enabled").eq("enabled", true).limit(5000),
    admin.from("participant_badge_awards").select("tenant_id").limit(5000),
    admin.from("participant_media").select("tenant_id").limit(5000),
    admin.from("lesson_plans").select("tenant_id").limit(5000),
    admin.from("manual_payments").select("tenant_id").limit(5000),
    admin.from("platform_memberships").select("user_id, role, status"),
    getPlatformEmailSettingsView()
  ]);
  for (const [label, result] of [
    ["tenants", tenantsResult],
    ["domains", domainsResult],
    ["settings", settingsResult],
    ["memberships", membershipsResult],
    ["profiles", profilesResult],
    ["programs", programsResult],
    ["groups", groupsResult],
    ["resources", resourcesResult],
    ["group memberships", groupMembershipsResult],
    ["data quality", issuesResult],
    ["incidents", incidentsResult],
    ["heartbeats", heartbeatsResult],
    ["CRM adoption", crmResult],
    ["communication adoption", messagesResult],
    ["automation adoption", recipesResult],
    ["badge adoption", badgesResult],
    ["media adoption", mediaResult],
    ["lesson plan adoption", plansResult],
    ["billing adoption", paymentsResult],
    ["platform memberships", platformMembershipsResult]
  ] as const) assertResult(result.error, `platform health ${label}`);

  const authUsers = await listAuthUsersSafely(admin);
  const authById = new Map(authUsers.map((user) => [user.id, user]));
  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const heartbeatByKey = new Map((heartbeatsResult.data ?? []).map((heartbeat) => [heartbeat.service_key, heartbeat]));
  const serviceStatus = (key: string) => {
    const heartbeat = heartbeatByKey.get(key);
    if (!heartbeat || new Date(heartbeat.expires_at) <= new Date()) return "unknown" as const;
    return heartbeat.status as "pass" | "degraded" | "fail";
  };
  const globalIncidents = (incidentsResult.data ?? []).filter((incident) => !incident.tenant_id);
  const occupiedByGroup = new Map<string, number>();
  for (const membership of groupMembershipsResult.data ?? []) {
    if (!["active", "trial"].includes(membership.status)) continue;
    occupiedByGroup.set(membership.group_id, (occupiedByGroup.get(membership.group_id) ?? 0) + 1);
  }
  const adoptionSources = [
    new Set((crmResult.data ?? []).map((row) => row.tenant_id)),
    new Set((messagesResult.data ?? []).map((row) => row.tenant_id)),
    new Set((recipesResult.data ?? []).map((row) => row.tenant_id)),
    new Set((badgesResult.data ?? []).map((row) => row.tenant_id)),
    new Set((mediaResult.data ?? []).map((row) => row.tenant_id)),
    new Set((plansResult.data ?? []).map((row) => row.tenant_id)),
    new Set((paymentsResult.data ?? []).map((row) => row.tenant_id))
  ];
  const mailHealthy = email.enabled && Boolean(email.fromEmail) && (email.provider === "smtp" ? email.hasSmtpPassword : email.hasSendGridApiKey);
  const tenants: PlatformHealthTenant[] = (tenantsResult.data ?? []).map((tenant) => {
    const memberships = (membershipsResult.data ?? []).filter((membership) => membership.tenant_id === tenant.id && membership.status === "active");
    const admins = memberships.filter((membership) => ["tenant_owner", "tenant_admin"].includes(membership.role));
    const adminAuthUsers = admins.flatMap((membership) => {
      const user = authById.get(membership.user_id);
      return user ? [user] : [];
    });
    const groups = (groupsResult.data ?? []).filter((group) => group.tenant_id === tenant.id && group.status === "active");
    const lowUtilizationGroups = groups.filter((group) => group.capacity > 0 && (occupiedByGroup.get(group.id) ?? 0) / group.capacity < 0.35).length;
    const issues = (issuesResult.data ?? []).filter((issue) => issue.tenant_id === tenant.id && issue.status === "open");
    const incidents = [...globalIncidents, ...(incidentsResult.data ?? []).filter((incident) => incident.tenant_id === tenant.id)];
    const lastAdminLoginAt = adminAuthUsers.map((user) => user.last_sign_in_at).filter((value): value is string => !!value).sort().at(-1) ?? null;
    const primaryDomain = (domainsResult.data ?? []).find((domain) => domain.tenant_id === tenant.id && domain.is_primary)?.hostname ?? `${tenant.slug}.nxttrack.nl`;
    const health = calculateTenantHealth({
      tenantId: tenant.id,
      configuredChecks: {
        settings: (settingsResult.data ?? []).some((setting) => setting.tenant_id === tenant.id),
        verifiedDomain: (domainsResult.data ?? []).some((domain) => domain.tenant_id === tenant.id && domain.status === "verified"),
        admin: admins.length > 0,
        program: (programsResult.data ?? []).some((program) => program.tenant_id === tenant.id && program.status === "active"),
        group: groups.length > 0,
        resource: (resourcesResult.data ?? []).some((resource) => resource.tenant_id === tenant.id && resource.status === "active")
      },
      mailHealthy,
      cron: serviceStatus("runtime_monitor"),
      lastAdminLoginAt,
      openDataIssues: issues.length,
      criticalDataIssues: issues.filter((issue) => ["critical", "error"].includes(issue.severity)).length,
      lowUtilizationGroups,
      activeGroups: groups.length,
      openIncidents: incidents.length,
      criticalIncidents: incidents.filter((incident) => incident.severity === "critical").length,
      backup: serviceStatus("storage_backup"),
      scanner: serviceStatus("clamav_scanner"),
      adoptedModules: adoptionSources.filter((source) => source.has(tenant.id)).length,
      availableModules: adoptionSources.length
    });
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      sector: tenant.sector,
      status: tenant.status,
      createdAt: tenant.created_at,
      primaryDomain,
      memberCount: memberships.length,
      adminNames: admins.map((membership) => profileById.get(membership.user_id)?.full_name ?? profileById.get(membership.user_id)?.email ?? "Beheerder"),
      lastAdminLoginAt,
      health
    };
  });
  const platformOwners = (platformMembershipsResult.data ?? []).filter((membership) => membership.status === "active" && membership.role === "platform_owner");
  return {
    environment,
    tenants,
    incidents: incidentsResult.data ?? [],
    heartbeats: heartbeatsResult.data ?? [],
    platformOwners: platformOwners.length,
    email: {
      healthy: mailHealthy,
      provider: email.provider === "smtp" ? "SMTP" : "SendGrid API",
      fromEmail: email.fromEmail
    },
    summary: {
      averageScore: tenants.length ? Math.round(tenants.reduce((sum, tenant) => sum + tenant.health.score, 0) / tenants.length) : 0,
      healthy: tenants.filter((tenant) => tenant.health.status === "healthy").length,
      watch: tenants.filter((tenant) => tenant.health.status === "watch").length,
      risk: tenants.filter((tenant) => ["risk", "critical"].includes(tenant.health.status)).length,
      openIncidents: (incidentsResult.data ?? []).length,
      expiredServices: (heartbeatsResult.data ?? []).filter((heartbeat) => new Date(heartbeat.expires_at) <= new Date()).length
    }
  };
}

async function listAuthUsersSafely(admin: ReturnType<typeof createAdminClient>) {
  const users: Array<{ id: string; last_sign_in_at?: string | null }> = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) return users;
    users.push(...result.data.users);
    if (result.data.users.length < 1000) break;
  }
  return users;
}

function normalizeEnvironment(value: string | undefined): "development" | "staging" | "production" {
  const normalized = String(value ?? "").toLowerCase();
  return normalized === "production" ? "production" : normalized === "staging" ? "staging" : "development";
}

function assertResult(error: { message: string } | null, label: string): asserts error is null {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
