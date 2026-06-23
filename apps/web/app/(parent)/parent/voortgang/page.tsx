import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function ParentProgressPage() {
  return <RoutePlaceholder kicker="Voortgang" title="Progress skeleton" description="Progress modules, scores en badges worden pas na instructor workflow actief." items={["Progress modules", "Scoring labels", "Badges", "Diplomas"]} />;
}
