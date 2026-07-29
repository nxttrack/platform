import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { parentNav } from "@/lib/navigation";
import { getNotificationCenter } from "@/lib/domain/communication-hub";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePrivateShellContext("/portaal");
  const tenant = context.activeTenant;
  const role = tenant?.roles.map((item) => roleLabels[item]).join(", ") ?? "Portaal";
  const notificationCenter = await getNotificationCenter(context, "/portaal/berichten");

  return (
    <AppShell brand={{ title: tenant?.name ?? "Organisatie", subtitle: "Portaal" }} nav={parentNav} user={{ name: context.user.displayName ?? context.user.email ?? "NXTTRACK gebruiker", role }} accent="parent" notificationCenter={notificationCenter}>
      {children}
    </AppShell>
  );
}
