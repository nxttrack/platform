import type { Metadata } from "next";

import type { AppRole } from "./roles";

export type PrivateShellKey = "parent" | "instructor" | "tenant_admin" | "platform_admin";

export type PrivateShellAccess = {
  shell: PrivateShellKey;
  pathPrefix: `/${string}`;
  tenantRequired: boolean;
  platformOnly: boolean;
  allowedRoles: readonly AppRole[];
  description: string;
};

export const privateRouteRobots = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false
  }
} satisfies Metadata["robots"];

export const privateRouteMetadata: Metadata = {
  robots: privateRouteRobots
};

export const privateShellAccess = {
  parent: {
    shell: "parent",
    pathPrefix: "/portaal",
    tenantRequired: true,
    platformOnly: false,
    allowedRoles: ["parent", "athlete"],
    description: "Parent-mediated athlete portal context scoped to one tenant membership."
  },
  instructor: {
    shell: "instructor",
    pathPrefix: "/instructor",
    tenantRequired: true,
    platformOnly: false,
    allowedRoles: ["instructor", "tenant_staff", "tenant_admin", "tenant_owner"],
    description: "Instructor shell scoped to assigned tenant groups and sessions."
  },
  tenant_admin: {
    shell: "tenant_admin",
    pathPrefix: "/admin",
    tenantRequired: true,
    platformOnly: false,
    allowedRoles: ["tenant_owner", "tenant_admin", "tenant_staff"],
    description: "Tenant operations shell scoped to one organization workspace."
  },
  platform_admin: {
    shell: "platform_admin",
    pathPrefix: "/platform",
    tenantRequired: false,
    platformOnly: true,
    allowedRoles: ["platform_owner", "platform_admin", "platform_support"],
    description: "Global platform shell for tenant, domain, template and support operations."
  }
} as const satisfies Record<PrivateShellKey, PrivateShellAccess>;

export function getPrivateShellForPath(pathname: string): PrivateShellAccess | null {
  const normalizedPath = normalizePathname(pathname);

  return (
    Object.values(privateShellAccess).find((shell) => {
      return normalizedPath === shell.pathPrefix || normalizedPath.startsWith(`${shell.pathPrefix}/`);
    }) ?? null
  );
}

export function canRoleAccessShell(role: AppRole, shell: PrivateShellKey): boolean {
  const allowedRoles: readonly AppRole[] = privateShellAccess[shell].allowedRoles;

  return allowedRoles.includes(role);
}

export function normalizePathname(pathname: string): `/${string}` {
  const trimmedPath = pathname.trim();

  if (trimmedPath === "") {
    return "/";
  }

  const pathOnly = trimmedPath.split("?")[0]?.split("#")[0] ?? "/";
  const withLeadingSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;

  return withLeadingSlash.replace(/\/+$/, "") === "" ? "/" : (withLeadingSlash.replace(/\/+$/, "") as `/${string}`);
}
