import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { platformNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePrivateShellContext("/platform");
  const role = context.platform?.roles.map((item) => roleLabels[item]).join(", ") ?? "Platform";

  return (
    <AppShell brand={{ title: "NXTTRACK", subtitle: "Platform Admin" }} nav={platformNav} user={{ name: context.user.displayName ?? context.user.email ?? "NXTTRACK gebruiker", role }} accent="platform">
      {children}
    </AppShell>
  );
}
