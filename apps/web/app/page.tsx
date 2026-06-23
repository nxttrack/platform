import { ArrowRight, Layers, ShieldCheck, Waves } from "lucide-react";
import Link from "next/link";
import { FeatureGrid, FinalCTA, PageHero, PageSection } from "@/components/lovable/page-kit";

const items = [
  {
    icon: Waves,
    title: "Swim-first basis",
    description: "Routegroepen en shells staan klaar voor tenant public, parent, instructor en tenant admin."
  },
  {
    icon: Layers,
    title: "Lovable behouden",
    description: "Tokens, radius, kleuren en shell-ritme zijn voorbereid op de Lovable UI-port."
  },
  {
    icon: ShieldCheck,
    title: "Nog geen productdata",
    description: "Auth, Supabase, betalingen en echte tenantdata starten pas in latere fases."
  }
];

export default function HomePage() {
  return (
    <main>
      <PageHero
        kicker="Phase 2 scaffold"
        title="NXTTRACK platform foundation"
        sub="Een minimale Next.js basis voor staging-validatie, route-skeletons en Lovable-tokenconsolidatie."
        primary={{ href: "/nxttrack", label: "Bekijk marketing skeleton" }}
        secondary={{ href: "/admin", label: "Open admin shell" }}
      />
      <PageSection kicker="Scope" title="Wat deze fase wel en niet doet">
        <FeatureGrid items={items} />
        <div className="mx-auto mt-8 max-w-3xl rounded-3xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Health endpoint</p>
              <p className="text-sm text-muted-foreground">Beschikbaar voor staging smoke checks.</p>
            </div>
            <Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow" href="/api/health">
              /api/health <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </PageSection>
      <FinalCTA />
    </main>
  );
}
