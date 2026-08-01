import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { parentMoreNav, parentNav } from "@/lib/navigation";
import { getNotificationCenter } from "@/lib/domain/communication-hub";
import { getParentPortalData } from "@/lib/domain/parent-portal";
import { resolveTenantPortalTheme } from "@/lib/theme/portal-theme-server";
import { getProgressNavigationLabel, portalThemeCssVariables } from "@/lib/theme/portal-theme-web";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePrivateShellContext("/portaal");
  const tenant = context.activeTenant;
  const role = tenant?.roles.map((item) => roleLabels[item]).join(", ") ?? "Portaal";
  const [notificationCenter, portal, resolvedTheme] = await Promise.all([
    getNotificationCenter(context, "/portaal/inbox"),
    getParentPortalData(),
    resolveTenantPortalTheme(tenant!.tenantId)
  ]);
  const theme = resolvedTheme.manifest;
  const themedNavigation = parentNav.map((item) =>
    item.href === "/portaal/ontwikkeling" ? { ...item, label: getProgressNavigationLabel(theme) } : item
  );

  return (
    <div
      className="portal-theme-root"
      data-portal-theme={theme.theme.key}
      data-portal-theme-release={theme.theme.release}
      style={portalThemeCssVariables(theme)}
    >
      <AppShell
        accent="parent"
        brand={{ title: tenant?.name ?? "Organisatie", subtitle: "Ouderportaal" }}
        contextSelector={{
          allLabel: "Alle kinderen",
          label: "Kies een kind",
          options: portal.participants.map((participant) => ({ label: participant.display_name, value: participant.id })),
          parameter: "kind"
        }}
        mobileBottomNav
        nav={themedNavigation}
        notificationCenter={notificationCenter}
        profileMenu={parentMoreNav}
        user={{ name: context.user.displayName ?? context.user.email ?? "NXTTRACK gebruiker", role }}
      >
        {children}
      </AppShell>
    </div>
  );
}
