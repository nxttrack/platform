import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function InstructorTasksPage() {
  return <RoutePlaceholder kicker="Instructeur app" title="Taken" description="Lesvoorbereiding en opvolgtaken staan klaar en worden later gekoppeld aan lessen, leerlingen en signaleringen." items={["Taken", "Opvolging", "Lessen", "Signaleringen"]} status="Voorbereid" />;
}
