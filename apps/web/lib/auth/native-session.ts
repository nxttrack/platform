import "server-only";

import { createClient as createSupabaseClient, type Session } from "@supabase/supabase-js";

import { getTrustedAuthContextForAccessToken } from "./server-context";
import {
  evaluateNativeApiContext,
  nativeJson,
  type NativeClientKind
} from "./native-api";
import { requireSupabasePublicConfig } from "@/lib/supabase/config";

export function createNativeSessionClient() {
  const config = requireSupabasePublicConfig();
  return createSupabaseClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export function createNativeAccessTokenClient(accessToken: string) {
  const config = requireSupabasePublicConfig();
  return createSupabaseClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

export async function nativeSessionResponse(input: {
  session: Session;
  client: NativeClientKind;
  activeTenantId?: string | null;
}) {
  const context = await getTrustedAuthContextForAccessToken(input.session.access_token, {
    activeTenantId: input.activeTenantId ?? null
  });
  const guard = evaluateNativeApiContext({
    accessToken: input.session.access_token,
    client: input.client,
    context,
    requestedTenantId: input.activeTenantId ?? null
  });
  if (!guard.ok) return guard.response;

  return nativeJson({
    contractVersion: 1,
    session: {
      accessToken: input.session.access_token,
      expiresAt: input.session.expires_at ?? null,
      expiresIn: input.session.expires_in,
      refreshToken: input.session.refresh_token,
      tokenType: input.session.token_type
    },
    user: {
      displayName: guard.context.user.displayName,
      email: guard.context.user.email,
      id: guard.context.user.id
    },
    activeTenant: {
      id: guard.context.activeTenant.tenantId,
      name: guard.context.activeTenant.name,
      roles: guard.context.activeTenant.roles,
      sector: guard.context.activeTenant.sector,
      slug: guard.context.activeTenant.slug
    },
    tenants: guard.context.tenants.map((tenant) => ({
      id: tenant.tenantId,
      name: tenant.name,
      roles: tenant.roles,
      sector: tenant.sector,
      slug: tenant.slug
    }))
  });
}

export function readNativeClientKind(value: unknown): NativeClientKind | null {
  return value === "instructor" || value === "parent" ? value : null;
}

export function readOptionalTenantId(value: unknown) {
  return typeof value === "string" && isUuid(value) ? value : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
