import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTrustedAuthContext } from "./server-context";
import { evaluatePrivateShellAccessForContext, type AuthenticatedTrustedAuthContext } from "./trusted-context";
import { buildLoginRedirect, getDefaultRedirectForRoles, sanitizeRelativePath } from "./redirects";

export async function getActiveTenantSlugFromHeaders(): Promise<string | null> {
  const headerStore = await headers();

  return headerStore.get("x-nxttrack-tenant-slug");
}

export async function getHostKindFromHeaders(): Promise<string | null> {
  const headerStore = await headers();

  return headerStore.get("x-nxttrack-host-kind");
}

export async function getTrustedAuthContextForRequest() {
  return getTrustedAuthContext({
    activeTenantSlug: await getActiveTenantSlugFromHeaders()
  });
}

export async function requireAuthenticatedContext(nextPath: `/${string}`): Promise<AuthenticatedTrustedAuthContext> {
  const context = await getTrustedAuthContextForRequest();

  if (context.status === "anonymous") {
    redirect(buildLoginRedirect(nextPath));
  }

  return context;
}

export async function requirePrivateShellContext(pathname: `/${string}`): Promise<AuthenticatedTrustedAuthContext> {
  const context = await getTrustedAuthContextForRequest();
  const hostKind = await getHostKindFromHeaders();

  if (context.status === "anonymous") {
    redirect(buildLoginRedirect(pathname));
  }

  if (context.security.mustChangePassword) {
    redirect(`/auth/wachtwoord-wijzigen?next=${encodeURIComponent(pathname)}`);
  }

  const decision = evaluatePrivateShellAccessForContext(pathname, context);

  if (decision.shell === "platform_admin" && !["platform_admin", "staging", "platform"].includes(hostKind ?? "")) {
    redirect(buildLoginRedirect(pathname, "forbidden"));
  }

  if (!decision.allowed) {
    if (decision.shell === "platform_admin") {
      redirect(buildLoginRedirect(pathname, "forbidden"));
    }

    const preferredPath = getDefaultRedirectForRoles(context.roles);

    if (preferredPath !== pathname) {
      redirect(preferredPath);
    }

    redirect(buildLoginRedirect(pathname, "forbidden"));
  }

  return context;
}

export function getFormNextPath(formData: FormData, fallback: `/${string}`): `/${string}` {
  return sanitizeRelativePath(formData.get("next"), fallback);
}
