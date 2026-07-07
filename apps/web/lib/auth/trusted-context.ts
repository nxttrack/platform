import type { SectorKey } from "@/lib/tenant/terminology";
import { evaluatePrivateShellAccess, type RouteAccessDecision } from "./guard";
import type { AppRole, PlatformRole, TenantRole } from "./roles";

export type AuthenticatedUserContext = {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type UserSecurityContext = {
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  lastInvitedAt: string | null;
};

export type TenantMembershipContext = {
  tenantId: string;
  slug: string;
  name: string;
  sector: SectorKey;
  roles: readonly TenantRole[];
};

export type PlatformMembershipContext = {
  roles: readonly PlatformRole[];
};

export type AnonymousTrustedAuthContext = {
  status: "anonymous";
  checkedAt: string;
  user: null;
  platform: null;
  tenants: readonly [];
  activeTenant: null;
  security: null;
  roles: readonly [];
};

export type AuthenticatedTrustedAuthContext = {
  status: "authenticated";
  checkedAt: string;
  user: AuthenticatedUserContext;
  platform: PlatformMembershipContext | null;
  tenants: readonly TenantMembershipContext[];
  activeTenant: TenantMembershipContext | null;
  security: UserSecurityContext;
  roles: readonly AppRole[];
};

export type TrustedAuthContext = AnonymousTrustedAuthContext | AuthenticatedTrustedAuthContext;

export type TrustedAuthContextInput = {
  user: AuthenticatedUserContext;
  platformRoles?: readonly PlatformRole[];
  tenantMemberships?: readonly TenantMembershipContext[];
  security?: Partial<UserSecurityContext> | null;
  activeTenantId?: string | null;
  activeTenantSlug?: string | null;
  checkedAt?: string;
};

export function createAnonymousAuthContext(checkedAt = new Date().toISOString()): AnonymousTrustedAuthContext {
  return {
    status: "anonymous",
    checkedAt,
    user: null,
    platform: null,
    tenants: [],
    activeTenant: null,
    security: null,
    roles: []
  };
}

export function createTrustedAuthContext(input: TrustedAuthContextInput): AuthenticatedTrustedAuthContext {
  const platformRoles = uniqueRoles(input.platformRoles ?? []);
  const tenantMemberships = dedupeTenantMemberships(input.tenantMemberships ?? []);
  const activeTenant = resolveActiveTenant(tenantMemberships, input.activeTenantId ?? null, input.activeTenantSlug ?? null);
  const tenantRoles = tenantMemberships.flatMap((membership) => membership.roles);
  const security: UserSecurityContext = {
    mustChangePassword: input.security?.mustChangePassword ?? false,
    passwordChangedAt: input.security?.passwordChangedAt ?? null,
    lastInvitedAt: input.security?.lastInvitedAt ?? null
  };

  return {
    status: "authenticated",
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    user: input.user,
    platform: platformRoles.length > 0 ? { roles: platformRoles } : null,
    tenants: tenantMemberships,
    activeTenant,
    security,
    roles: uniqueRoles([...platformRoles, ...tenantRoles])
  };
}

export function evaluatePrivateShellAccessForContext(pathname: string, context: TrustedAuthContext): RouteAccessDecision {
  if (context.status === "anonymous") {
    return evaluatePrivateShellAccess({ pathname });
  }

  return evaluatePrivateShellAccess({
    pathname,
    platform: context.platform,
    tenant: context.activeTenant
      ? {
          tenantId: context.activeTenant.tenantId,
          roles: context.activeTenant.roles
        }
      : null
  });
}

export function resolveActiveTenant(
  tenantMemberships: readonly TenantMembershipContext[],
  activeTenantId?: string | null,
  activeTenantSlug?: string | null
): TenantMembershipContext | null {
  if (activeTenantId) {
    return tenantMemberships.find((membership) => membership.tenantId === activeTenantId) ?? null;
  }

  if (activeTenantSlug) {
    return tenantMemberships.find((membership) => membership.slug === activeTenantSlug) ?? null;
  }

  return tenantMemberships.length === 1 ? tenantMemberships[0] ?? null : null;
}

export function hasPlatformAccess(context: TrustedAuthContext): context is AuthenticatedTrustedAuthContext & { platform: PlatformMembershipContext } {
  return context.status === "authenticated" && !!context.platform && context.platform.roles.length > 0;
}

export function hasTenantAccess(context: TrustedAuthContext): context is AuthenticatedTrustedAuthContext & { activeTenant: TenantMembershipContext } {
  return context.status === "authenticated" && !!context.activeTenant && context.activeTenant.roles.length > 0;
}

function dedupeTenantMemberships(tenantMemberships: readonly TenantMembershipContext[]): TenantMembershipContext[] {
  const membershipsByTenant = new Map<string, TenantMembershipContext>();

  for (const membership of tenantMemberships) {
    const existing = membershipsByTenant.get(membership.tenantId);

    if (!existing) {
      membershipsByTenant.set(membership.tenantId, {
        ...membership,
        roles: uniqueRoles(membership.roles)
      });
      continue;
    }

    membershipsByTenant.set(membership.tenantId, {
      ...existing,
      roles: uniqueRoles([...existing.roles, ...membership.roles])
    });
  }

  return [...membershipsByTenant.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueRoles<Role extends AppRole>(roles: readonly Role[]): Role[] {
  return [...new Set(roles)];
}
