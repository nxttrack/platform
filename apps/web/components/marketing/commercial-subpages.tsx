import { ArrowRight, CheckCircle2, Clock, Headset, LockKeyhole, Mail, MapPin, ShieldCheck, Sparkles, UserCheck, Waves } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export const commercialSubpageSlugs = ["prijzen", "demo", "contact", "privacy", "login"] as const;
export type CommercialSubpageSlug = (typeof commercialSubpageSlugs)[number];

export function MarketingCommercialSubpage({ slug }: { slug: CommercialSubpageSlug }) {
  switch (slug) {
    case "prijzen":
      return <PricingPage />;
    case "demo":
      return <DemoPage />;
    case "contact":
      return <ContactPage />;
    case "privacy":
      return <PrivacyPage />;
    case "login":
      return <MarketingLoginPage />;
  }
}

const plans = [
  {
    name: "Start",
    description: "Voor kleine zwemscholen die digitaal willen werken.",
    features: ["Ouderportaal", "Trainer app", "Basisplanning", "Voortgang", "Badges", "E-mailsupport"]
  },
  {
    name: "Groei",
    description: "Voor groeiende zwemscholen die alles op één plek willen.",
    features: ["Alles uit Start", "Wachtrijbeheer", "Diploma kluis", "Communicatiehub", "Websitemodules", "Rapportages", "Rollen & rechten"],
    highlighted: true,
    badge: "Meest gekozen"
  },
  {
    name: "Pro",
    description: "Voor grotere organisaties met meerdere locaties.",
    features: ["Multi-location", "Geavanceerde planning", "Custom rollen", "Audit-log", "Priority support", "Integraties op roadmap", "Custom onboarding"]
  }
];

function PricingPage() {
  return (
    <>
      <MarketingIntro kicker="Prijzen" title="Heldere plannen voor elke zwemschool." description="Kies een plan dat bij jouw organisatie past en stap op wanneer je verder groeit." />
      <section className="mx-auto max-w-7xl px-4 pb-16 md:px-8 md:pb-24">
        <div className="grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.name} className={plan.highlighted ? "relative flex flex-col rounded-2xl border border-slate-900 bg-slate-900 p-7 text-white shadow-xl" : "relative flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm"}>
              {plan.badge ? <span className="absolute -top-3 left-7 inline-flex items-center gap-1 rounded-full bg-[#B6FF2E] px-3 py-1 text-xs font-bold text-slate-900"><Sparkles className="h-3 w-3" />{plan.badge}</span> : null}
              <h2 className="text-lg font-bold">{plan.name}</h2>
              <p className={plan.highlighted ? "mt-1 text-sm text-white/70" : "mt-1 text-sm text-slate-600"}>{plan.description}</p>
              <div className="mt-5"><p className="text-3xl font-bold">Op aanvraag</p><p className={plan.highlighted ? "text-xs text-white/60" : "text-xs text-slate-500"}>Prijsvalidatie volgt vóór commerciële livegang</p></div>
              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2 text-sm"><CheckCircle2 className={plan.highlighted ? "mt-0.5 h-4 w-4 shrink-0 text-[#B6FF2E]" : "mt-0.5 h-4 w-4 shrink-0 text-emerald-600"} /><span className={plan.highlighted ? "text-white/90" : "text-slate-700"}>{feature}</span></li>)}
              </ul>
              <Link href="/nxttrack/demo" className={plan.highlighted ? "mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-[#B6FF2E] px-4 py-2.5 text-sm font-semibold text-slate-900" : "mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"}>Plan demo <ArrowRight className="h-4 w-4" /></Link>
            </article>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center"><p className="text-sm text-slate-700">Niet zeker welk plan past? <Link href="/nxttrack/contact" className="font-semibold text-primary">Neem contact op</Link> — we denken graag mee.</p></div>
      </section>
    </>
  );
}

function DemoPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <SmallKicker>Plan demo</SmallKicker>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">Zie NXTTRACK in actie.</h1>
          <p className="mt-3 max-w-xl text-base text-slate-600">Een persoonlijke demo rond jouw zwemschool. We laten zien hoe ouderportaal, trainer app en backoffice samenwerken.</p>
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Demo aanvragen</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">De publieke leadverwerking wordt pas geactiveerd met spambeveiliging, bewaartermijnen en een bevestigd ontvangstkanaal. Tot die gate gebruiken we e-mail, zonder een verzending te simuleren.</p>
            <a href="mailto:hello@nxttrack.nl?subject=NXTTRACK%20demo-aanvraag" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800">Vraag demo aan per e-mail <Mail className="h-4 w-4" /></a>
            <p className="mt-3 text-xs text-slate-500">Vermeld bij voorkeur het aantal leerlingen, instructeurs en je belangrijkste operationele uitdaging.</p>
          </div>
        </div>
        <aside className="space-y-3" aria-label="Demo voordelen">
          {[{ icon: Clock, title: "Binnen één werkdag reactie", text: "We plannen samen een geschikt moment." }, { icon: Headset, title: "Persoonlijke demo", text: "Afgestemd op jouw zwemschool en processen." }, { icon: ShieldCheck, title: "Zonder verplichtingen", text: "Een inhoudelijke sessie zonder verkoopdruk." }].map((item) => <InfoCard key={item.title} {...item} />)}
        </aside>
      </div>
    </div>
  );
}

function ContactPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 md:px-8 md:py-24">
      <div className="text-center"><SmallKicker>Contact</SmallKicker><h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">Laten we kennismaken.</h1><p className="mx-auto mt-3 max-w-xl text-base text-slate-600">Een vraag, idee of demo-aanvraag? Neem rechtstreeks contact op met het NXTTRACK-team.</p></div>
      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-3">
          <InfoCard icon={Mail} title="E-mail" text="hello@nxttrack.nl" />
          <InfoCard icon={MapPin} title="Locatie" text="Nederland" />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm font-semibold text-slate-900">Liever een productrondleiding?</p><p className="mt-1 text-sm text-slate-600"><Link href="/nxttrack/demo" className="font-semibold text-primary">Bekijk de demo-opties</Link>.</p></div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">Stuur een bericht</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Open je eigen e-mailprogramma om het bericht daadwerkelijk te verzenden. Zo tonen we pas een ontvangstbevestiging wanneer er ook echt een ontvangstkanaal gekoppeld is.</p>
          <a href="mailto:hello@nxttrack.nl?subject=Contact%20via%20NXTTRACK" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800">E-mail NXTTRACK <ArrowRight className="h-4 w-4" /></a>
        </div>
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 md:px-8 md:py-24">
      <SmallKicker>Privacy & AVG</SmallKicker>
      <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950">Privacy-first ontwerp.</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
        <p>NXTTRACK is ontworpen vanuit het principe dat ouder- en kindgegevens met zorg worden behandeld. Tenantisolatie, rollen en minimale datatoegang zijn technische uitgangspunten.</p>
        <h2 className="text-xl font-bold text-slate-900">Welke gegevens verwerkt het platform?</h2>
        <p>Alleen gegevens die nodig zijn voor de zwemschoolworkflow, zoals contactgegevens, gezinsrelaties, voortgang en aanwezigheid. De definitieve privacyverklaring en grondslagen worden vóór commerciële livegang juridisch gevalideerd.</p>
        <h2 className="text-xl font-bold text-slate-900">Rollen, rechten en herleidbaarheid</h2>
        <p>Backoffice, instructeurs en ouders hebben een eigen toegangscontext. Belangrijke beheersacties kunnen in een audit-log worden vastgelegd.</p>
        <h2 className="text-xl font-bold text-slate-900">Analytics en leadherkomst</h2>
        <p>
          Google Analytics wordt alleen geladen nadat een bezoeker analytics toestaat. NXTTRACK stuurt geen namen, e-mailadressen of kindgegevens naar Google.
          Bij een daadwerkelijk verstuurde intake kan de zwemschool in NXTTRACK zelf beperkte herkomstgegevens zien, zoals campagne, kanaal, verwijzende website en landingspad.
          Advertentie-click-ID&apos;s worden niet inhoudelijk opgeslagen; alleen de aanwezigheid ervan kan worden gebruikt om het kanaal te classificeren.
        </p>
        <h2 className="text-xl font-bold text-slate-900">Verwerkersafspraken en hosting</h2>
        <p>Verwerkersovereenkomsten, subverwerkers, bewaartermijnen en hostingclaims worden als releasegate vastgelegd. Deze pagina doet daarom geen onbevestigde juridische beloftes.</p>
        <p className="border-t border-slate-200 pt-6 text-xs text-slate-500">Vragen? <Link href="/nxttrack/contact" className="font-semibold text-primary">Neem contact op</Link>.</p>
      </div>
    </article>
  );
}

function MarketingLoginPage() {
  const environments = [
    { icon: Waves, title: "Ouder / leerling", text: "Lessen, voortgang, berichten, betalingen en diploma's.", href: "/login?next=%2Fportaal" },
    { icon: UserCheck, title: "Trainer", text: "Agenda, groepen, aanwezigheid en beoordeling.", href: "/login?next=%2Finstructor" },
    { icon: LockKeyhole, title: "Beheerder", text: "Planning, leden, intake, communicatie en rapportage.", href: "/login?next=%2Fadmin" }
  ];

  return (
    <div className="mx-auto grid min-h-[calc(100vh-200px)] max-w-7xl gap-12 px-4 py-12 md:grid-cols-2 md:px-8 md:py-20">
      <div className="flex flex-col justify-center">
        <Image src="/lovable/nxttrack-logo.svg" alt="NXTTRACK" width={169} height={36} className="h-7 w-auto" />
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Welkom terug.</h1>
        <p className="mt-2 text-sm text-slate-600">Kies je omgeving en ga verder via de beveiligde NXTTRACK-login.</p>
        <div className="mt-8 grid max-w-xl gap-3">
          {environments.map((environment) => <Link key={environment.title} href={environment.href} aria-label={`Open ${environment.title} login`} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary"><environment.icon className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold text-slate-900">{environment.title}</h2><p className="mt-1 text-sm text-slate-600">{environment.text}</p></div><ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1" /></Link>)}
        </div>
      </div>
      <div className="relative hidden overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-primary p-10 md:flex md:flex-col md:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-[#B6FF2E]">NXTTRACK platform</p><h2 className="mt-3 text-3xl font-bold text-white">Eén toegangspoort, drie duidelijke werkruimtes.</h2><p className="mt-2 max-w-sm text-sm text-white/70">De echte loginflow bewaakt tenant- en roltoegang; deze marketingpagina verzamelt geen wachtwoorden.</p></div>
        <div className="grid grid-cols-3 gap-3">{["Ouders", "Trainers", "Backoffice"].map((label) => <div key={label} className="rounded-xl bg-white/5 p-4 text-center ring-1 ring-white/10"><p className="text-xs font-semibold text-white">{label}</p></div>)}</div>
      </div>
    </div>
  );
}

function MarketingIntro({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <section className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white"><div className="mx-auto max-w-7xl px-4 py-16 text-center md:px-8 md:py-24"><SmallKicker>{kicker}</SmallKicker><h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-950 md:text-5xl">{title}</h1><p className="mx-auto mt-4 max-w-2xl text-base text-slate-600">{description}</p></div></section>;
}

function SmallKicker({ children }: { children: ReactNode }) {
  return <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-primary shadow-sm">{children}</span>;
}

function InfoCard({ icon: Icon, title, text }: { icon: typeof Mail; title: string; text: string }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5"><Icon className="h-5 w-5 text-primary" /><h2 className="mt-3 text-sm font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-600">{text}</p></article>;
}
