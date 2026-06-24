import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function ParentProfilePage() {
  return <RoutePlaceholder kicker="Parent shell" title="Profiel foundation" description="Account, gezinsleden en voorkeuren blijven in Phase 2 read-only shellgebied." items={["Account", "Gezinsleden", "Voorkeuren", "Privacy"]} />;
}
