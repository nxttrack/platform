import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { ChildPortalShell } from "@/components/child/child-portal-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getChildPortalData } from "@/lib/domain/child-portal";
import { getChildPortalThemeRecipe } from "@/lib/theme/portal-child-theme-recipes";
import { portalThemeCssVariables } from "@/lib/theme/portal-theme-web";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function ChildLayout({ children }: { children: React.ReactNode }) {
  await requirePrivateShellContext("/kind");
  const data = await getChildPortalData();
  const manifest = data.theme.manifest;
  const recipe = getChildPortalThemeRecipe(manifest);
  return <div
    className="portal-theme-root child-theme-root"
    data-child-portal-contract="child-portal/1.0"
    data-child-reduced-motion={data.preferences.reducedMotion ? "true" : "false"}
    data-child-shell-recipe={recipe.shellRecipe}
    data-portal-theme={manifest.theme.key}
    style={portalThemeCssVariables(manifest) as CSSProperties}
  >
    <ChildPortalShell
      childName={data.child.firstName}
      logoUrl={data.tenant.logoUrl}
      readAloudEnabled={data.preferences.readAloudEnabled}
      sessionExpiresAt={data.sessionExpiresAt}
      soundEnabled={data.preferences.soundEnabled}
      tenantName={data.tenant.name}
      themeName={data.theme.displayName}
    >
      {children}
    </ChildPortalShell>
  </div>;
}
