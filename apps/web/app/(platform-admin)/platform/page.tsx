import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function PlatformPage() {
  return <RoutePlaceholder kicker="Platform admin" title="Platform shell skeleton" description="Global tenant/domain/template management starts later and remains separate from tenant admin." items={["Tenants", "Domains", "Sector templates", "Audit"]} />;
}
