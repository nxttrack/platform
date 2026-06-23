import { CheckList, PageHero, PageSection } from "@/components/lovable/page-kit";

export default function IntakePage() {
  return (
    <main>
      <PageHero kicker="Dynamic intake" title="Intake skeleton" sub="Registratie, proefles en wachtlijst blijven een intake-optie, nog geen formulierlogica." primary={{ href: "/programmas", label: "Terug naar programma's" }} />
      <PageSection title="Nog te bouwen in Phase 5">
        <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-soft">
          <CheckList items={["Form config uit database", "Programma-specifieke velden", "Voorkeursdagen en tijden", "Submission status machine"]} />
        </div>
      </PageSection>
    </main>
  );
}
