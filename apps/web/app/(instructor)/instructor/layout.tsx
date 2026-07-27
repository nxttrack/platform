import type { Metadata } from "next";

import { AppShell } from "@/components/shell/app-shell";
import { privateRouteMetadata } from "@/lib/auth/access";
import { roleLabels } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { instructorNav } from "@/lib/navigation";
import { getNotificationCenter } from "@/lib/domain/communication-hub";

export const metadata: Metadata = privateRouteMetadata;
export const dynamic = "force-dynamic";

export default async function InstructorLayout({ children }: { children: React.ReactNode }) {
  const context = await requirePrivateShellContext("/instructor");
  const tenant = context.activeTenant;
  const role = tenant?.roles.map((item) => roleLabels[item]).join(", ") ?? "Instructeur";
  const notificationCenter = await getNotificationCenter(context, "/instructor/berichten");

  return (
    <AppShell brand={{ title: tenant?.name ?? "Tenant", subtitle: "Instructeur" }} nav={instructorNav} user={{ name: context.user.displayName ?? context.user.email ?? "NXTTRACK gebruiker", role }} accent="instructor" notificationCenter={notificationCenter}>
      <div className="[&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11">{children}</div>
    </AppShell>
  );
}
