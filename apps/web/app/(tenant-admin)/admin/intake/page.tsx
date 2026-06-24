import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminIntakePage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Intake foundation" description="Dynamic intake configuratie en submissions worden in Phase 4 geactiveerd." items={["Form schema", "Submissions", "Voorkeuren", "Trial/waitlist"]} />;
}
