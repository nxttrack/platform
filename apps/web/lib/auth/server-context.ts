import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import {
  identityBoundarySelects,
  mapIdentityRowsToTrustedAuthContext,
  type PlatformMembershipIdentityRow,
  type ProfileIdentityRow,
  type TenantMembershipIdentityRow,
  type UserSecurityIdentityRow
} from "./identity-boundary";
import { createAnonymousAuthContext, type TrustedAuthContext } from "./trusted-context";

export type TrustedAuthContextOptions = {
  activeTenantId?: string | null;
  activeTenantSlug?: string | null;
};

export async function getTrustedAuthContext(options: TrustedAuthContextOptions = {}): Promise<TrustedAuthContext> {
  const checkedAt = new Date().toISOString();

  if (!getSupabasePublicConfig()) {
    return createAnonymousAuthContext(checkedAt);
  }

  const supabase = await createClient();
  const [userResult, claimsResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getClaims()
  ]);
  const { user } = userResult.data;
  const userError = userResult.error;

  if (userError || !user) {
    return createAnonymousAuthContext(checkedAt);
  }

  const identity = createAdminClient();
  const [profileResult, userSecurityResult, tenantMembershipsResult, platformMembershipsResult] = await Promise.all([
    identity.from("profiles").select(identityBoundarySelects.profile).eq("id", user.id).maybeSingle(),
    identity.from("user_security").select(identityBoundarySelects.userSecurity).eq("user_id", user.id).maybeSingle(),
    identity.from("tenant_memberships").select(identityBoundarySelects.tenantMemberships).eq("user_id", user.id),
    identity.from("platform_memberships").select(identityBoundarySelects.platformMemberships).eq("user_id", user.id)
  ]);

  const context = mapIdentityRowsToTrustedAuthContext({
    user: {
      id: user.id,
      email: user.email ?? null
    },
    profile: profileResult.error ? null : (profileResult.data as ProfileIdentityRow | null),
    userSecurity: userSecurityResult.error ? null : (userSecurityResult.data as UserSecurityIdentityRow | null),
    tenantMemberships: tenantMembershipsResult.error ? [] : (tenantMembershipsResult.data as unknown as TenantMembershipIdentityRow[] | null),
    platformMemberships: platformMembershipsResult.error ? [] : (platformMembershipsResult.data as PlatformMembershipIdentityRow[] | null),
    activeTenantId: options.activeTenantId ?? null,
    activeTenantSlug: options.activeTenantSlug ?? null,
    checkedAt,
    sessionId: readSessionId(claimsResult.data?.claims)
  });
  await initializeParentPortalSession(context);
  return context;
}

export async function getTrustedAuthContextForAccessToken(
  accessToken: string,
  options: TrustedAuthContextOptions = {}
): Promise<TrustedAuthContext> {
  const checkedAt = new Date().toISOString();
  const config = getSupabasePublicConfig();

  if (
    !config ||
    accessToken.length < 20 ||
    accessToken.length > 8192 ||
    /[\u0000-\u001f\u007f\s]/.test(accessToken)
  ) {
    return createAnonymousAuthContext(checkedAt);
  }

  const supabase = createSupabaseClient(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
  const [userResult, claimsResult] = await Promise.all([
    supabase.auth.getUser(accessToken),
    supabase.auth.getClaims(accessToken)
  ]);
  const { user } = userResult.data;
  const userError = userResult.error;

  if (userError || !user) {
    return createAnonymousAuthContext(checkedAt);
  }

  const identity = createAdminClient();
  const [profileResult, userSecurityResult, tenantMembershipsResult, platformMembershipsResult] =
    await Promise.all([
      identity
        .from("profiles")
        .select(identityBoundarySelects.profile)
        .eq("id", user.id)
        .maybeSingle(),
      identity
        .from("user_security")
        .select(identityBoundarySelects.userSecurity)
        .eq("user_id", user.id)
        .maybeSingle(),
      identity
        .from("tenant_memberships")
        .select(identityBoundarySelects.tenantMemberships)
        .eq("user_id", user.id),
      identity
        .from("platform_memberships")
        .select(identityBoundarySelects.platformMemberships)
        .eq("user_id", user.id)
    ]);

  const context = mapIdentityRowsToTrustedAuthContext({
    user: {
      id: user.id,
      email: user.email ?? null
    },
    profile: profileResult.error
      ? null
      : (profileResult.data as ProfileIdentityRow | null),
    userSecurity: userSecurityResult.error
      ? null
      : (userSecurityResult.data as UserSecurityIdentityRow | null),
    tenantMemberships: tenantMembershipsResult.error
      ? []
      : (tenantMembershipsResult.data as unknown as TenantMembershipIdentityRow[] | null),
    platformMemberships: platformMembershipsResult.error
      ? []
      : (platformMembershipsResult.data as PlatformMembershipIdentityRow[] | null),
    activeTenantId: options.activeTenantId ?? null,
    activeTenantSlug: options.activeTenantSlug ?? null,
    checkedAt,
    sessionId: readSessionId(claimsResult.data?.claims)
  });
  await initializeParentPortalSession(context);
  return context;
}

async function initializeParentPortalSession(context: TrustedAuthContext) {
  if (context.status !== "authenticated" || !context.session?.id || !context.activeTenant?.tenantId) return;
  if (!context.roles.includes("parent") && !context.roles.includes("athlete")) return;
  const result = await createAdminClient().rpc("initialize_parent_portal_session_for_service", {
    p_session_id: context.session.id,
    p_tenant_id: context.activeTenant.tenantId,
    p_user_id: context.user.id
  });
  if (result.error) {
    console.error("[portal-session] Parent context initialization failed", { code: result.error.code });
    throw new Error("Portal session context is temporarily unavailable");
  }
}

function readSessionId(claims: Record<string, unknown> | undefined) {
  const value = claims?.session_id;
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}
