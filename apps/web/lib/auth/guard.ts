import { getPrivateShellForPath, privateShellAccess, type PrivateShellAccess, type PrivateShellKey } from "./access";
import type { AppRole, PlatformRole, TenantRole } from "./roles";

export type TenantAccessContext = {
  tenantId: string;
  roles: readonly TenantRole[];
};

export type PlatformAccessContext = {
  roles: readonly PlatformRole[];
};

export type PrivateShellAccessInput = {
  pathname: string;
  tenant?: TenantAccessContext | null;
  platform?: PlatformAccessContext | null;
};

export type PrivateShellDenyReason = "tenant_context_required" | "tenant_membership_required" | "platform_membership_required" | "role_not_allowed";

export type RouteAccessDecision =
  | {
      allowed: true;
      privateRoute: false;
      shell: null;
      access: null;
      reason: "public_route";
      defaultPath: null;
      matchedRoles: readonly [];
    }
  | {
      allowed: true;
      privateRoute: true;
      shell: PrivateShellKey;
      access: PrivateShellAccess;
      reason: "role_allowed";
      defaultPath: `/${string}`;
      matchedRoles: readonly AppRole[];
    }
  | {
      allowed: false;
      privateRoute: true;
      shell: PrivateShellKey;
      access: PrivateShellAccess;
      reason: PrivateShellDenyReason;
      defaultPath: `/${string}`;
      matchedRoles: readonly AppRole[];
    };

const privateShellPreference = ["platform_admin", "tenant_admin", "instructor", "parent"] as const satisfies readonly PrivateShellKey[];

export function evaluatePrivateShellAccess(input: PrivateShellAccessInput): RouteAccessDecision {
  const access = getPrivateShellForPath(input.pathname);

  if (!access) {
    return {
      allowed: true,
      privateRoute: false,
      shell: null,
      access: null,
      reason: "public_route",
      defaultPath: null,
      matchedRoles: []
    };
  }

  const defaultPath = getDefaultPrivatePathForShell(access.shell);

  if (access.platformOnly) {
    const platformRoles = input.platform?.roles ?? [];
    const matchedRoles = getMatchedRoles(platformRoles, access);

    return matchedRoles.length > 0
      ? allowPrivateRoute(access, defaultPath, matchedRoles)
      : denyPrivateRoute(access, defaultPath, platformRoles.length === 0 ? "platform_membership_required" : "role_not_allowed", matchedRoles);
  }

  if (access.tenantRequired) {
    const tenant = input.tenant;

    if (!tenant?.tenantId) {
      return denyPrivateRoute(access, defaultPath, "tenant_context_required", []);
    }

    const matchedRoles = getMatchedRoles(tenant.roles, access);

    return matchedRoles.length > 0
      ? allowPrivateRoute(access, defaultPath, matchedRoles)
      : denyPrivateRoute(access, defaultPath, tenant.roles.length === 0 ? "tenant_membership_required" : "role_not_allowed", matchedRoles);
  }

  return denyPrivateRoute(access, defaultPath, "role_not_allowed", []);
}

export function getDefaultPrivatePathForShell(shell: PrivateShellKey): `/${string}` {
  return privateShellAccess[shell].pathPrefix;
}

export function getPreferredPrivateShellForRoles(roles: readonly AppRole[]): PrivateShellAccess | null {
  return (
    privateShellPreference
      .map((shell) => privateShellAccess[shell])
      .find((access) => {
        return getMatchedRoles(roles, access).length > 0;
      }) ?? null
  );
}

export function getPreferredPrivatePathForRoles(roles: readonly AppRole[]): `/${string}` | null {
  return getPreferredPrivateShellForRoles(roles)?.pathPrefix ?? null;
}

function allowPrivateRoute(access: PrivateShellAccess, defaultPath: `/${string}`, matchedRoles: readonly AppRole[]): RouteAccessDecision {
  return {
    allowed: true,
    privateRoute: true,
    shell: access.shell,
    access,
    reason: "role_allowed",
    defaultPath,
    matchedRoles
  };
}

function denyPrivateRoute(access: PrivateShellAccess, defaultPath: `/${string}`, reason: PrivateShellDenyReason, matchedRoles: readonly AppRole[]): RouteAccessDecision {
  return {
    allowed: false,
    privateRoute: true,
    shell: access.shell,
    access,
    reason,
    defaultPath,
    matchedRoles
  };
}

function getMatchedRoles(roles: readonly AppRole[], access: PrivateShellAccess): AppRole[] {
  return roles.filter((role) => access.allowedRoles.includes(role));
}
