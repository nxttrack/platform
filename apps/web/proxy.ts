import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { resolveTenantHost, type TenantHostResolution } from "@/lib/tenant/resolution";
import { getTenantRoutingConfig } from "@/lib/tenant/routing-config";

export async function proxy(request: NextRequest) {
  const tenantResolution = resolveTenantHost(request.headers.get("host") ?? request.nextUrl.host, getTenantRoutingConfig());
  let supabaseResponse = createTenantAwareResponse(request, tenantResolution);
  const config = getSupabasePublicConfig();

  if (!config) {
    return supabaseResponse;
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = createTenantAwareResponse(request, tenantResolution);
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
      }
    }
  });

  const claimsResult = await supabase.auth.getClaims();
  const sessionId = claimsResult.data?.claims?.session_id;
  if (typeof sessionId === "string") {
    const portalSessionResult = await supabase.rpc("resolve_current_portal_session");
    if (portalSessionResult.error) {
      return privateFailureResponse(request);
    }
    const portalMode = getPortalSessionMode(portalSessionResult.data);
    const pathname = request.nextUrl.pathname;
    if (portalMode === "locked") {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "portal_session_locked" },
          { status: 403, headers: privateHeaders() }
        );
      }
      if (!isPortalSessionRecoveryPath(pathname)) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("next", "/portaal");
        loginUrl.searchParams.set("error", "child_session_locked");
        const response = NextResponse.redirect(loginUrl);
        copyResponseCookies(supabaseResponse, response);
        return applyPrivateHeaders(response);
      }
    }
    if (portalMode === "child" && !isChildAllowedPath(pathname)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "child_session_capability_required" },
          { status: 403, headers: privateHeaders() }
        );
      }
      const response = NextResponse.redirect(new URL("/kind", request.url));
      copyResponseCookies(supabaseResponse, response);
      return applyPrivateHeaders(response);
    }
    if (portalMode === "parent" && (pathname === "/kind" || pathname.startsWith("/kind/"))) {
      const response = NextResponse.redirect(new URL("/portaal", request.url));
      copyResponseCookies(supabaseResponse, response);
      return applyPrivateHeaders(response);
    }
  }

  return isPrivatePath(request.nextUrl.pathname)
    ? applyPrivateHeaders(supabaseResponse)
    : supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};

function createTenantAwareResponse(request: NextRequest, resolution: TenantHostResolution) {
  const requestHeaders = new Headers(request.headers);
  const rewritePath = getHostRewritePath(request.nextUrl.pathname, resolution);

  requestHeaders.set("x-nxttrack-host-kind", resolution.kind);
  requestHeaders.set("x-nxttrack-hostname", resolution.hostname);

  if (resolution.kind === "tenant_subdomain") {
    requestHeaders.set("x-nxttrack-tenant-slug", resolution.slug);
    requestHeaders.set("x-nxttrack-tenant-base-domain", resolution.baseDomain);
  }

  if (rewritePath) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = rewritePath;

    return NextResponse.rewrite(rewriteUrl, {
      request: {
        headers: requestHeaders
      }
    });
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

function getHostRewritePath(pathname: string, resolution: TenantHostResolution): string | null {
  if (resolution.kind === "platform_marketing") {
    return pathname === "/" || isTenantShellPath(pathname) ? "/nxttrack" : null;
  }

  if (resolution.kind === "platform_admin" && (pathname === "/" || pathname === "/admin" || pathname.startsWith("/admin/"))) {
    return "/platform";
  }

  return null;
}

function isTenantShellPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/portaal" || pathname.startsWith("/portaal/") || pathname === "/kind" || pathname.startsWith("/kind/") || pathname === "/instructor" || pathname.startsWith("/instructor/");
}

function isPrivatePath(pathname: string) {
  return ["/admin", "/instructor", "/kind", "/platform", "/portaal"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  ) || pathname.startsWith("/api/files/");
}

function isChildAllowedPath(pathname: string) {
  return pathname === "/kind"
    || pathname.startsWith("/kind/")
    || pathname.startsWith("/api/child/");
}

function getPortalSessionMode(value: unknown): "child" | "locked" | "parent" {
  if (!value) return "parent";
  if (typeof value !== "object" || Array.isArray(value)) return "locked";
  const mode = (value as { mode?: unknown }).mode;
  return mode === "child" ? "child" : "locked";
}

function isPortalSessionRecoveryPath(pathname: string) {
  return pathname === "/login"
    || pathname.startsWith("/auth/")
    || pathname === "/wachtwoord-vergeten"
    || pathname === "/wachtwoord-resetten";
}

function privateHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex"
  } as const;
}

function applyPrivateHeaders<T extends NextResponse>(response: T): T {
  for (const [key, value] of Object.entries(privateHeaders())) response.headers.set(key, value);
  return response;
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
}

function privateFailureResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "portal_session_unavailable" },
      { status: 503, headers: privateHeaders() }
    );
  }
  return new NextResponse("Portal session temporarily unavailable", {
    status: 503,
    headers: privateHeaders()
  });
}
