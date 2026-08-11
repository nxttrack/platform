import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { PortalRouteFrame } from "@/components/parent/portal-route-frame";
import { privateRouteMetadata } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { parentMoreNav, parentNav } from "@/lib/navigation";
import { getNotificationCenter } from "@/lib/domain/communication-hub";
import { getParentPortalData } from "@/lib/domain/parent-portal";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProgressNavigationLabel, portalThemeCssVariables } from "@/lib/theme/portal-theme-web";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePrivateShellContext("/portaal");
  const tenant = context.activeTenant;
  const role = tenant?.roles.map((item) => roleLabels[item]).join(", ") ?? "Portaal";
  const [notificationCenter, portal, brandingResult] = await Promise.all([
    getNotificationCenter(context, "/portaal/inbox"),
    getParentPortalData(),
    createAdminClient()
      .from("tenant_branding")
      .select("logo_url, product_name")
      .eq("tenant_id", tenant!.tenantId)
      .eq("status", "active")
      .maybeSingle()
  ]);
  const resolvedTheme = portal.portalTheme;
  const theme = resolvedTheme.manifest;
  const branding = brandingResult.data;
  const activeEnrollmentByParticipant = new Map(
    portal.enrollments
      .filter((enrollment) => enrollment.status === "active")
      .map((enrollment) => [enrollment.participant_id, enrollment])
  );
  const programById = new Map(portal.programs.map((program) => [program.id, program]));
  const themedNavigation = parentNav.map((item) =>
    item.href === "/portaal/ontwikkeling" ? { ...item, label: getProgressNavigationLabel(theme) } : item
  );

  return (
    <div
      className="portal-theme-root"
      data-portal-theme={theme.theme.key}
      data-portal-theme-display-name={resolvedTheme.displayName}
      data-portal-theme-license={resolvedTheme.verifiedLicense ? "verified" : "fallback"}
      data-portal-theme-release={theme.theme.release}
      style={portalThemeCssVariables(theme)}
    >
      <AppShell
        accent="parent"
        brand={{
          logoUrl: normalizeSafeLogoUrl(branding?.logo_url),
          title: branding?.product_name?.trim() || tenant?.name || "Organisatie",
          subtitle: `${resolvedTheme.displayName} · Ouderportaal`
        }}
        contextSelector={{
          allLabel: "Alle kinderen",
          label: "Kies een kind",
          options: portal.participants.map((participant) => {
            const enrollment = activeEnrollmentByParticipant.get(participant.id);
            return {
              description: enrollment ? programById.get(enrollment.program_id)?.name ?? "Geen actief programma" : "Geen actief programma",
              label: compactChildName(participant.display_name),
              value: participant.id
            };
          }),
          parameter: "kind"
        }}
        contextSelectorPlacement="profile"
        mobileBottomNav
        nav={themedNavigation}
        notificationCenter={notificationCenter}
        profileMenu={parentMoreNav}
        user={{ name: context.user.displayName ?? context.user.email ?? "NXTTRACK gebruiker", role }}
      >
        <PortalRouteFrame manifest={theme}>{children}</PortalRouteFrame>
      </AppShell>
    </div>
  );
}

function compactChildName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "Kind";
  return `${parts[0]} ${parts.at(-1)?.[0] ?? ""}.`;
}

function normalizeSafeLogoUrl(value: string | null | undefined) {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}
