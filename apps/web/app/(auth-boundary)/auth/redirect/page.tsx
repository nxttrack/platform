import { redirect } from "next/navigation";

import { getPreferredPrivatePathForRoles } from "@/lib/auth/guard";
import { getPasswordChangeRequirementForCurrentUser } from "@/lib/auth/password-requirements";
import { buildChangePasswordPath, buildLoginPath, buildNoAccessPath, buildTenantSwitchPath } from "@/lib/auth/redirects";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";

export const dynamic = "force-dynamic";

export default async function DefaultRedirectPage() {
  const context = await getTrustedAuthContext(await getActiveTenantSelection());

  if (context.status === "anonymous") {
    redirect(buildLoginPath("/auth/redirect"));
  }

  const passwordRequirement = await getPasswordChangeRequirementForCurrentUser();

  if (passwordRequirement.required) {
    redirect(buildChangePasswordPath("/auth/redirect", passwordRequirement.reason));
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
