import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function InstructorTasksPage() {
  return <RoutePlaceholder kicker="Instructor shell" title="Taken foundation" description="Lesvoorbereiding en opvolgtaken worden later gekoppeld aan sessies en leerlingen." items={["Taken", "Opvolging", "Sessies", "Signaleringen"]} />;
}
