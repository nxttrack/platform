import { Award, BarChart3, CalendarCheck, GraduationCap, ListChecks, MessageSquare, ShieldCheck, Users, Waves } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CheckList, FeatureGrid, FinalCTA, FloatCard, HeroVisual, PageHero, PageSection, Photo } from "@/components/lovable/page-kit";

export const metadata: Metadata = {
  title: "Voor zwemscholen — NXTTRACK",
  description: "Van intake tot diploma C. NXTTRACK ondersteunt de complete lifecycle van een moderne zwemschool.",
  openGraph: {
    title: "Voor zwemscholen — NXTTRACK",
    description: "Eén platform dat de hele zwemreis ondersteunt — voor ouders, kinderen, instructeurs en backoffice."
  }
};

const features = [
  { icon: ListChecks, title: "Intake & inschrijving", description: "Online intake met niveau-inschatting, voorkeuren en bewijsstukken." },
  { icon: Users, title: "Lesgroepen & instructeurs", description: "Stel groepen samen op niveau, leeftijd en beschikbaarheid." },
  { icon: CalendarCheck, title: "Planning & capaciteit", description: "Plan badmomenten, instructeurs en groepen in één overzicht." },
  { icon: BarChart3, title: "Rapportages & inzichten", description: "Aanwezigheid, voortgang en bezetting per programma." },
  { icon: GraduationCap, title: "Diploma-klaarmeldingen", description: "Signaleer automatisch wie klaar is voor afzwemmen." },
  { icon: MessageSquare, title: "Oudercommunicatie", description: "Eén plek voor berichten, nieuws en bevestigingen." }
];

const hierarchy = ["Programma", "Lesgroep", "Bad / locatie", "Zweminstructeur", "Lesmoment", "Leerling", "Voortgang", "Diploma"];

export default function SwimSchoolsPage() {
  return (
    <>
      <PageHero
        kicker="Voor zwemscholen"
        title="Software speciaal voor zwemscholen."
        sub="Van intake en wachtlijst tot diploma C. NXTTRACK ondersteunt de volledige zwemschool — voor ouders, kinderen, instructeurs en backoffice."
        primary={{ href: "/nxttrack/demo", label: "Plan demo" }}
        secondary={{ href: "/nxttrack/prijzen", label: "Bekijk prijzen" }}
        chips={["Intake", "Planning", "Voortgang", "Diploma kluis", "Communicatie"]}
        visual={
          <>
            <HeroVisual caption="Live · 24 lessen vandaag">
              <Photo label="Kinderen tijdens de zwemles" hint="Persoonlijke begeleiding" promptId="IMG-31-06" ratio="aspect-[4/5]" className="rounded-none border-0 shadow-none" priority />
            </HeroVisual>
            <FloatCard className="absolute -bottom-6 -left-4 hidden w-[230px] sm:block">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Bezetting vandaag</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">Bad 1 + Bad 2 · 92%</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-[92%] rounded-full bg-gradient-to-r from-primary to-sky-400" />
              </div>
            </FloatCard>
            <FloatCard className="absolute -right-3 top-10 hidden w-[210px] rotate-3 md:block" delay={0.5}>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Diploma-klaar</p>
              <p className="text-sm font-bold text-slate-900">12 kinderen 🎓</p>
              <p className="mt-1 text-[11px] text-slate-500">Geselecteerd voor afzwemmen za 11 mei</p>
            </FloatCard>
          </>
        }
      />

      <PageSection kicker="Lifecycle" title="Van eerste plons tot diploma C" sub="Eén platform dat de hele zwemreis ondersteunt — zonder versnipperde tools.">
        <FeatureGrid items={features} />
      </PageSection>

      <PageSection tinted kicker="Structuur" title="Eén duidelijke hiërarchie" sub="Ouders schrijven zich niet in voor een niveau, maar voor een programma. Het kind ontwikkelt vaardigheden richting diploma-klaar.">
        <ol className="mx-auto max-w-3xl space-y-2">
          {hierarchy.map((item, index) => (
            <li key={item} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
              <span className="text-sm font-semibold text-slate-900">{item}</span>
            </li>
          ))}
        </ol>
      </PageSection>

      <PageSection kicker="Praktijk" title="Hoe het werkt aan de badrand">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <Photo label="Instructeur met tablet aan de badrand" hint="1600×1200 · landschap" promptId="IMG-31-07" ratio="aspect-[4/3]" />
          <div>
            <CheckList
              items={[
                "Tijdens de les: vink per kind af welk onderdeel is geoefend",
                "Direct na de les: notities en complimenten toevoegen",
                "Voor het diplomamoment: certificaat automatisch klaar",
                "Voor ouders thuis: realtime voortgang in de app"
              ]}
            />
            <Link href="/nxttrack/trainer-app" className="mt-7 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800">
              Bekijk de trainer app →
            </Link>
          </div>
        </div>
      </PageSection>

      <PageSection tinted kicker="Veilig" title="AVG-bewust en herleidbaar">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "Privacy-first", description: "Minimale data en duidelijke toestemming." },
            { icon: Award, title: "Rollen & rechten", description: "Fijnmazig regelen wie wat ziet." },
            { icon: Waves, title: "Nederlandse context", description: "Gebouwd voor de Nederlandse zwemschoolpraktijk." }
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <item.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </PageSection>

      <FinalCTA variant="marketing" />
    </>
  );
}
