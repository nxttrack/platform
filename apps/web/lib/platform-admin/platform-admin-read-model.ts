import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type PlatformTenantRow = {
  id: string;
  slug: string;
  name: string;
  sector: string;
  status: string;
  created_at: string;
};

export type PlatformTenantDomainRow = {
  tenant_id: string;
  hostname: string;
  status: string;
  is_primary: boolean;
};

export type TenantSuperAdminRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  status: string;
  invited_email: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformProfileRow = {
  id: string;
  full_name: string | null;
};

export type TenantSuperAdminInvitationRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  email: string;
  full_name: string | null;
  status: string;
  delivery_provider: string | null;
  last_sent_at: string | null;
  accepted_at: string | null;
  expires_at: string;
  error_message: string | null;
  created_at: string;
};

export type PlatformSmtpSettingsRow = {
  id: string;
  status: string;
  mode: string;
  host: string;
  port: number;
  secure: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to_email: string | null;
  username_secret_reference: string;
  password_secret_reference: string;
  test_recipient_email: string | null;
  last_tested_at: string | null;
  last_test_status: string;
  last_test_error: string | null;
};

export type PlatformTenantWithAdmins = PlatformTenantRow & {
  domains: PlatformTenantDomainRow[];
  superAdmins: Array<
    TenantSuperAdminRow & {
      profile: PlatformProfileRow | null;
      latestInvitation: TenantSuperAdminInvitationRow | null;
    }
  >;
  invitations: TenantSuperAdminInvitationRow[];
};

export type PlatformAdminSnapshot = {
  status: "ready" | "not_configured" | "no_access" | "query_error";
  platformRoles: string[];
  smtpSettings: PlatformSmtpSettingsRow | null;
  tenants: PlatformTenantWithAdmins[];
  errors: string[];
};

export async function getPlatformAdminSnapshot(): Promise<PlatformAdminSnapshot> {
  const context = await getTrustedAuthContext();

  if (context.status !== "authenticated" || !context.platform?.roles.length) {
    return {
      status: "no_access",
      platformRoles: [],
      smtpSettings: null,
      tenants: [],
      errors: ["Geen platform admin toegang gevonden."]
    };
  }

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      platformRoles: [...context.platform.roles],
      smtpSettings: null,
      tenants: [],
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const [tenantsResult, domainsResult, membershipsResult, invitationsResult, smtpSettingsResult] = await Promise.all([
    supabase.from("tenants").select("id, slug, name, sector, status, created_at").order("name", { ascending: true }),
    supabase.from("tenant_domains").select("tenant_id, hostname, status, is_primary").order("is_primary", { ascending: false }),
    supabase.from("tenant_memberships").select("id, tenant_id, user_id, role, status, invited_email, created_at, updated_at").eq("role", "tenant_owner").order("created_at", { ascending: true }),
    supabase
      .from("tenant_super_admin_invitations")
      .select("id, tenant_id, user_id, email, full_name, status, delivery_provider, last_sent_at, accepted_at, expires_at, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("platform_smtp_settings")
      .select("id, status, mode, host, port, secure, from_email, from_name, reply_to_email, username_secret_reference, password_secret_reference, test_recipient_email, last_tested_at, last_test_status, last_test_error")
      .eq("id", "global")
      .maybeSingle()
  ]);

  const memberships = asRows<TenantSuperAdminRow>(membershipsResult.data);
  const invitations = asRows<TenantSuperAdminInvitationRow>(invitationsResult.data);
  const profileIds = unique([...memberships.map((membership) => membership.user_id), ...invitations.flatMap((invite) => (invite.user_id ? [invite.user_id] : []))]);
  const profilesResult =
    profileIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("profiles").select("id, full_name").in("id", profileIds).order("full_name", { ascending: true });
  const profilesById = new Map(asRows<PlatformProfileRow>(profilesResult.data).map((profile) => [profile.id, profile]));
  const domainsByTenant = groupBy(asRows<PlatformTenantDomainRow>(domainsResult.data), "tenant_id");
  const invitationsByTenant = groupBy(invitations, "tenant_id");
  const invitationsByUser = groupBy(
    invitations.filter((invite) => Boolean(invite.user_id)),
    "user_id"
  );
  const membershipsByTenant = groupBy(memberships, "tenant_id");
  const tenants = asRows<PlatformTenantRow>(tenantsResult.data).map((tenant) => ({
    ...tenant,
    domains: domainsByTenant.get(tenant.id) ?? [],
    invitations: invitationsByTenant.get(tenant.id) ?? [],
    superAdmins: (membershipsByTenant.get(tenant.id) ?? []).map((membership) => ({
      ...membership,
      profile: profilesById.get(membership.user_id) ?? null,
      latestInvitation: invitationsByUser.get(membership.user_id)?.[0] ?? null
    }))
  }));
  const errors = collectErrors({
    tenants: tenantsResult.error,
    tenant_domains: domainsResult.error,
    tenant_memberships: membershipsResult.error,
    tenant_super_admin_invitations: invitationsResult.error,
    platform_smtp_settings: smtpSettingsResult.error,
    profiles: profilesResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    platformRoles: [...context.platform.roles],
    smtpSettings: (smtpSettingsResult.data as PlatformSmtpSettingsRow | null) ?? null,
    tenants,
    errors
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
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
