import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminAgendaPage() {
  return <RoutePlaceholder kicker="Planboard" title="Planning skeleton" description="Resources, sessions, groups en conflicts komen na het domeinmodel." items={["Resources", "Groups", "Sessions", "Instructor conflicts"]} />;
}
