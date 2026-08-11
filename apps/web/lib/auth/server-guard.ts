import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  getTrustedAuthContext,
  getTrustedAuthContextForAccessToken
} from "./server-context";
import { evaluatePrivateShellAccessForContext, type AuthenticatedTrustedAuthContext } from "./trusted-context";
import { buildLoginRedirect, getDefaultRedirectForRoles, sanitizeRelativePath } from "./redirects";
import { resolvePortalSessionContext } from "./portal-session";
import { requireChildPortalSession } from "./portal-session";

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

export async function requireApiAuthenticatedContext(request?: Request) {
  const bearerToken = request ? readBearerToken(request) : null;
  const context = bearerToken
    ? await getTrustedAuthContextForAccessToken(bearerToken, {
        activeTenantId: request?.headers.get("x-nxttrack-tenant-id")
      })
    : await getTrustedAuthContextForRequest();

  if (context.status === "anonymous") {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 })
    } as const;
  }

  if (context.security.mustChangePassword) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "password_change_required",
          changePasswordUrl: "/auth/wachtwoord-wijzigen"
        },
        { status: 403 }
      )
    } as const;
  }

  const portalSession = await resolvePortalSessionContext(context);
  if (portalSession.mode === "locked") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "portal_session_locked", loginUrl: "/login?error=child_session_locked" },
        { status: 403, headers: privateResponseHeaders() }
      )
    } as const;
  }
  if (portalSession.mode === "child") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "child_session_capability_required" },
        {
          status: 403,
          headers: privateResponseHeaders()
        }
      )
    } as const;
  }

  return { context, ok: true } as const;
}

export async function requireChildApiAuthenticatedContext(request?: Request) {
  const bearerToken = request ? readBearerToken(request) : null;
  const context = bearerToken
    ? await getTrustedAuthContextForAccessToken(bearerToken, {
        activeTenantId: request?.headers.get("x-nxttrack-tenant-id")
      })
    : await getTrustedAuthContextForRequest();
  if (context.status === "anonymous") {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401, headers: privateResponseHeaders() })
    } as const;
  }
  if (context.security.mustChangePassword) {
    return {
      ok: false,
      response: NextResponse.json({ error: "password_change_required" }, { status: 403, headers: privateResponseHeaders() })
    } as const;
  }
  try {
    const portalSession = await resolvePortalSessionContext(context);
    if (portalSession.mode === "locked") {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "portal_session_locked", loginUrl: "/login?error=child_session_locked" },
          { status: 403, headers: privateResponseHeaders() }
        )
      } as const;
    }
    const childSession = await requireChildPortalSession(context);
    return { childSession, context, ok: true } as const;
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "child_session_required" }, { status: 403, headers: privateResponseHeaders() })
    } as const;
  }
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
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

  const portalSession = await resolvePortalSessionContext(context);
  const requestedChildShell = pathname === "/kind" || pathname.startsWith("/kind/");

  if (portalSession.mode === "locked") {
    redirect(buildLoginRedirect("/portaal", "child_session_locked"));
  } else if (portalSession.mode === "child") {
    if (!requestedChildShell) redirect("/kind");
    if (
      portalSession.userId !== context.user.id
      || !context.tenants.some((tenant) => tenant.tenantId === portalSession.tenantId)
    ) {
      throw new Error("Invalid child portal session binding");
    }
  } else if (requestedChildShell) {
    redirect("/portaal");
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

export function privateResponseHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex"
  } as const;
}

export function getFormNextPath(formData: FormData, fallback: `/${string}`): `/${string}` {
  return sanitizeRelativePath(formData.get("next"), fallback);
}
