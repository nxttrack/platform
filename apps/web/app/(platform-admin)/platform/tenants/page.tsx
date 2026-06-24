import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function PlatformTenantsPage() {
  return <RoutePlaceholder kicker="Platform admin" title="Tenants foundation" description="Platform tenantbeheer blijft apart van tenant operations en wordt later data-backed." items={["Tenants", "Domains", "Status", "Support"]} />;
}
