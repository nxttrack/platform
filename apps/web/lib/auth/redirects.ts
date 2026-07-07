import type { AppRole } from "./roles";
import { getPreferredPrivatePathForRoles } from "./guard";

const fallbackPath = "/portaal" as const;

export function sanitizeRelativePath(value: FormDataEntryValue | string | null | undefined, fallback: `/${string}` = fallbackPath): `/${string}` {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return fallback;
  }

  return trimmed as `/${string}`;
}

export function getDefaultRedirectForRoles(roles: readonly AppRole[]): `/${string}` {
  return getPreferredPrivatePathForRoles(roles) ?? fallbackPath;
}

export function buildLoginRedirect(nextPath: `/${string}`, error?: string): string {
  const params = new URLSearchParams({ next: nextPath });

  if (error) {
    params.set("error", error);
  }

  return `/login?${params.toString()}`;
}
