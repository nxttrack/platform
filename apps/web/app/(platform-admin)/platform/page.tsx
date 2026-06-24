import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function PlatformPage() {
  return <RoutePlaceholder kicker="Platform admin" title="Platform shell foundation" description="Global tenant/domain/template management blijft gescheiden van tenant admin en gebruikt platformrollen." items={["Tenants", "Domains", "Sector templates", "Audit"]} />;
}
