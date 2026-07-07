import type { SectorKey } from "@/lib/tenant/terminology";
import { isPlatformRole, isTenantRole, type PlatformRole, type TenantRole } from "./roles";
import { createAnonymousAuthContext, createTrustedAuthContext, type TenantMembershipContext, type TrustedAuthContext } from "./trusted-context";

export const identityBoundarySelects = {
  profile: "id, full_name, avatar_url",
  userSecurity: "must_change_password, password_changed_at, last_invited_at",
  tenantMemberships: "tenant_id, role, status, tenants!inner(id, slug, name, sector, status, tenant_settings(terminology_sector))",
  platformMemberships: "role, status"
} as const;

export type VerifiedAuthUser = {
  id: string;
  email?: string | null;
};

export type ProfileIdentityRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type TenantSettingsIdentityRow = {
  terminology_sector: string | null;
};

export type TenantIdentityRow = {
  id: string;
  slug: string;
  name: string;
  sector: string;
  status: string;
  tenant_settings?: TenantSettingsIdentityRow | TenantSettingsIdentityRow[] | null;
};

export type TenantMembershipIdentityRow = {
  tenant_id: string;
  role: string;
  status: string;
  tenants: TenantIdentityRow | TenantIdentityRow[] | null;
};

export type PlatformMembershipIdentityRow = {
  role: string;
  status: string;
};

export type UserSecurityIdentityRow = {
  must_change_password: boolean;
  password_changed_at: string | null;
  last_invited_at: string | null;
};

export type IdentityBoundaryRows = {
  user: VerifiedAuthUser | null;
  profile?: ProfileIdentityRow | null;
  userSecurity?: UserSecurityIdentityRow | null;
  tenantMemberships?: readonly TenantMembershipIdentityRow[] | null;
  platformMemberships?: readonly PlatformMembershipIdentityRow[] | null;
  activeTenantId?: string | null;
  activeTenantSlug?: string | null;
  checkedAt?: string;
};

const sectorKeys = ["swim_school", "football_school", "sports_club", "martial_arts_school", "dance_school", "generic_lessons"] as const satisfies readonly SectorKey[];

export function mapIdentityRowsToTrustedAuthContext(rows: IdentityBoundaryRows): TrustedAuthContext {
  if (!rows.user) {
    return createAnonymousAuthContext(rows.checkedAt);
  }

  return createTrustedAuthContext({
    user: {
      id: rows.user.id,
      email: rows.user.email ?? null,
      displayName: rows.profile?.full_name ?? null,
      avatarUrl: rows.profile?.avatar_url ?? null
    },
    security: {
      mustChangePassword: rows.userSecurity?.must_change_password ?? false,
      passwordChangedAt: rows.userSecurity?.password_changed_at ?? null,
      lastInvitedAt: rows.userSecurity?.last_invited_at ?? null
    },
    platformRoles: mapPlatformRoles(rows.platformMemberships ?? []),
    tenantMemberships: mapTenantMemberships(rows.tenantMemberships ?? []),
    activeTenantId: rows.activeTenantId ?? null,
    activeTenantSlug: rows.activeTenantSlug ?? null,
    checkedAt: rows.checkedAt
  });
}

function mapPlatformRoles(rows: readonly PlatformMembershipIdentityRow[]): PlatformRole[] {
  return rows.flatMap((row) => {
    return row.status === "active" && isPlatformRole(row.role) ? [row.role] : [];
  });
}

function mapTenantMemberships(rows: readonly TenantMembershipIdentityRow[]): TenantMembershipContext[] {
  const byTenant = new Map<string, TenantMembershipContext>();

  for (const row of rows) {
    const tenant = normalizeTenantRow(row.tenants);

    if (row.status !== "active" || !isTenantRole(row.role) || !tenant || tenant.status !== "active") {
      continue;
    }

    const existing = byTenant.get(row.tenant_id);
    const sector = resolveTenantSector(tenant);
    const role = row.role satisfies TenantRole;

    byTenant.set(row.tenant_id, {
      tenantId: row.tenant_id,
      slug: tenant.slug,
      name: tenant.name,
      sector,
      roles: existing ? [...existing.roles, role] : [role]
    });
  }

  return [...byTenant.values()];
}

function normalizeTenantRow(value: TenantIdentityRow | TenantIdentityRow[] | null): TenantIdentityRow | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function resolveTenantSector(tenant: TenantIdentityRow): SectorKey {
  const settings = Array.isArray(tenant.tenant_settings) ? tenant.tenant_settings[0] : tenant.tenant_settings;
  const preferredSector = settings?.terminology_sector ?? tenant.sector;

  return isSectorKey(preferredSector) ? preferredSector : "generic_lessons";
}

function isSectorKey(value: string | null | undefined): value is SectorKey {
  return !!value && sectorKeys.includes(value as SectorKey);
}
