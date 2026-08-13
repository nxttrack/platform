import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export const portalFeatureKeys = [
  "swim.portal.parent_child_split",
  "swim.portal.child_mode",
  "swim.portal.parent_requests",
  "swim.portal.direct_child_login"
] as const;

export type PortalFeatureKey = (typeof portalFeatureKeys)[number];
export type PortalFeatureFlags = Record<PortalFeatureKey, boolean>;

export const getPortalFeatureFlags = cache(async (tenantId: string): Promise<PortalFeatureFlags> => {
  const result = await createAdminClient()
    .from("tenant_swim_rollouts")
    .select("feature_key, status")
    .eq("tenant_id", tenantId)
    .in("feature_key", [...portalFeatureKeys]);
  if (result.error) throw new Error("Portal feature flags could not be loaded");
  const enabled = new Set(
    (result.data ?? [])
      .filter((row) => row.status === "pilot" || row.status === "enabled")
      .map((row) => row.feature_key)
  );
  return Object.fromEntries(
    portalFeatureKeys.map((key) => [key, enabled.has(key)])
  ) as PortalFeatureFlags;
});
