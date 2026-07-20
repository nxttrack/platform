"use client";

import {
  ArrowRight,
  Award,
  BarChart3,
  Bell,
  CalendarCheck,
  CheckCircle2,
  Compass,
  FileText,
  GraduationCap,
  Layers,
  ListChecks,
  LockKeyhole,
  MessageSquare,
  Newspaper,
  Play,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserCheck,
  Users,
  Waves,
  Zap
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Photo } from "@/components/lovable/page-kit";
import { cn } from "@/lib/utils";

const logoPath = "/lovable/nxttrack-logo.svg";

const chips = ["Ouderportaal", "Trainer app", "Backoffice", "Diploma kluis", "Wachtrijbeheer", "Badges & complimenten", "PWA / mobiel"];
const trustLogos = ["AquaSport", "Zwemschool De Golf", "AquaPro", "ZVZ Zwemmen", "Ocean Kids"];

const pains = [
  { icon: BarChart3, t: "Onduidelijke voortgang", d: "Ouders weten niet wat hun kind nu oefent of nog moet leren." },
  { icon: ListChecks, t: "Veel handmatig werk", d: "Spreadsheets, lijstjes en papier kosten instructeurs te veel tijd." },
  { icon: Users, t: "Wachtrij is lastig", d: "Plaatsing, intake en capaciteit lopen via verschillende kanalen." },
  { icon: Layers, t: "Versnipperde tools", d: "Diploma's, lessen en communicatie staan verspreid over apps." }
];

const modules = [
  { icon: UserCheck, t: "Ouderportaal", d: "Ouders volgen lessen, voortgang, betalingen, berichten en diploma's." },
  { icon: Sparkles, t: "Kindvriendelijke zwemreis", d: "Kinderen zien badges, complimenten en hun route naar Diploma A, B en C." },
  { icon: Zap, t: "Trainer app", d: "Instructeurs nemen aanwezigheid op, beoordelen voortgang en voegen notities toe." },
  { icon: Layers, t: "Backoffice", d: "Beheer leden, groepen, planning, programma's, communicatie en instellingen." },
  { icon: ListChecks, t: "Wachtrij & instroom", d: "Slimme intake, wachtlijststatus en beschikbare plekken per programma." },
  { icon: GraduationCap, t: "Diploma kluis", d: "Digitale diploma's veilig opgeslagen, downloadbaar en deelbaar." },
  { icon: Award, t: "Badges & complimenten", d: "Maak voortgang positief en motiverend met beloningen en feedback." },
  { icon: Newspaper, t: "Nieuws & communicatie", d: "Berichten, nieuws, alerts, nieuwsbrieven en templates vanuit één hub." }
];

const journey = ["Aanmelding", "Intake", "Niveau/programma", "Beschikbaarheid", "Wachtlijst", "Plaatsingsvoorstel", "Bevestiging", "Eerste les"];
const stats = [
  { v: "156", l: "Actieve leerlingen" },
  { v: "24", l: "Lessen vandaag" },
  { v: "92%", l: "Bezettingsgraad" },
  { v: "2-4 wk", l: "Wachttijd" },
  { v: "86", l: "Badges deze maand" },
  { v: "47", l: "Nieuwe aanmeldingen" }
];

const badges = [
  { t: "Eerste les", c: "from-sky-400 to-blue-600", i: Star },
  { t: "Waterheld", c: "from-cyan-400 to-teal-600", i: Waves },
  { t: "Ruglig Expert", c: "from-amber-400 to-orange-600", i: Trophy },
  { t: "Doorzetter", c: "from-fuchsia-400 to-purple-600", i: Zap },
  { t: "Diploma A", c: "from-emerald-400 to-emerald-700", i: GraduationCap },
  { t: "Super Sprong", c: "from-rose-400 to-rose-600", i: Sparkles },
  { t: "Zelfvertrouwen", c: "from-indigo-400 to-indigo-700", i: Award }
];

const sports = [
  { t: "Zwemmen", i: Waves, active: true },
  { t: "Voetbal", i: Compass },
  { t: "Tennis", i: Trophy },
  { t: "Turnen", i: Sparkles },
  { t: "Dans", i: Star },
  { t: "Hockey", i: Award }
];

const security = [
  { i: ShieldCheck, t: "Gegevens veilig verwerkt", d: "Ouder- en kindgegevens worden zorgvuldig en AVG-bewust verwerkt." },
  { i: LockKeyhole, t: "Rollen & rechten", d: "Fijnmazig regelen wie wat ziet en doet binnen jouw organisatie." },
  { i: ScrollText, t: "Audit-log", d: "Belangrijke acties zijn herleidbaar voor verantwoording en compliance." },
  { i: FileText, t: "Privacy-first ontwerp", d: "Minimale data, duidelijke toestemming en Nederlandse uitgangspunten." }
];

export function NxttrackMarketingPage() {
  return (
    <>
      <Hero />
      <ProductPreview />
      <Problem />
      <Modules />
      <ParentExperience />
      <TrainerExperience />
      <Backoffice />
      <WaitlistFlow />
      <BadgeSection />
      <TenantSites />
      <Sports />
      <Security />
      <Moments />
      <FinalCTA />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/3 h-[600px] w-[1100px] -translate-x-1/2 rounded-full bg-gradient-to-br from-blue-100 via-sky-50 to-transparent blur-3xl" />
        <div className="absolute -right-20 top-40 h-80 w-80 rounded-full bg-[#B6FF2E]/25 blur-3xl" />
      </div>
      <div className="mx-auto max-w-7xl px-4 pb-16 pt-12 md:px-8 md:pb-24 md:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-[#B6FF2E]" />
              Gebouwd voor zwemscholen. Klaar voor elke sport.
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-slate-950 md:text-6xl">
              Het next-gen platform voor <span className="bg-gradient-to-r from-[#1D4ED8] to-[#2563EB] bg-clip-text text-transparent">moderne zwemscholen.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-slate-600 md:text-lg">
              Van ouderportaal en trainer app tot planning, diploma's, badges, wachtrijbeheer en communicatie — NXTTRACK brengt de volledige zwemreis samen in één modern platform.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/nxttrack/demo" className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
                Plan demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/nxttrack/zwemscholen" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
                <Play className="h-4 w-4" /> Bekijk platform
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span key={c} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-slate-900/10">
              <Photo label="Foto: kind leert zwemmen met persoonlijke begeleiding" hint="1536x1024 · hero" ratio="aspect-[5/6] md:aspect-[4/5]" className="w-full rounded-none border-0 shadow-none" />
              <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/40 via-transparent to-transparent" />
              <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold text-slate-700 backdrop-blur">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live · Diploma A · Bad 2
              </div>
            </div>
            <div className="absolute -bottom-6 -left-4 hidden w-[230px] rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:block">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Voortgang Emma</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">Diploma A · 75%</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#1D4ED8] to-sky-400" />
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ruglig Expert behaald
              </div>
            </div>
            <div className="absolute -right-3 top-10 hidden w-[200px] rotate-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur md:block">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-600 text-white">
                  <Trophy className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase text-slate-500">Nieuwe badge</p>
                  <p className="text-xs font-bold text-slate-900">Waterheld</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="border-y border-slate-200 bg-slate-50/60">
        <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Vertrouwd door moderne zwemscholen en sportorganisaties</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {trustLogos.map((l) => (
              <span key={l} className="text-sm font-semibold text-slate-400">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPreview() {
  return (
    <section className="relative">
      <div className="mx-auto max-w-7xl px-4 pt-16 md:px-8 md:pt-24">
        <SectionIntro kicker="Het product" title="Eén platform. Drie perspectieven." sub="Backoffice, ouder en instructeur — zorgvuldig op elkaar afgestemd." />
        <div className="relative mx-auto max-w-6xl">
          <DashboardMock />
          <PhoneMock className="absolute -bottom-8 left-2 hidden w-[200px] md:block lg:-bottom-10 lg:-left-6 lg:w-[230px]" />
          <BadgeMock className="absolute -right-2 -top-6 hidden w-[220px] rotate-3 md:block lg:-right-8 lg:w-[260px]" />
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <Section kicker="Probleem" title="Zwemles organiseren hoeft niet versnipperd te zijn." sub="Zwemscholen werken vaak met losse tools voor planning, voortgang, WhatsApp, spreadsheets, diploma's, intake, wachtlijsten en ouder-communicatie. Dat kost tijd, overzicht en plezier.">
      <CardGrid items={pains} tone="rose" />
      <div className="mt-8 flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 text-center">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        <p className="text-sm font-semibold text-slate-900">NXTTRACK brengt alles samen — in één modern platform.</p>
      </div>
    </Section>
  );
}

function Modules() {
  return (
    <Section kicker="Platform" title="Alles wat jouw zwemschool nodig heeft. In één platform." sub="Acht krachtige modules die naadloos samenwerken — en stuk voor stuk gemaakt voor de praktijk.">
      <CardGrid items={modules} />
    </Section>
  );
}

function ParentExperience() {
  return (
    <SplitSection kicker="Ouders & kinderen" title="Een positieve zwemreis voor ieder kind." sub="Ouders krijgen overzicht. Kinderen krijgen vertrouwen." imageLabel="Foto: ouder en kind kijken samen in de app">
      <CheckList items={["Duidelijke voortgang zonder rapportgevoel", "Badges die kinderen trots maken", "Complimenten van de instructeur na de les", "Diploma's veilig bewaard in de kluis", "Ouders altijd op de hoogte"]} />
      <Link href="/nxttrack/ouderportaal" className="mt-7 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
        Meer over het ouderportaal <ArrowRight className="h-4 w-4" />
      </Link>
    </SplitSection>
  );
}

function TrainerExperience() {
  return (
    <SplitSection kicker="Trainer app" title="Sneller beoordelen. Meer aandacht voor het kind." sub="Geen losse briefjes of administratie achteraf. De instructeur werkt tijdens of direct na de les in een snelle, duidelijke app." imageLabel="Foto: instructeur aan de badrand met tablet" tinted reverse>
      <CheckList items={["Aanwezig / afwezig / te laat / ziek in één tik", "4-tap voortgang invoeren per onderdeel", "Positieve feedback-templates", "Leerlingdossier direct zichtbaar", "Groepsstatus en aandachtspunten"]} />
      <Link href="/nxttrack/trainer-app" className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        Bekijk trainer app <ArrowRight className="h-4 w-4" />
      </Link>
    </SplitSection>
  );
}

function Backoffice() {
  return (
    <Section kicker="Backoffice" title="Rust en overzicht voor de zwemschool." sub="Een dashboard dat laat zien wat er vandaag gebeurt — en wat aandacht nodig heeft.">
      <DashboardMock compact />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Stat key={s.l} {...s} />
        ))}
      </div>
    </Section>
  );
}

function WaitlistFlow() {
  return (
    <Section kicker="Wachtrij & planning" title="Van aanmelding naar juiste plek. Slimmer en sneller." sub="Eén heldere flow van intake tot eerste les. Met automatische plaatsingssuggesties en transparante communicatie naar ouders." tinted>
      <div className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-2">
          {journey.map((j, i) => (
            <li key={j} className="flex items-center">
              <div className="flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-[10px] text-white">{i + 1}</span>
                {j}
              </div>
              {i < journey.length - 1 ? <ArrowRight className="mx-1 h-4 w-4 text-slate-400" /> : null}
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {["Wachttijd per programma", "Beschikbare plekken", "Plaatsingssuggesties", "Bevestigingen"].map((t) => (
          <PlainCard key={t} title={t} text="Realtime inzicht voor ouders en backoffice." />
        ))}
      </div>
    </Section>
  );
}

function BadgeSection() {
  return (
    <Section kicker="Badges & diploma's" title="Maak ontwikkeling zichtbaar, positief en deelbaar." sub="Niet alleen cijfers en vinkjes, maar momenten waar kinderen trots op zijn.">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 md:p-10">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Badge-plank</p>
        <div className="mt-5 flex flex-wrap gap-5">
          {badges.map((b) => (
            <div key={b.t} className="flex flex-col items-center gap-2">
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br ${b.c} text-white shadow-md ring-4 ring-white`}>
                <b.i className="h-7 w-7" />
              </div>
              <span className="text-xs font-medium text-slate-700">{b.t}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

function TenantSites() {
  return (
    <Section kicker="Websites" title="Ook de website van jouw zwemschool kan meebewegen." sub="NXTTRACK biedt organisatiegerichte pagina's, zodat je website altijd up-to-date is met programma's, locaties, nieuws en wachtlijststatus." tinted>
      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <TenantSiteMock />
        <div>
          <ul className="grid grid-cols-2 gap-2 text-sm text-slate-700">
            {["Programma's", "Over ons", "Locaties", "Nieuws", "Wachtlijst", "Intake CTA", "Trainerbio's", "Sponsoren", "Media Wall"].map((t) => (
              <li key={t} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {t}
              </li>
            ))}
          </ul>
          <Link href="/" className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
            Bekijk demo organisatiesite <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </Section>
  );
}

function Sports() {
  return (
    <Section kicker="Modulair" title="Eerst gebouwd voor zwemscholen. Klaar voor andere sporten." sub="De kern van NXTTRACK is modulair: programma's, groepen, sessies, trainers, voortgang, badges, communicatie en planning. Daardoor groeit het platform later eenvoudig mee.">
      <div className="flex flex-wrap gap-3">
        {sports.map((s) => (
          <div key={s.t} className={cn("flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold", s.active ? "border-[#1D4ED8] bg-[#1D4ED8] text-white shadow-sm" : "border-slate-200 bg-white text-slate-700")}>
            <s.i className="h-4 w-4" /> {s.t}
          </div>
        ))}
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-500">En meer...</div>
      </div>
    </Section>
  );
}

function Security() {
  return (
    <Section kicker="Vertrouwen" title="Veilig, professioneel en AVG-bewust." sub="Een platform voor kinderen, ouders en organisaties vraagt om zorgvuldige omgang met data. NXTTRACK ontwerpt vanuit privacy en duidelijke rollen." tinted>
      <CardGrid items={security} dark />
    </Section>
  );
}

function Moments() {
  return (
    <Section kicker="Momenten" title="Echte momenten. Echte mensen." sub="Een instructeur die complimenten geeft. Een kind dat zijn diploma toont. Een ouder die de app opent.">
      <div className="grid gap-4 md:grid-cols-3">
        <Photo label="Foto: kind toont diploma" hint="1200x1500" ratio="aspect-[4/5]" />
        <div className="grid gap-4">
          <Photo label="Foto: instructeur op badrand" hint="1200x900" ratio="aspect-[4/3]" />
          <Photo label="Foto: ouder bekijkt app" hint="1200x900" ratio="aspect-[4/3]" />
        </div>
        <Photo label="Foto: groep kinderen in bad" hint="1200x1500" ratio="aspect-[4/5]" />
      </div>
      <p className="mt-6 text-center text-xs text-slate-500">Tip: gebruik warme, natuurlijke beelden — geen stockfoto's.</p>
    </Section>
  );
}

function FinalCTA() {
  return (
    <section className="px-4 pb-20 pt-16 md:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0F172A] p-10 text-white shadow-xl md:p-16">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#B6FF2E]">Klaar voor de volgende stap</p>
            <h2 className="mt-3 text-3xl font-bold leading-tight md:text-4xl">Klaar om jouw zwemschool next-gen te maken?</h2>
            <p className="mt-3 max-w-xl text-sm text-white/70 md:text-base">Plan een demo en ontdek hoe NXTTRACK planning, voortgang, ouders, kinderen en instructeurs samenbrengt.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/nxttrack/demo" className="inline-flex items-center gap-2 rounded-lg bg-[#B6FF2E] px-5 py-3 text-sm font-bold text-slate-900 hover:bg-[#a8f01a]">
                Plan demo <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/nxttrack/zwemscholen" className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10">
                Bekijk modules
              </Link>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 px-6 py-8 ring-1 ring-white/10">
            <img src={logoPath} alt="NXTTRACK" className="h-8 w-auto brightness-0 invert" />
            <p className="text-center text-xs text-white/60">Eén platform voor de hele zwemschool</p>
          </div>
        </div>
      </div>
    </section>
  );
}


function SplitSection({ kicker, title, sub, imageLabel, tinted, reverse, children }: { kicker: string; title: string; sub: string; imageLabel: string; tinted?: boolean; reverse?: boolean; children: ReactNode }) {
  return (
    <Section kicker={kicker} title={title} sub={sub} tinted={tinted}>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className={reverse ? "" : "order-2 lg:order-1"}>{children}</div>
        <div className={reverse ? "" : "order-1 lg:order-2"}>
          <div className="relative mx-auto w-fit">
            <Photo label={imageLabel} hint="1200x1500 · portret" ratio="aspect-[4/5]" className="w-[300px] md:w-[360px]" />
            {reverse ? <TrainerMock className="absolute -bottom-8 -right-10 hidden md:block lg:-right-14" /> : <PhoneMock className="absolute -bottom-6 -right-10 hidden w-[180px] md:block lg:-right-14 lg:w-[210px]" />}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Section({ kicker, title, sub, tinted, children }: { kicker?: string; title: string; sub?: string; tinted?: boolean; children: ReactNode }) {
  return (
    <section className={tinted ? "bg-slate-50/70" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
        <SectionIntro kicker={kicker} title={title} sub={sub} />
        {children}
      </div>
    </section>
  );
}

function SectionIntro({ kicker, title, sub }: { kicker?: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
      {kicker ? <p className="text-xs font-semibold uppercase tracking-wider text-[#1D4ED8]">{kicker}</p> : null}
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">{title}</h2>
      {sub ? <p className="mt-3 text-base text-slate-600">{sub}</p> : null}
    </div>
  );
}

function CardGrid({ items, tone = "blue", dark }: { items: { icon?: typeof Waves; i?: typeof Waves; t: string; d: string }[]; tone?: "blue" | "rose"; dark?: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon ?? item.i ?? Waves;
        return (
          <div key={item.t} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", dark ? "bg-slate-900/5 text-slate-900" : tone === "rose" ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-[#1D4ED8]")}>
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">{item.t}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.d}</p>
          </div>
        );
      })}
    </div>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <span className="text-sm text-slate-700">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DashboardMock({ compact }: { compact?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5">
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <div className="ml-4 flex-1">
          <div className="mx-auto h-5 w-64 rounded bg-white text-center text-[10px] leading-5 text-slate-400">app.nxttrack.nl/backoffice</div>
        </div>
      </div>
      <div className={cn("grid gap-4 p-5", compact ? "md:grid-cols-3" : "md:grid-cols-[200px_1fr]")}>
        <aside className="hidden flex-col gap-1 md:flex">
          {[
            { t: "Dashboard", i: BarChart3, active: true },
            { t: "Planning", i: CalendarCheck },
            { t: "Leden", i: Users },
            { t: "Wachtlijst", i: ListChecks },
            { t: "Berichten", i: MessageSquare },
            { t: "Diploma's", i: GraduationCap }
          ].map((n) => (
            <div key={n.t} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium", n.active ? "bg-slate-900 text-white" : "text-slate-600")}>
              <n.i className="h-3.5 w-3.5" /> {n.t}
            </div>
          ))}
        </aside>
        <div className={compact ? "md:col-span-2" : ""}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Goedemorgen, Lisa</p>
              <p className="text-lg font-bold text-slate-900">Vandaag bij AquaSwim</p>
            </div>
            <Bell className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat v="28" l="Lessen vandaag" small />
            <Stat v="156" l="Leerlingen" small />
            <Stat v="92%" l="Bezettingsgraad" small />
          </div>
          <div className="mt-4 h-20 rounded-xl border border-slate-200 bg-gradient-to-r from-blue-50 via-white to-sky-50" />
        </div>
      </div>
    </div>
  );
}

function PhoneMock({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-[2.2rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl ${className}`}>
      <div className="overflow-hidden rounded-[1.5rem] bg-gradient-to-b from-sky-50 to-white p-4">
        <p className="text-sm font-bold text-slate-900">Hoi Emma</p>
        <div className="mt-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Jouw volgende les</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">Zwemvaardigheid 2</p>
          <p className="text-[10px] text-slate-500">Za 11 mei · 09:00</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full w-3/4 rounded-full bg-[#1D4ED8]" />
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-[#B6FF2E]/30 p-3 ring-1 ring-[#B6FF2E]/40">
          <p className="text-[10px] font-semibold uppercase text-emerald-800">Badge behaald</p>
          <p className="text-sm font-bold text-slate-900">Ruglig Expert</p>
        </div>
      </div>
    </div>
  );
}

function BadgeMock({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-xl ${className}`}>
      <p className="text-[10px] font-semibold uppercase text-slate-500">Diploma kluis</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-white">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900">Diploma A</p>
          <p className="text-[11px] text-slate-500">Emma de Vries · 11 mei</p>
        </div>
      </div>
    </div>
  );
}

function TrainerMock({ className = "" }: { className?: string }) {
  return (
    <div className={`w-[230px] rounded-[2rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl ${className}`}>
      <div className="overflow-hidden rounded-[1.4rem] bg-white">
        <div className="bg-slate-900 px-4 pb-4 pt-6 text-white">
          <p className="text-[10px] uppercase text-white/60">Vandaag</p>
          <p className="text-base font-bold">Groep Zeesterren</p>
          <p className="text-[11px] text-white/60">10:00 · Bad 2 · 8 leerlingen</p>
        </div>
        <div className="p-4">
          {["Emma de Vries", "Sem Jansen", "Noah Bakker"].map((n) => (
            <div key={n} className="mt-2 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
              <span className="text-xs font-medium text-slate-800">{n}</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TenantSiteMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      <div className="border-b bg-slate-50 px-4 py-2 text-[10px] text-slate-400">aquaswim.nl</div>
      <div className="bg-gradient-to-br from-sky-100 via-white to-white p-6">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#1D4ED8]">AquaSwim Academy Den Haag</p>
        <h3 className="mt-2 text-xl font-bold text-slate-900">Zwemles met vertrouwen</h3>
        <p className="mt-1 text-xs text-slate-600">Programma's · Wachtlijst · Intake · Nieuws</p>
        <div className="mt-4 flex gap-2">
          <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Plan intake</span>
          <span className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">Wachttijd: 2-4 wk</span>
        </div>
      </div>
    </div>
  );
}

function PlainCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}

function Stat({ v, l, small }: { v: string; l: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      {small ? <p className="inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#1D4ED8]">Live</p> : null}
      <p className={cn("font-bold text-slate-900", small ? "mt-2 text-2xl" : "text-2xl")}>{v}</p>
      <p className="text-xs font-medium text-slate-500">{l}</p>
    </div>
  );
}
