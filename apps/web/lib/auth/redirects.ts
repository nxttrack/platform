export type AuthRedirectReason = "auth_required" | "no_membership" | "role_not_allowed" | "tenant_required" | "not_configured" | "invalid_credentials" | "missing_credentials";

export function sanitizeLocalPath(value: FormDataEntryValue | string | string[] | null | undefined, fallback: `/${string}` = "/auth/redirect"): `/${string}` {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const path = typeof rawValue === "string" ? rawValue.trim() : "";

  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return fallback;
  }

  return path as `/${string}`;
}

export function buildLoginPath(nextPath: `/${string}`, reason: AuthRedirectReason = "auth_required"): `/${string}` {
  return buildPath("/login", { next: nextPath, reason });
}

export function buildNoAccessPath(nextPath: `/${string}`, reason: AuthRedirectReason = "role_not_allowed"): `/${string}` {
  return buildPath("/auth/no-access", { next: nextPath, reason });
}

export function buildTenantSwitchPath(nextPath: `/${string}`): `/${string}` {
  return buildPath("/auth/tenant-switch", { next: nextPath });
}

export function buildChangePasswordPath(nextPath: `/${string}`, reason?: string | null): `/${string}` {
  return buildPath("/auth/change-password", { next: nextPath, reason });
}

export function buildPath(pathname: `/${string}`, params: Record<string, string | null | undefined>): `/${string}` {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }

  const query = search.toString();

  return query ? (`${pathname}?${query}` as `/${string}`) : pathname;
}
