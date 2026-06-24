import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminStudentsPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Leerlingen foundation" description="Participants, guardians en enrollments worden in Phase 3 data-backed." items={["Participants", "Guardians", "Enrollments", "Group membership"]} />;
}
