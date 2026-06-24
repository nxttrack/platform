import { redirect } from "next/navigation";

import { buildLoginPath, buildNoAccessPath, buildTenantSwitchPath } from "@/lib/auth/redirects";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getPreferredPrivatePathForRoles } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function DefaultRedirectPage() {
  const context = await getTrustedAuthContext(await getActiveTenantSelection());

  if (context.status === "anonymous") {
    redirect(buildLoginPath("/auth/redirect"));
  }

  if (context.platform?.roles.length) {
    redirect("/platform");
  }

  if (context.tenants.length > 1 && !context.activeTenant) {
    redirect(buildTenantSwitchPath("/auth/redirect"));
  }

  const preferredPath = getPreferredPrivatePathForRoles(context.activeTenant?.roles ?? context.roles);

  if (preferredPath) {
    redirect(preferredPath);
  }

  redirect(buildNoAccessPath("/auth/redirect", "no_membership"));
}
