import { cookies, headers } from "next/headers";

import type { TrustedAuthContextOptions } from "@/lib/auth/server-context";

export const activeTenantCookieNames = {
  id: "nxttrack_active_tenant_id",
  slug: "nxttrack_active_tenant_slug"
} as const;

export async function getActiveTenantSelection(): Promise<TrustedAuthContextOptions> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  const activeTenantId = cookieStore.get(activeTenantCookieNames.id)?.value ?? null;
  const activeTenantSlug = cookieStore.get(activeTenantCookieNames.slug)?.value ?? headerStore.get("x-nxttrack-tenant-slug") ?? null;

  return {
    activeTenantId,
    activeTenantSlug
  };
}
