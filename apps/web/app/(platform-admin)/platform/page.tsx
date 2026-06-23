import { AppShell } from "@/components/shell/app-shell";
import { RoutePlaceholder } from "@/components/shell/route-placeholder";
import { platformNav } from "@/lib/navigation";

export default function PlatformPage() {
  return (
    <AppShell brand={{ title: "NXTTRACK", subtitle: "Platform Admin" }} nav={platformNav} user={{ name: "Platform Admin", role: "Global" }} accent="platform">
      <RoutePlaceholder kicker="Platform admin" title="Platform shell skeleton" description="Global tenant/domain/template management starts later and remains separate from tenant admin." items={["Tenants", "Domains", "Sector templates", "Audit"]} />
    </AppShell>
  );
}
