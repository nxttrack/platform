import "server-only";

import { NextResponse } from "next/server";

import { getTrustedAuthContextForAccessToken } from "./server-context";
import type { AuthenticatedTrustedAuthContext } from "./trusted-context";

export type NativeClientKind = "instructor" | "parent";

export type NativeApiGuard =
  | {
      ok: true;
      accessToken: string;
      context: AuthenticatedTrustedAuthContext & {
        activeTenant: NonNullable<AuthenticatedTrustedAuthContext["activeTenant"]>;
      };
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireNativeApiContext(
  request: Request,
  client: NativeClientKind
): Promise<NativeApiGuard> {
  const accessToken = readBearerToken(request);
  if (!accessToken) {
    return rejected("unauthorized", 401);
  }
  const requestedTenantId = request.headers.get("x-nxttrack-tenant-id")?.trim() || null;
  const context = await getTrustedAuthContextForAccessToken(accessToken, {
    activeTenantId: requestedTenantId
  });

  return evaluateNativeApiContext({
    accessToken,
    client,
    context,
    requestedTenantId
  });
}

export function evaluateNativeApiContext(input: {
  accessToken: string;
  client: NativeClientKind;
  context: Awaited<ReturnType<typeof getTrustedAuthContextForAccessToken>>;
  requestedTenantId?: string | null;
}): NativeApiGuard {
  if (input.context.status === "anonymous") {
    return rejected("unauthorized", 401);
  }
  if (input.context.security.mustChangePassword) {
    return rejected("password_change_required", 403);
  }
  if (!input.context.activeTenant) {
    if (input.requestedTenantId) {
      return rejected("tenant_forbidden", 403);
    }
    return {
      ok: false,
      response: nativeJson(
        {
          error: "tenant_required",
          tenants: input.context.tenants.map((tenant) => ({
            id: tenant.tenantId,
            name: tenant.name,
            roles: tenant.roles,
            sector: tenant.sector,
            slug: tenant.slug
          }))
        },
        { status: 409 }
      )
    };
  }
  if (input.context.activeTenant.sector !== "swim_school") {
    return rejected("unsupported_tenant_sector", 403);
  }

  const roles = input.context.activeTenant.roles;
  const allowed =
    input.client === "parent"
      ? roles.includes("parent")
      : roles.some((role) =>
          [
            "instructor",
            "tenant_owner",
            "tenant_admin",
            "tenant_staff"
          ].includes(role)
        );
  if (!allowed) {
    return rejected("client_role_forbidden", 403);
  }

  return {
    ok: true,
    accessToken: input.accessToken,
    context: input.context as AuthenticatedTrustedAuthContext & {
      activeTenant: NonNullable<AuthenticatedTrustedAuthContext["activeTenant"]>;
    }
  };
}

export function nativeJson(
  body: unknown,
  init: ResponseInit = {}
) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Vary", "Authorization, X-NXTTRACK-Tenant-Id");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function readNativeJsonBody(
  request: Request,
  maximumBytes = 64 * 1024
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType !== "application/json") return null;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) return null;
  const text = await request.text();
  if (!text || new TextEncoder().encode(text).byteLength > maximumBytes) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const accessToken = authorization.slice(7).trim();
  if (
    accessToken.length < 20 ||
    accessToken.length > 8192 ||
    /[\u0000-\u001f\u007f\s]/.test(accessToken)
  ) {
    return null;
  }
  return accessToken;
}

function rejected(error: string, status: number): NativeApiGuard {
  return {
    ok: false,
    response: nativeJson({ error }, { status })
  };
}
