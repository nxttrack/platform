import { FeatureGrid, PageHero, PageSection } from "@/components/lovable/page-kit";
import { Clock, ListChecks, Waves } from "lucide-react";

const items = [
  { icon: Waves, title: "Programma cards", description: "Lovable program overview wordt hier later met echte programma's gevuld." },
  { icon: ListChecks, title: "Wachtlijst indicator", description: "Capaciteit en wachttijd komen pas na het domeinmodel." },
  { icon: Clock, title: "Voorkeursmomenten", description: "Intake voorkeuren worden in Phase 5 gekoppeld." }
];

export default function ProgramsPage() {
  return (
    <main>
      <PageHero kicker="Tenant public" title="Programma's skeleton" sub="Publieke programmamarkt als routebasis, nog zonder tenantdata." primary={{ href: "/intake", label: "Naar intake skeleton" }} secondary={{ href: "/", label: "Home" }} />
      <PageSection title="Program marketplace placeholders">
        <FeatureGrid items={items} />
      </PageSection>
    </main>
  );
}
