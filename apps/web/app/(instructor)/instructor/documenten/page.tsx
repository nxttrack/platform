import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function InstructorDocumentsPage() {
  return <RoutePlaceholder kicker="Instructeur app" title="Documenten" description="Protocollen, documenten en rechten staan klaar als placeholder tot de bestandsopslag volledig is gekoppeld." items={["Protocollen", "Bestanden", "Rechten", "Opslag"]} status="Voorbereid" />;
}
