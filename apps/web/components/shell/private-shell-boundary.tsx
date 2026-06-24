import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { privateShellAccess, type PrivateShellKey } from "@/lib/auth/access";
import { buildLoginPath, buildNoAccessPath, buildTenantSwitchPath } from "@/lib/auth/redirects";
import { roleLabels } from "@/lib/auth/roles";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { evaluatePrivateShellAccessForContext, type AuthenticatedTrustedAuthContext, type TrustedAuthContext } from "@/lib/auth/trusted-context";

const shellLabels = {
  parent: {
    title: "Ouderportaal",
    subtitle: "Ouders & kinderen"
  },
  instructor: {
    title: "Instructeur",
    subtitle: "Lessen, aanwezigheid en voortgang"
  },
  tenant_admin: {
    title: "Tenant admin",
    subtitle: "Backoffice & planning"
  },
  platform_admin: {
    title: "Platform admin",
    subtitle: "NXTTRACK beheer"
  }
} as const satisfies Record<PrivateShellKey, { title: string; subtitle: string }>;

type PrivateShellBoundaryProps = {
  shell: PrivateShellKey;
  nav: NavItem[];
  accent: "parent" | "instructor" | "admin" | "platform";
  children: ReactNode;
};

export async function PrivateShellBoundary({ shell, nav, accent, children }: PrivateShellBoundaryProps) {
  const access = privateShellAccess[shell];
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(shell === "platform_admin" ? {} : selection);

  if (context.status === "anonymous") {
    redirect(buildLoginPath(access.pathPrefix));
  }

  const decision = evaluatePrivateShellAccessForContext(access.pathPrefix, context);

  if (!decision.allowed) {
    if (decision.reason === "tenant_context_required" && context.tenants.length > 0) {
      redirect(buildTenantSwitchPath(access.pathPrefix));
    }

    redirect(buildNoAccessPath(access.pathPrefix, decision.reason === "role_not_allowed" ? "role_not_allowed" : "no_membership"));
  }

  const brand = getShellBrand(shell, context);
  const user = getShellUser(context);

  return (
    <AppShell brand={brand} nav={nav} user={user} accent={accent} tenantSwitcherHref={context.tenants.length > 1 ? buildTenantSwitchPath(access.pathPrefix) : null}>
      {children}
    </AppShell>
  );
}

function getShellBrand(shell: PrivateShellKey, context: TrustedAuthContext) {
  const labels = shellLabels[shell];

  if (shell === "platform_admin") {
    return {
      title: "NXTTRACK",
      subtitle: labels.title
    };
  }

  return {
    title: context.activeTenant?.name ?? labels.title,
    subtitle: labels.subtitle
  };
}

function getShellUser(context: AuthenticatedTrustedAuthContext) {
  const displayName = context.user.displayName ?? context.user.email ?? "Ingelogde gebruiker";
  const primaryRole = context.activeTenant?.roles[0] ?? context.platform?.roles[0] ?? context.roles[0] ?? null;

  return {
    name: displayName,
    role: primaryRole ? roleLabels[primaryRole] : "Gebruiker"
  };
}
