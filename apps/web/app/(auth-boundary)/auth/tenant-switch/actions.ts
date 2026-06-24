"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { buildLoginPath, buildNoAccessPath, sanitizeLocalPath } from "@/lib/auth/redirects";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { activeTenantCookieNames } from "@/lib/auth/tenant-selection";

export async function selectTenantAction(formData: FormData) {
  const nextPath = sanitizeLocalPath(formData.get("next"));
  const tenantId = String(formData.get("tenantId") ?? "");
  const context = await getTrustedAuthContext();

  if (context.status === "anonymous") {
    redirect(buildLoginPath(nextPath));
  }

  const tenant = context.tenants.find((membership) => membership.tenantId === tenantId);

  if (!tenant) {
    redirect(buildNoAccessPath(nextPath, "tenant_required"));
  }

  const cookieStore = await cookies();
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/"
  };

  cookieStore.set(activeTenantCookieNames.id, tenant.tenantId, options);
  cookieStore.set(activeTenantCookieNames.slug, tenant.slug, options);

  redirect(nextPath);
}
