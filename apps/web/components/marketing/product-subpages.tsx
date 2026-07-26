import {
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  CalendarCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Globe,
  GraduationCap,
  Heart,
  Layers,
  ListChecks,
  LockKeyhole,
  MessageSquare,
  ScrollText,
  Share2,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  Users,
  Waves,
  WifiOff,
  Zap
} from "lucide-react";
import { CheckList, FeatureGrid, FinalCTA, FloatCard, HeroVisual, PageHero, PageSection, Photo } from "@/components/lovable/page-kit";

export const productSubpageSlugs = ["ouderportaal", "trainer-app", "backoffice", "wachtrij-planning", "badges-diplomas"] as const;
export type ProductSubpageSlug = (typeof productSubpageSlugs)[number];

export function MarketingProductSubpage({ slug }: { slug: ProductSubpageSlug }) {
  switch (slug) {
    case "ouderportaal":
      return <ParentPortalPage />;
    case "trainer-app":
      return <TrainerAppPage />;
    case "backoffice":
      return <BackofficePage />;
    case "wachtrij-planning":
      return <WaitlistPage />;
    case "badges-diplomas":
      return <BadgesAndDiplomasPage />;
  }
}

function ParentPortalPage() {
  const features = [
    { icon: UserCheck, title: "Dashboard voor ouders", description: "Volgende les, voortgang, berichten en acties in één overzicht." },
    { icon: Waves, title: "Kindprofiel", description: "Per kind: niveau, programma, instructeur en doelen." },
    { icon: Sparkles, title: "Badges & complimenten", description: "Trotse momenten worden zichtbaar gemaakt." },
    { icon: GraduationCap, title: "Diploma kluis", description: "Digitale diploma's veilig opgeslagen en deelbaar." },
    { icon: MessageSquare, title: "Berichten", description: "Direct contact met de zwemschool zonder losse kanalen." },
    { icon: FileText, title: "Documenten", description: "Voorwaarden, certificaten en bevestigingen op één plek." },
    { icon: CreditCard, title: "Betalingen", description: "Helder overzicht van openstaande en betaalde contributie." },
    { icon: Bell, title: "Meldingen", description: "Wijzigingen, herinneringen en alerts wanneer het uitkomt." },
    { icon: Award, title: "Veilig delen", description: "Diploma's en behaalde mijlpalen delen als ouders dat willen." }
  ];

  return (
    <>
      <PageHero
        kicker="Ouderportaal"
        title="Altijd weten waar je kind staat."
        sub="Geen losse appjes of onduidelijke updates. Ouders zien in één oogopslag de voortgang, volgende stappen en behaalde mijlpalen."
        primary={{ href: "/nxttrack/demo", label: "Plan demo" }}
        secondary={{ href: "/portaal", label: "Open demo-omgeving" }}
        chips={["Voortgang", "Berichten", "Diploma kluis", "Betalingen"]}
        visual={
          <>
            <HeroVisual caption="Emma · Diploma A · 75%">
              <Photo label="Ouder bekijkt de zwemapp op telefoon" promptId="IMG-31-08" ratio="aspect-[4/5]" className="rounded-none border-0 shadow-none" priority />
            </HeroVisual>
            <FloatCard className="absolute -bottom-6 -left-4 hidden w-[240px] sm:block">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Volgende les</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">Za 11 mei · 09:00</p>
              <p className="text-[11px] text-slate-500">Zwemvaardigheid 2 · Bad 2</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Bevestigd</p>
            </FloatCard>
            <FloatCard className="absolute -right-3 top-10 hidden w-[210px] rotate-3 md:block" delay={0.5}>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Compliment</p>
              <p className="text-xs font-bold text-slate-900">“Knap gedaan!”</p>
            </FloatCard>
          </>
        }
      />
      <PageSection kicker="Modules" title="Alles wat ouders nodig hebben — duidelijk en rustig"><FeatureGrid items={features} /></PageSection>
      <PageSection tinted title="Een ontwerp dat rust geeft" sub="Geen rapportgevoel en geen ranglijsten. Wel duidelijke voortgang en momenten om trots op te zijn.">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <Photo label="Ouder en kind bekijken samen de app" ratio="aspect-[4/5]" className="mx-auto max-w-[420px]" />
          <Photo label="Kindprofiel met badges" hint="1280×960 · productbeeld" ratio="aspect-[4/3]" />
        </div>
      </PageSection>
      <FinalCTA variant="marketing" />
    </>
  );
}

function TrainerAppPage() {
  const features = [
    { icon: Clock, title: "Vandaag overzicht", description: "Planning, groep en bad direct in beeld." },
    { icon: CheckCircle2, title: "Aanwezigheid", description: "Aanwezig, afwezig, te laat of ziek in één tik." },
    { icon: Zap, title: "4-tap voortgang", description: "Beoordeel onderdelen zonder de les te onderbreken." },
    { icon: Sparkles, title: "Badge uitgeven", description: "Geef direct erkenning wanneer een kind iets bereikt." },
    { icon: MessageSquare, title: "Notitie & bericht", description: "Korte notitie voor backoffice of ouder." },
    { icon: UserCheck, title: "Leerlingdossier", description: "Voortgang en aandachtspunten direct bij de hand." },
    { icon: FileText, title: "Feedbacktemplates", description: "Positieve feedback in een paar tikken." },
    { icon: WifiOff, title: "Offline-friendly", description: "Voorbereid op werken zonder stabiele ontvangst." },
    { icon: Award, title: "Groepsstatus", description: "Zie wie op koers ligt en wie aandacht nodig heeft." }
  ];

  return (
    <>
      <PageHero
        kicker="Trainer app"
        title="De trainer app die tijdens de les werkt."
        sub="Geen losse briefjes en geen administratie achteraf. De instructeur werkt aan de badrand of direct na de les in een snelle, duidelijke app."
        primary={{ href: "/nxttrack/demo", label: "Plan demo" }}
        secondary={{ href: "/instructor", label: "Open demo-omgeving" }}
        chips={["Aanwezigheid", "4-tap voortgang", "Offline-friendly", "Badges"]}
        visual={
          <>
            <HeroVisual caption="Groep Zeesterren · Bad 2">
              <Photo label="Instructeur met tablet aan de badrand" promptId="IMG-31-09" ratio="aspect-[4/5]" className="rounded-none border-0 shadow-none" priority />
            </HeroVisual>
            <FloatCard className="absolute -bottom-6 -left-4 hidden w-[230px] sm:block">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Aanwezigheid</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">7 van 8 · 1 te laat</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Sync klaar</p>
            </FloatCard>
            <FloatCard className="absolute -right-3 top-10 hidden w-[200px] rotate-3 md:block" delay={0.5}>
              <p className="text-[10px] font-semibold uppercase text-slate-500">Tap-snel</p>
              <p className="text-xs font-bold text-slate-900">Ruglig · ✓ ✓ ✓ ✓</p>
            </FloatCard>
          </>
        }
      />
      <PageSection kicker="Praktisch" title="Snel, touch-friendly en gemaakt voor de baan"><FeatureGrid items={features} /></PageSection>
      <PageSection tinted title="Gemaakt voor instructeurs">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <Photo label="Instructeur aan het werk bij het bad" ratio="aspect-[4/3]" />
          <Photo label="Trainer app — voortgang invoeren" hint="1280×960 · productbeeld" ratio="aspect-[4/3]" />
        </div>
      </PageSection>
      <FinalCTA variant="marketing" />
    </>
  );
}

const backofficeGroups = [
  { title: "Vandaag", items: ["Zwemlessen", "Trainer-taken", "Onbemande sessies", "Conflicten", "Capaciteit"] },
  { title: "Leden & groepen", items: ["Leden", "Lesgroepen", "Zweminstructeurs", "Uitnodigingen"] },
  { title: "Programma's", items: ["Diploma A / B / C", "Watergewenning", "Survival", "Privéles"] },
  { title: "Instroom", items: ["Aanmeldingen", "Intake-instellingen", "Wachtlijststatus"] },
  { title: "Communicatie", items: ["Communicatiehub", "Nieuws", "Events", "Templates"] },
  { title: "Website", items: ["Homepage", "Pagina's", "Menu", "Media", "Sponsoren"] },
  { title: "Beheer", items: ["Documenten", "Clubprofiel", "Instellingen"] },
  { title: "Beveiliging", items: ["Rollen & rechten", "Audit-log"] }
];

function BackofficePage() {
  const features = [
    { icon: BarChart3, title: "Dashboard", description: "Wat speelt er vandaag, deze week en deze maand." },
    { icon: CalendarCheck, title: "Planboard", description: "Lessen, instructeurs en baden in één raster." },
    { icon: Users, title: "Leden & groepen", description: "Beheer leden, families en groepen overzichtelijk." },
    { icon: ListChecks, title: "Instroom & wachtlijst", description: "Van aanmelding tot plaatsing in één flow." },
    { icon: MessageSquare, title: "Communicatiehub", description: "Berichten, nieuws en templates op één plek." },
    { icon: Globe, title: "Websitemodules", description: "Beheer de tenantwebsite direct mee." },
    { icon: FileText, title: "Documenten", description: "Voorwaarden en bewijsstukken centraal." },
    { icon: LockKeyhole, title: "Rollen & rechten", description: "Fijnmazig regelen wie wat ziet en mag." },
    { icon: ScrollText, title: "Audit-log", description: "Belangrijke acties zijn herleidbaar." }
  ];

  return (
    <>
      <PageHero
        kicker="Backoffice"
        title="Volledige controle over jouw zwemschool."
        sub="Eén dashboard voor planning, leden, programma's, communicatie en de dagelijkse operatie."
        primary={{ href: "/nxttrack/demo", label: "Plan demo" }}
        secondary={{ href: "/admin", label: "Open demo-omgeving" }}
        chips={["Dashboard", "Planning", "Leden", "Communicatie", "Websitemodules"]}
        visual={<BackofficeVisual />}
      />
      <PageSection kicker="Modules" title="Een complete tenantbackoffice"><FeatureGrid items={features} /></PageSection>
      <PageSection tinted kicker="Navigatie" title="Alles wat een tenantadmin nodig heeft" sub="Een overzichtelijke navigatie die meegroeit met jouw organisatie.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {backofficeGroups.map((group) => (
            <article key={group.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold text-slate-900">{group.title}</h3></div>
              <ul className="mt-3 space-y-1.5">{group.items.map((item) => <li key={item} className="text-xs text-slate-600">· {item}</li>)}</ul>
            </article>
          ))}
        </div>
      </PageSection>
      <PageSection title="Een dashboard dat rust geeft">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <Photo label="Coördinator gebruikt de backoffice" promptId="IMG-31-10" ratio="aspect-[4/3]" />
          <CheckList items={["Actueel overzicht van lessen, conflicten en capaciteit", "Instroom en wachtlijst in één flow", "Berichten, nieuws en templates centraal", "AVG-bewust met rollen en audit-log"]} />
        </div>
      </PageSection>
      <FinalCTA variant="marketing" />
    </>
  );
}

function BackofficeVisual() {
  return (
    <>
      <HeroVisual caption="Backoffice · De Waterlijn">
        <div className="bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[{ label: "Lessen vandaag", value: "24" }, { label: "Bezetting", value: "92%" }, { label: "Wachtlijst", value: "23" }].map((metric) => (
              <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold text-slate-500">{metric.label}</p><p className="mt-2 text-2xl font-bold text-slate-900">{metric.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {["09:00 · Watergewenning", "10:00 · Diploma A", "11:00 · Diploma B", "13:00 · Diploma C"].map((lesson, index) => (
              <div key={lesson} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800">
                {lesson}<span className={index === 2 ? "text-amber-700" : "text-emerald-700"}>{index === 2 ? "Onbemand" : "Bemand"}</span>
              </div>
            ))}
          </div>
        </div>
      </HeroVisual>
      <FloatCard className="absolute -bottom-6 -left-4 hidden w-[200px] sm:block"><p className="text-[10px] font-semibold uppercase text-slate-500">Aanmeldingen</p><p className="text-2xl font-bold text-slate-900">47</p><p className="text-[11px] text-emerald-700">+12% deze week</p></FloatCard>
      <FloatCard className="absolute -right-3 top-10 hidden w-[180px] rotate-3 md:block" delay={0.5}><p className="text-[10px] font-semibold uppercase text-slate-500">Conflicten</p><p className="text-2xl font-bold text-rose-600">2</p><p className="text-[11px] text-slate-500">Vragen om actie</p></FloatCard>
    </>
  );
}

function WaitlistPage() {
  const steps = ["Aanmelding", "Intake", "Niveau", "Beschikbaarheid", "Wachtlijst", "Plaatsing", "Bevestiging", "Eerste les"];
  const features = [
    { icon: ListChecks, title: "Intakeformulier", description: "Slimme intake met niveau-inschatting en voorkeuren." },
    { icon: Users, title: "Wachtlijst per programma", description: "Realtime status per programma en locatie." },
    { icon: Waves, title: "Beschikbare plekken", description: "Capaciteit per bad in één oogopslag." },
    { icon: Sparkles, title: "Plaatsingssuggesties", description: "Matches op basis van niveau en voorkeuren." },
    { icon: CalendarCheck, title: "Capaciteitsplanning", description: "Plan baden, instructeurs en programma's slimmer." },
    { icon: Bell, title: "Bevestigingen", description: "Ouders ontvangen heldere updates bij elke stap." }
  ];

  return (
    <>
      <PageHero kicker="Wachtrij & planning" title="Meer grip op instroom en capaciteit." sub="Een heldere flow van aanmelding tot eerste les. Minder handmatig plannen en betere communicatie naar ouders." primary={{ href: "/nxttrack/demo", label: "Plan demo" }} chips={["Intake", "Wachtlijst", "Plaatsing", "Bevestiging"]} visual={<WaitlistVisual />} />
      <PageSection kicker="Flow" title="Van aanmelding naar de juiste plek">
        <ol className="flex min-w-max items-center gap-2 overflow-x-auto pb-3">
          {steps.map((step, index) => (
            <li key={step} className="flex items-center"><div className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">{index + 1}</span>{step}</div>{index < steps.length - 1 ? <ArrowRight className="mx-1 h-4 w-4 text-slate-400" /> : null}</li>
          ))}
        </ol>
      </PageSection>
      <PageSection tinted kicker="Modules" title="Alles wat instroom soepel maakt"><FeatureGrid items={features} /></PageSection>
      <PageSection title="Helder voor ouders, rustig voor backoffice"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm"><CheckList items={["Ouders zien wachttijd per programma", "Backoffice krijgt plaatsingssuggesties", "Conflicten en dubbele plaatsingen worden gesignaleerd", "Bevestigingen en herinneringen volgen de workflow"]} /></div></PageSection>
      <FinalCTA variant="marketing" />
    </>
  );
}

function WaitlistVisual() {
  const rows = ["Emma de Vries", "Sem Jansen", "Noah Bakker", "Mila de Boer"];
  return (
    <>
      <HeroVisual caption="Wachtlijst · Diploma A">
        <div className="space-y-2 bg-white p-5">{rows.map((name, index) => <div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"><div><p className="text-xs font-semibold text-slate-900">{name}</p><p className="text-[11px] text-slate-500">Diploma A · wacht {index + 1} {index ? "weken" : "week"}</p></div><span className={index < 2 ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700" : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700"}>{index < 2 ? "Match gevonden" : "In wachtrij"}</span></div>)}</div>
      </HeroVisual>
      <FloatCard className="absolute -bottom-6 -left-4 hidden w-[220px] sm:block"><p className="text-[10px] font-semibold uppercase text-slate-500">Gemiddelde wachttijd</p><p className="text-2xl font-bold text-slate-900">2–4 wk</p></FloatCard>
      <FloatCard className="absolute -right-3 top-8 hidden w-[210px] rotate-3 md:block" delay={0.5}><p className="text-[10px] font-semibold uppercase text-slate-500">Plaatsingssuggestie</p><p className="text-xs font-bold text-slate-900">Sem → Dolfijntjes</p><p className="text-[11px] text-slate-500">Match 96% · za 10:00</p></FloatCard>
    </>
  );
}

function BadgesAndDiplomasPage() {
  const badges = [
    { title: "Eerste les", colors: "from-sky-400 to-blue-600", icon: Star },
    { title: "Waterheld", colors: "from-cyan-400 to-teal-600", icon: Waves },
    { title: "Ruglig Expert", colors: "from-amber-400 to-orange-600", icon: Trophy },
    { title: "Doorzetter", colors: "from-fuchsia-400 to-purple-600", icon: Zap },
    { title: "Diploma A", colors: "from-emerald-400 to-emerald-700", icon: GraduationCap },
    { title: "Super Sprong", colors: "from-rose-400 to-rose-600", icon: Sparkles },
    { title: "Zelfvertrouwen", colors: "from-indigo-400 to-indigo-700", icon: Award }
  ];

  return (
    <>
      <PageHero kicker="Badges & diploma's" title="Van voortgang naar trots." sub="Een kind onthoudt niet alleen dat het iets heeft gehaald. Een kind onthoudt dat iemand het zag." primary={{ href: "/nxttrack/demo", label: "Plan demo" }} chips={["Badges", "Complimenten", "Diploma kluis", "Achievement cards"]} visual={<><HeroVisual caption="Diploma A · Emma de Vries"><Photo label="Kind viert een behaald diploma" ratio="aspect-[4/5]" className="rounded-none border-0 shadow-none" priority /></HeroVisual><FloatCard className="absolute -bottom-6 -left-4 hidden w-[230px] sm:block"><p className="text-[10px] font-semibold uppercase text-slate-500">Nieuw behaald</p><p className="mt-1 text-sm font-bold text-slate-900">Diploma A 🎓</p></FloatCard><FloatCard className="absolute -right-3 top-10 hidden w-[210px] rotate-3 md:block" delay={0.5}><p className="text-[10px] font-semibold uppercase text-slate-500">Compliment</p><p className="text-xs font-bold text-slate-900">“Trots op je doorzettingsvermogen!”</p></FloatCard></>} />
      <PageSection kicker="Badgeplank" title="Momenten om trots op te zijn"><div className="flex flex-wrap justify-center gap-6 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 shadow-sm md:p-10">{badges.map((badge) => <div key={badge.title} className="flex flex-col items-center gap-2"><div className={`flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br ${badge.colors} text-white shadow-lg ring-4 ring-white`}><badge.icon className="h-9 w-9" /></div><span className="text-xs font-medium text-slate-700">{badge.title}</span></div>)}</div></PageSection>
      <PageSection tinted kicker="Diploma kluis" title="Digitale diploma's — veilig en deelbaar"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{["Watergewenning", "Diploma A", "Diploma B", "Diploma C"].map((diploma) => <article key={diploma} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white"><GraduationCap className="h-6 w-6" /></div><h3 className="mt-3 text-sm font-semibold text-slate-900">{diploma}</h3><p className="mt-1 text-xs text-slate-500">Automatisch gegenereerd in clubstijl, downloadbaar en deelbaar.</p></article>)}</div></PageSection>
      <PageSection title="Erkenning, geen wedstrijd"><div className="grid gap-8 lg:grid-cols-2 lg:items-center"><Photo label="Kind viert behaalde badge" ratio="aspect-[4/3]" /><div className="space-y-4">{[{ icon: Heart, title: "Persoonlijke voortgang", text: "De eigen reis, zonder vergelijking met anderen." }, { icon: Sparkles, title: "Complimenten van instructeurs", text: "Echte persoonlijke feedback na de les." }, { icon: Share2, title: "Deelbare achievement cards", text: "Trots delen als ouders dat willen." }].map((item) => <article key={item.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><item.icon className="h-5 w-5 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold text-slate-900">{item.title}</h3><p className="text-sm text-slate-600">{item.text}</p></div></article>)}</div></div></PageSection>
      <FinalCTA variant="marketing" />
    </>
  );
}
