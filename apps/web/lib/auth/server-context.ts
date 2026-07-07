import { createClient } from "@/lib/supabase/server";
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
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return createAnonymousAuthContext(checkedAt);
  }

  const [profileResult, userSecurityResult, tenantMembershipsResult, platformMembershipsResult] = await Promise.all([
    supabase.from("profiles").select(identityBoundarySelects.profile).eq("id", user.id).maybeSingle(),
    supabase.from("user_security").select(identityBoundarySelects.userSecurity).eq("user_id", user.id).maybeSingle(),
    supabase.from("tenant_memberships").select(identityBoundarySelects.tenantMemberships).eq("user_id", user.id),
    supabase.from("platform_memberships").select(identityBoundarySelects.platformMemberships).eq("user_id", user.id)
  ]);

  return mapIdentityRowsToTrustedAuthContext({
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
    checkedAt
  });
}
