import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function InstructorStudentsPage() {
  return <RoutePlaceholder kicker="Instructor shell" title="Leerlingen foundation" description="Leerlingdossiers en voortgangsbeoordeling worden in Phase 7 data-backed." items={["Dossiers", "Voortgang", "Notities", "Aanwezigheid"]} />;
}
