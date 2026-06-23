import { BarChart3, ListChecks, Users } from "lucide-react";
import { FeatureGrid, PageHero, PageSection } from "@/components/lovable/page-kit";

const items = [
  { icon: ListChecks, title: "Intake tot plaatsing", description: "Flow blijft centraal in de canon." },
  { icon: Users, title: "Ouder en instructeur shells", description: "Lovable shellstructuur blijft leidend." },
  { icon: BarChart3, title: "Tenant backoffice", description: "Planning, capaciteit en rapportage komen later met echte data." }
];

export default function NxttrackMarketingPage() {
  return (
    <main>
      <PageHero kicker="NXTTRACK marketing" title="Swim-first SaaS scaffold" sub="Marketing-route voor NXTTRACK, voorbereid op Lovable PageKit port." primary={{ href: "/nxttrack/zwemscholen", label: "Voor zwemscholen" }} secondary={{ href: "/", label: "Scaffold home" }} chips={["Next.js", "Lovable tokens", "Staging first"]} />
      <PageSection title="Marketing modules">
        <FeatureGrid items={items} />
      </PageSection>
    </main>
  );
}
