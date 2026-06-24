import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminProgramPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Programma's foundation" description="Program, stage en modulebeheer worden in Phase 3 de kern van het domeinmodel." items={["Programs", "Stages", "Modules", "Terminologie"]} />;
}
