import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { adminNav } from "@/lib/navigation";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = context.activeTenant;
  const role = tenant?.roles.map((item) => roleLabels[item]).join(", ") ?? "Tenant admin";

  return (
    <AppShell brand={{ title: tenant?.name ?? "Tenant", subtitle: "Tenant Admin" }} nav={adminNav} user={{ name: context.user.displayName ?? context.user.email ?? "NXTTRACK gebruiker", role }} accent="admin">
      {children}
    </AppShell>
  );
}
