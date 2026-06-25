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

  await supabase.auth.getClaims();

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};

function createTenantAwareResponse(request: NextRequest, resolution: TenantHostResolution) {
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nxttrack-host-kind", resolution.kind);
  requestHeaders.set("x-nxttrack-hostname", resolution.hostname);
  requestHeaders.set("x-nxttrack-pathname", request.nextUrl.pathname);

  if (resolution.kind === "tenant_subdomain") {
    requestHeaders.set("x-nxttrack-tenant-slug", resolution.slug);
    requestHeaders.set("x-nxttrack-tenant-base-domain", resolution.baseDomain);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}
