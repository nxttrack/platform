import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminGroupsPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Groepen foundation" description="Groups, sessions, resources en capacity worden in Phase 3 de eerste echte domeinpagina's." items={["Groups", "Sessions", "Resources", "Capacity"]} />;
}
