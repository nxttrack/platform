import { ArrowRight, Award, CalendarCheck, CheckCircle2, Clock, GraduationCap, MapPin, Menu, MessageSquare, Newspaper, ShieldCheck, Sparkles, UserCheck, Users, Waves } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { IntakeConditionalField } from "@/components/public-site/intake-conditional-field";
import { IntakeWizard, type IntakeWizardCopy } from "@/components/public-site/intake-wizard";
import { defaultLanguage, normalizeSupportedLanguage, publicHref, type PublicRouteKey, type PublicRouteParams, type SupportedLanguage } from "@/lib/i18n";
import { submitIntakeAction } from "@/lib/public-site/intake-actions";
import type { IntakeQuestion, IntakeQuestionOption, PublicProgram, PublicTenantProfile, PublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

type PublicPageProps = {
  snapshot: PublicTenantSiteSnapshot;
  language?: SupportedLanguage;
};

type IntakePageProps = PublicPageProps & {
  submitted?: boolean;
};

const intakeOptionLabels: Record<string, string> = {
  trial: "Proefles",
  registration: "Inschrijven",
  waitlist: "Wachtlijst"
};

type TenantPublicCopy = {
  intakeOptionLabels: Record<string, string>;
  preferredDays: typeof preferredDays;
  preferredTimes: typeof preferredTimes;
  trustItems: typeof trustItems;
  journeySteps: typeof journeySteps;
  valueProps: typeof valueProps;
  fallbackMarketingPrograms: MarketingProgram[];
  fallbackNewsItems: typeof fallbackNewsItems;
  fallbackAgendaItems: typeof fallbackAgendaItems;
  fallbackProfile: Omit<PublicTenantProfile, "newsItems" | "agendaItems">;
  labels: {
    home: string;
    news: string;
    agenda: string;
    programs: string;
    intake: string;
    trial: string;
    register: string;
    login: string;
    navigation: string;
    mobileNavigation: string;
    viewWaitTimes: string;
    diplomasIssued: string;
    parentSatisfaction: string;
    certifiedInstructors: string;
    queueAndSpots: string;
    currentWaitTimes: string;
    viewAllWaitTimes: string;
    waitTime: string;
    week: string;
    weeks: string;
    diplomasAndBadges: string;
    diplomaVaultTitle: string;
    diplomaVaultBody: string;
    startJourney: string;
    newsUpdates: string;
    today: string;
    readMore: string;
    ourPrograms: string;
    programsIntroTitle: string;
    viewAll: string;
    childJourneyKicker: string;
    childJourneyTitle: string;
    platformBy: string;
    programsTitle: string;
    programsSub: string;
    programNotFound: string;
    programNotFoundSub: string;
    viewProgramOverview: string;
    toPrograms: string;
    program: string;
    programFallback: string;
    intakeOptions: string;
    levels: string;
    noStages: string;
    intakeSub: string;
    chosenProgram: string;
    intakeIntroFallback: string;
    age: string;
    duration: string;
    price: string;
    capacity: string;
    intakeOption: string;
    guardian: string;
    guardianName: string;
    email: string;
    phone: string;
    child: string;
    childName: string;
    birthdate: string;
    preferredDays: string;
    preferredTimes: string;
    extraQuestions: string;
    notes: string;
    missingInformation: string;
    nextStep: string;
    previousStep: string;
    recommendedLessonTimes: string;
    recommendedLessonTimesSub: string;
    recommendedStage: string;
    requiredStepError: string;
    reviewAndSubmit: string;
    smartScore: string;
    chooseLessonPreferences: string;
    lessonPreferenceHelp: string;
    lessonPreferenceLimit: string;
    waitTimeNone: string;
    waitTimeShort: string;
    waitTimeLong: string;
    availableSpots: string;
    whyThisTime: string;
    noLessonTimes: string;
    wizardStepAdvice: string;
    wizardStepContact: string;
    wizardStepPreferences: string;
    wizardStepProgram: string;
    wizardStepQuestions: string;
    submitIntake: string;
    intakeReceived: string;
    noIntake: string;
    noIntakeSub: string;
    noPrograms: string;
    publishedProgram: string;
    publishedSwimProgram: string;
    details: string;
    active: string;
    inactive: string;
    select: string;
    yes: string;
    no: string;
    experienceNone: string;
    experienceWaterFamiliar: string;
    experienceSome: string;
    experienceLonger: string;
    tenantUnavailable: string;
    tenantUnavailableSubConfigured: string;
    tenantUnavailableSubNoTenant: string;
    tenantUnavailableSubQuery: string;
    programOverview: string;
    portals: string;
    parentPortal: string;
    instructorApp: string;
    backoffice: string;
    contact: string;
    copyright: string;
  };
};

const preferredDays = [
  { label: "Maandag", value: "monday" },
  { label: "Dinsdag", value: "tuesday" },
  { label: "Woensdag", value: "wednesday" },
  { label: "Donderdag", value: "thursday" },
  { label: "Vrijdag", value: "friday" },
  { label: "Zaterdag", value: "saturday" },
  { label: "Zondag", value: "sunday" }
];

const preferredTimes = [
  { label: "Ochtend", value: "morning" },
  { label: "Middag", value: "afternoon" },
  { label: "Avond", value: "evening" },
  { label: "Weekend", value: "weekend" }
];

const trustItems = [
  {
    icon: ShieldCheck,
    title: "Veilige omgeving",
    desc: "AVG-proof & veilig volgens de laatste richtlijnen.",
    tone: "text-sky-600 bg-sky-50"
  },
  {
    icon: Award,
    title: "Gecertificeerde instructeurs",
    desc: "Bevoegd, ervaren en volgen jaarlijks bijscholing.",
    tone: "text-blue-700 bg-blue-50"
  },
  {
    icon: UserCheck,
    title: "Ouderinzage",
    desc: "Realtime updates en inzicht in voortgang en prestaties.",
    tone: "text-amber-600 bg-amber-50"
  },
  {
    icon: GraduationCap,
    title: "Diploma kluis",
    desc: "Digitale diploma's en badges veilig bewaard in de kluis.",
    tone: "text-emerald-600 bg-emerald-50"
  }
];

const journeySteps = [
  { title: "Watergewenning", sub: "Wennen & plezier" },
  { title: "Diploma A", sub: "Basisvaardigheden" },
  { title: "Diploma B", sub: "Zelfstandigheid" },
  { title: "Diploma C", sub: "Gevorderd & veilig" }
];

const valueProps = [
  { icon: Waves, title: "Kleine groepen", desc: "Maximale aandacht voor elk kind." },
  { icon: UserCheck, title: "Persoonlijke begeleiding", desc: "Op het tempo en niveau van jouw kind." },
  { icon: ShieldCheck, title: "Moderne baden", desc: "Schone, veilige en kindvriendelijke locaties." },
  { icon: MessageSquare, title: "Heldere communicatie", desc: "We houden ouders altijd op de hoogte." }
];

type MarketingProgram = {
  id: string;
  name: string;
  ageLabel: string;
  description: string;
  slug: string;
  waitlist: "kort" | "gemiddeld" | "lang";
  weeks: number;
};

const waitlistPattern: Array<Pick<MarketingProgram, "waitlist" | "weeks">> = [
  { waitlist: "kort", weeks: 2 },
  { waitlist: "gemiddeld", weeks: 6 },
  { waitlist: "lang", weeks: 10 },
  { waitlist: "kort", weeks: 1 }
];

const fallbackMarketingPrograms: MarketingProgram[] = [
  {
    id: "zwemdiploma-a",
    name: "Zwemdiploma A",
    ageLabel: "5-9 jaar",
    description: "De eerste officiele stap. Drijven, draaien en zwemmen met kleding aan.",
    slug: "zwemdiploma-a",
    waitlist: "kort",
    weeks: 2
  },
  {
    id: "zwemdiploma-b",
    name: "Zwemdiploma B",
    ageLabel: "6-11 jaar",
    description: "Voortbouwen op A met verdieping, langer onderwater en hogere sprongen.",
    slug: "zwemdiploma-b",
    waitlist: "gemiddeld",
    weeks: 6
  },
  {
    id: "zwemdiploma-c",
    name: "Zwemdiploma C",
    ageLabel: "7-12 jaar",
    description: "Het complete diploma. Zwemmen in alle omstandigheden, veilig en zelfstandig.",
    slug: "zwemdiploma-c",
    waitlist: "lang",
    weeks: 10
  },
  {
    id: "proefles-zwemmen",
    name: "Proefles zwemmen",
    ageLabel: "Alle leeftijden",
    description: "Probeer eerst een les voordat je inschrijft. Lekker laagdrempelig kennismaken.",
    slug: "proefles-zwemmen",
    waitlist: "kort",
    weeks: 1
  }
];

const fallbackNewsItems = [
  {
    title: "Zomervakantie intensieve lessen en versnelde trajecten",
    body: "In de zomervakantie bieden wij extra intensieve lessen aan. Ideaal om een voorsprong te maken voor het nieuwe seizoen.",
    date: "15 mei 2026"
  },
  {
    title: "Nieuwe instroommomenten voor Zwemdiploma A",
    body: "Gebruik dit blok tijdelijk om ouders duidelijkheid te geven over aanbod, wachtlijst en intake.",
    date: "1 juni 2026"
  },
  {
    title: "Ouderportaal blijft de centrale plek",
    body: "Voortgang, badges, berichten en diploma's blijven zichtbaar vanuit de persoonlijke omgeving.",
    date: "24 juni 2026"
  }
];

const fallbackAgendaItems = [
  { title: "Diploma A instroom", time: "Maandag 16:00", location: "Bad 1 - baan 1" },
  { title: "Proeflesmoment", time: "Zaterdag 11:00", location: "Instructiebad" },
  { title: "Afzwemmen Diploma A", time: "Zaterdag 10:00", location: "Wedstrijdbad" }
];

const publicCopies: Record<SupportedLanguage, TenantPublicCopy> = {
  nl: {
    intakeOptionLabels,
    preferredDays,
    preferredTimes,
    trustItems,
    journeySteps,
    valueProps,
    fallbackMarketingPrograms,
    fallbackNewsItems,
    fallbackAgendaItems,
    fallbackProfile: {
      heroTitle: "{{tenantName}} zwemschool",
      heroSubtitle: "Bekijk programma's en start het inschrijfformulier voor proefles of inschrijving.",
      primaryCtaLabel: "Bekijk programma's",
      secondaryCtaLabel: "Inschrijfformulier",
      introTitle: "Van inschrijfformulier naar de juiste groep",
      introBody: "Programma's, niveaus en aanvraagopties worden uit de tenantdata gelezen.",
      logoUrl: "/lovable/zwemdemo-logo.png",
      heroImageUrl: "/lovable/hero-swim.png",
      heroImageAlt: "Kind in zwembad",
      brandPrimaryHex: "#1d4ed8",
      brandAccentHex: "#b6ff2e",
      locationLabel: "Den Haag",
      footerTagline: "Samen elke druppel vooruit.",
      contactEmail: null,
      contactPhone: null,
      addressLines: [],
      seoTitle: null,
      seoDescription: null,
      socialImageUrl: null
    },
    labels: {
      home: "Home",
      news: "Nieuws",
      agenda: "Agenda",
      programs: "Programma's",
      intake: "Inschrijfformulier",
      trial: "Proefles",
      register: "Inschrijven",
      login: "Inloggen",
      navigation: "Tenant website navigatie",
      mobileNavigation: "Tenant website mobiele navigatie",
      viewWaitTimes: "Bekijk wachttijden",
      diplomasIssued: "Diploma's uitgereikt",
      parentSatisfaction: "Ouder-tevredenheid",
      certifiedInstructors: "Gecertificeerde instructeurs",
      queueAndSpots: "Wachtrij & beschikbare plekken",
      currentWaitTimes: "Actuele wachttijden per programma",
      viewAllWaitTimes: "Bekijk alle wachttijden",
      waitTime: "Wachttijd",
      week: "week",
      weeks: "weken",
      diplomasAndBadges: "Diploma's & badges",
      diplomaVaultTitle: "Altijd je diploma's bij de hand",
      diplomaVaultBody: "Geen papier meer kwijt. Elke behaalde mijlpaal wordt veilig en overzichtelijk bewaard in je persoonlijke kluis.",
      startJourney: "Start je zwemreis",
      newsUpdates: "Nieuws & updates",
      today: "Vandaag",
      readMore: "Lees meer",
      ourPrograms: "Onze lesprogramma's",
      programsIntroTitle: "Van eerste plons tot diploma C",
      viewAll: "Bekijk alle",
      childJourneyKicker: "De zwemreis van jouw kind",
      childJourneyTitle: "Van eerste druppel tot diploma C",
      platformBy: "Platform by",
      programsTitle: "Programma's",
      programsSub: "Kies het programma dat past bij de zwemroute. Het inschrijfformulier bepaalt daarna instroomtype, voorkeuren en eerste status.",
      programNotFound: "Programma niet gevonden",
      programNotFoundSub: "Dit programma is niet gepubliceerd of bestaat niet voor deze tenant.",
      viewProgramOverview: "Bekijk het actuele programma-overzicht.",
      toPrograms: "Naar programma's",
      program: "Programma",
      programFallback: "Programmadetails vanuit de tenantdata.",
      intakeOptions: "Aanvraagopties",
      levels: "Niveaus",
      noStages: "Nog geen gepubliceerde stages gekoppeld.",
      intakeSub: "Start met een programma, kies proefles of inschrijving en geef je favoriete lestijden door.",
      chosenProgram: "Gekozen programma",
      intakeIntroFallback: "Vul het inschrijfformulier in zodat de zwemschool de juiste vervolgstap kan bepalen.",
      age: "Leeftijd",
      duration: "Duur",
      price: "Prijs",
      capacity: "Capaciteit",
      intakeOption: "Type aanvraag",
      guardian: "Ouder/verzorger",
      guardianName: "Naam ouder/verzorger",
      email: "E-mail",
      phone: "Telefoon",
      child: "Kind",
      childName: "Naam kind",
      birthdate: "Geboortedatum",
      preferredDays: "Voorkeursdagen",
      preferredTimes: "Voorkeurstijden",
      extraQuestions: "Aanvullende vragen",
      notes: "Opmerkingen",
      missingInformation: "Ontbrekende informatie",
      nextStep: "Volgende",
      previousStep: "Vorige",
      recommendedLessonTimes: "Voorgestelde lestijden",
      recommendedLessonTimesSub: "Maximaal vijf passende opties op basis van niveau, voorkeuren en beschikbare capaciteit.",
      recommendedStage: "Slimme niveau-inschatting",
      requiredStepError: "Vul de verplichte velden in voordat je doorgaat.",
      reviewAndSubmit: "Controleer en verstuur",
      smartScore: "Slimme score",
      chooseLessonPreferences: "Gekozen voorkeur",
      lessonPreferenceHelp: "Kies maximaal twee lestijden als voorkeur. De zwemschool bevestigt daarna de definitieve plek.",
      lessonPreferenceLimit: "Je kunt maximaal twee lestijden als voorkeur kiezen.",
      waitTimeNone: "Geen wachttijd",
      waitTimeShort: "Korte wachttijd",
      waitTimeLong: "Lange wachttijd",
      availableSpots: "Vrije plekken",
      whyThisTime: "Waarom",
      noLessonTimes: "Nog geen passende lestijden gevonden. De zwemschool beoordeelt de aanvraag handmatig.",
      wizardStepAdvice: "Advies & lestijden",
      wizardStepContact: "Ouder & kind",
      wizardStepPreferences: "Voorkeuren",
      wizardStepProgram: "Programma",
      wizardStepQuestions: "Vragen",
      submitIntake: "Inschrijfformulier versturen",
      intakeReceived: "Inschrijfformulier ontvangen. De status staat op nieuw en is klaar voor beoordeling.",
      noIntake: "Geen inschrijfformulier beschikbaar",
      noIntakeSub: "Kies een gepubliceerd programma met een actieve formulierconfiguratie.",
      noPrograms: "Er zijn nog geen gepubliceerde programma's.",
      publishedProgram: "Gepubliceerd programma.",
      publishedSwimProgram: "Gepubliceerd zwemprogramma vanuit tenantdata.",
      details: "Details",
      active: "Actief",
      inactive: "Uit",
      select: "Selecteer",
      yes: "Ja",
      no: "Nee",
      experienceNone: "Geen ervaring",
      experienceWaterFamiliar: "Watervrij oefenen",
      experienceSome: "Enkele lessen gehad",
      experienceLonger: "Langere periode zwemles",
      tenantUnavailable: "Tenantwebsite nog niet beschikbaar",
      tenantUnavailableSubConfigured: "Supabase is nog niet geconfigureerd voor deze runtime.",
      tenantUnavailableSubNoTenant: "Er is geen actieve tenant gevonden voor deze host of fallback slug.",
      tenantUnavailableSubQuery: "De tenantdata kon niet worden gelezen.",
      programOverview: "Programma-overzicht",
      portals: "Portalen",
      parentPortal: "Ouderportaal",
      instructorApp: "Instructeur app",
      backoffice: "Backoffice",
      contact: "Contact",
      copyright: "(c) 2026 NXTTRACK. Swim-first SaaS platform."
    }
  },
  en: {
    intakeOptionLabels: {
      trial: "Trial lesson",
      registration: "Registration",
      waitlist: "Waitlist"
    },
    preferredDays: [
      { label: "Monday", value: "monday" },
      { label: "Tuesday", value: "tuesday" },
      { label: "Wednesday", value: "wednesday" },
      { label: "Thursday", value: "thursday" },
      { label: "Friday", value: "friday" },
      { label: "Saturday", value: "saturday" },
      { label: "Sunday", value: "sunday" }
    ],
    preferredTimes: [
      { label: "Morning", value: "morning" },
      { label: "Afternoon", value: "afternoon" },
      { label: "Evening", value: "evening" },
      { label: "Weekend", value: "weekend" }
    ],
    trustItems: [
      {
        icon: ShieldCheck,
        title: "Safe environment",
        desc: "Privacy-aware and safe according to the latest operating guidelines.",
        tone: "text-sky-600 bg-sky-50"
      },
      {
        icon: Award,
        title: "Certified instructors",
        desc: "Qualified, experienced and trained every year.",
        tone: "text-blue-700 bg-blue-50"
      },
      {
        icon: UserCheck,
        title: "Parent insight",
        desc: "Realtime updates and clear progress visibility.",
        tone: "text-amber-600 bg-amber-50"
      },
      {
        icon: GraduationCap,
        title: "Diploma vault",
        desc: "Digital diplomas and badges are safely stored in one place.",
        tone: "text-emerald-600 bg-emerald-50"
      }
    ],
    journeySteps: [
      { title: "Water confidence", sub: "Comfort & fun" },
      { title: "Diploma A", sub: "Core skills" },
      { title: "Diploma B", sub: "Independence" },
      { title: "Diploma C", sub: "Advanced safety" }
    ],
    valueProps: [
      { icon: Waves, title: "Small groups", desc: "Maximum attention for every child." },
      { icon: UserCheck, title: "Personal guidance", desc: "At your child's pace and level." },
      { icon: ShieldCheck, title: "Modern pools", desc: "Clean, safe and child-friendly locations." },
      { icon: MessageSquare, title: "Clear communication", desc: "Parents stay informed at every step." }
    ],
    fallbackMarketingPrograms: [
      {
        id: "zwemdiploma-a",
        name: "Swimming Diploma A",
        ageLabel: "5-9 years",
        description: "The first official step: floating, turning and swimming with clothes on.",
        slug: "zwemdiploma-a",
        waitlist: "kort",
        weeks: 2
      },
      {
        id: "zwemdiploma-b",
        name: "Swimming Diploma B",
        ageLabel: "6-11 years",
        description: "Building on Diploma A with deeper skills, longer underwater work and higher jumps.",
        slug: "zwemdiploma-b",
        waitlist: "gemiddeld",
        weeks: 6
      },
      {
        id: "zwemdiploma-c",
        name: "Swimming Diploma C",
        ageLabel: "7-12 years",
        description: "The complete diploma: swimming safely and independently in different situations.",
        slug: "zwemdiploma-c",
        waitlist: "lang",
        weeks: 10
      },
      {
        id: "proefles-zwemmen",
        name: "Trial swim lesson",
        ageLabel: "All ages",
        description: "Try a lesson before registering. A low-threshold way to get started.",
        slug: "proefles-zwemmen",
        waitlist: "kort",
        weeks: 1
      }
    ],
    fallbackNewsItems: [
      {
        title: "Summer holiday intensive lessons and accelerated tracks",
        body: "During the summer holiday we offer extra intensive lessons. Ideal for building momentum before the new season.",
        date: "15 May 2026"
      },
      {
        title: "New entry moments for Swimming Diploma A",
        body: "Use this section to give parents clear information about availability, waitlist status and intake.",
        date: "1 June 2026"
      },
      {
        title: "The parent portal remains the central place",
        body: "Progress, badges, messages and diplomas remain visible from the personal environment.",
        date: "24 June 2026"
      }
    ],
    fallbackAgendaItems: [
      { title: "Diploma A intake group", time: "Monday 16:00", location: "Pool 1 - lane 1" },
      { title: "Trial lesson moment", time: "Saturday 11:00", location: "Instruction pool" },
      { title: "Diploma A certification event", time: "Saturday 10:00", location: "Main pool" }
    ],
    fallbackProfile: {
      heroTitle: "{{tenantName}} swim school",
      heroSubtitle: "View programs and start the registration form for a trial lesson or registration.",
      primaryCtaLabel: "View programs",
      secondaryCtaLabel: "Registration form",
      introTitle: "From registration form to the right group",
      introBody: "Programs, stages and request options are read from tenant data.",
      logoUrl: "/lovable/zwemdemo-logo.png",
      heroImageUrl: "/lovable/hero-swim.png",
      heroImageAlt: "Child in swimming pool",
      brandPrimaryHex: "#1d4ed8",
      brandAccentHex: "#b6ff2e",
      locationLabel: "The Hague",
      footerTagline: "Every stroke forward, together.",
      contactEmail: null,
      contactPhone: null,
      addressLines: [],
      seoTitle: null,
      seoDescription: null,
      socialImageUrl: null
    },
    labels: {
      home: "Home",
      news: "News",
      agenda: "Agenda",
      programs: "Programs",
      intake: "Registration form",
      trial: "Trial lesson",
      register: "Register",
      login: "Log in",
      navigation: "Tenant website navigation",
      mobileNavigation: "Tenant website mobile navigation",
      viewWaitTimes: "View wait times",
      diplomasIssued: "Diplomas issued",
      parentSatisfaction: "Parent satisfaction",
      certifiedInstructors: "Certified instructors",
      queueAndSpots: "Queue & available spots",
      currentWaitTimes: "Current wait times by program",
      viewAllWaitTimes: "View all wait times",
      waitTime: "Wait time",
      week: "week",
      weeks: "weeks",
      diplomasAndBadges: "Diplomas & badges",
      diplomaVaultTitle: "Always have diplomas at hand",
      diplomaVaultBody: "No more lost paper. Every milestone is safely stored in a clear personal vault.",
      startJourney: "Start the swim journey",
      newsUpdates: "News & updates",
      today: "Today",
      readMore: "Read more",
      ourPrograms: "Our lesson programs",
      programsIntroTitle: "From first splash to Diploma C",
      viewAll: "View all",
      childJourneyKicker: "Your child's swim journey",
      childJourneyTitle: "From first splash to Diploma C",
      platformBy: "Platform by",
      programsTitle: "Programs",
      programsSub: "Choose the program that fits the swim route. The registration form then determines entry type, preferences and first status.",
      programNotFound: "Program not found",
      programNotFoundSub: "This program is not published or does not exist for this tenant.",
      viewProgramOverview: "View the current program overview.",
      toPrograms: "To programs",
      program: "Program",
      programFallback: "Program details from tenant data.",
      intakeOptions: "Request options",
      levels: "Stages",
      noStages: "No published stages linked yet.",
      intakeSub: "Start with a program, choose a trial lesson or registration and share your preferred lesson times.",
      chosenProgram: "Selected program",
      intakeIntroFallback: "Fill in the registration form so the swim school can determine the right next step.",
      age: "Age",
      duration: "Duration",
      price: "Price",
      capacity: "Capacity",
      intakeOption: "Request type",
      guardian: "Parent/guardian",
      guardianName: "Parent/guardian name",
      email: "Email",
      phone: "Phone",
      child: "Child",
      childName: "Child name",
      birthdate: "Date of birth",
      preferredDays: "Preferred days",
      preferredTimes: "Preferred times",
      extraQuestions: "Additional questions",
      notes: "Notes",
      missingInformation: "Missing information",
      nextStep: "Next",
      previousStep: "Previous",
      recommendedLessonTimes: "Suggested lesson times",
      recommendedLessonTimesSub: "Up to five suitable options based on stage, preferences and available capacity.",
      recommendedStage: "Smart stage estimate",
      requiredStepError: "Complete the required fields before continuing.",
      reviewAndSubmit: "Review and submit",
      smartScore: "Smart score",
      chooseLessonPreferences: "Selected preference",
      lessonPreferenceHelp: "Choose up to two lesson times as preferred options. The swim school confirms the final spot afterwards.",
      lessonPreferenceLimit: "You can choose up to two preferred lesson times.",
      waitTimeNone: "No wait",
      waitTimeShort: "Short wait",
      waitTimeLong: "Long wait",
      availableSpots: "Open spots",
      whyThisTime: "Why",
      noLessonTimes: "No suitable lesson times found yet. The swim school will review the request manually.",
      wizardStepAdvice: "Advice & lesson times",
      wizardStepContact: "Guardian & child",
      wizardStepPreferences: "Preferences",
      wizardStepProgram: "Program",
      wizardStepQuestions: "Questions",
      submitIntake: "Submit registration form",
      intakeReceived: "Registration form received. The status is new and ready for review.",
      noIntake: "No registration form available",
      noIntakeSub: "Choose a published program with an active form configuration.",
      noPrograms: "There are no published programs yet.",
      publishedProgram: "Published program.",
      publishedSwimProgram: "Published swim program from tenant data.",
      details: "Details",
      active: "Active",
      inactive: "Off",
      select: "Select",
      yes: "Yes",
      no: "No",
      experienceNone: "No experience",
      experienceWaterFamiliar: "Water confidence practice",
      experienceSome: "A few lessons completed",
      experienceLonger: "Longer period of swim lessons",
      tenantUnavailable: "Tenant website not available yet",
      tenantUnavailableSubConfigured: "Supabase is not configured for this runtime yet.",
      tenantUnavailableSubNoTenant: "No active tenant was found for this host or fallback slug.",
      tenantUnavailableSubQuery: "Tenant data could not be read.",
      programOverview: "Program overview",
      portals: "Portals",
      parentPortal: "Parent portal",
      instructorApp: "Instructor app",
      backoffice: "Backoffice",
      contact: "Contact",
      copyright: "(c) 2026 NXTTRACK. Swim-first SaaS platform."
    }
  }
};

export function TenantMarketingPage({ snapshot, language }: PublicPageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage language={publicLanguage} snapshot={snapshot} />;
  }

  const profile = snapshot.profile ?? fallbackProfile(snapshot.tenant.name, publicLanguage);
  const marketingPrograms = toMarketingPrograms(snapshot.programs, publicLanguage);
  const tenantName = snapshot.tenant.name;
  const locationLabel = profile.locationLabel ?? "Den Haag";
  const heroImageUrl = profile.heroImageUrl ?? "/lovable/hero-swim.png";
  const heroImageAlt = profile.heroImageAlt ?? "Kind in zwembad";
  const newsItem = profile.newsItems[0] ?? copy.fallbackNewsItems[0];

  return (
    <PublicShell currentRoute="home" language={publicLanguage} snapshot={snapshot}>
      <main className="mx-auto max-w-screen-2xl px-4 md:px-8">
        <section className="relative mt-6 flex min-h-[280px] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-card md:mt-8 md:min-h-[320px] md:flex-row lg:min-h-[360px]">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden md:block md:w-[70%] lg:w-[72%]">
            <img alt={heroImageAlt} className="h-full w-full scale-110 object-cover object-right md:scale-[1.15] lg:scale-[1.25]" src={heroImageUrl} />
          </div>

          <div className="relative grid flex-1 items-center gap-6 p-5 md:grid-cols-12 md:gap-5 md:p-7 lg:p-8">
            <div className="md:col-span-7 lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" /> {tenantName} - {locationLabel}
              </div>

              <h1 className="mt-3 max-w-xl font-display text-3xl font-bold leading-[1.05] text-navy md:text-4xl lg:text-5xl">{profile.heroTitle}</h1>

              <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">{profile.heroSubtitle}</p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link className={tenantPrimaryButtonClassName} href={publicHref(publicLanguage, "intake")}>
                  {profile.primaryCtaLabel} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted" href={publicHref(publicLanguage, "programs")}>
                  {profile.secondaryCtaLabel}
                </Link>
                <Link className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted" href={publicHref(publicLanguage, "agenda")}>
                  {copy.labels.viewWaitTimes}
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap gap-6 text-xs text-muted-foreground">
                <div>
                  <p className="font-display text-xl font-bold text-navy">2.400+</p>
                  {copy.labels.diplomasIssued}
                </div>
                <div>
                  <p className="font-display text-xl font-bold text-navy">98%</p>
                  {copy.labels.parentSatisfaction}
                </div>
                <div>
                  <p className="font-display text-xl font-bold text-navy">12</p>
                  {copy.labels.certifiedInstructors}
                </div>
              </div>
            </div>
          </div>

          <div className="relative -mt-2 block px-5 pb-5 md:hidden">
            <img alt={heroImageAlt} className="w-full rounded-2xl" src={heroImageUrl} />
          </div>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {copy.trustItems.map((item) => (
            <div key={item.title} className="rounded-3xl border border-border bg-card p-5 shadow-soft">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.tone}`}>
                <item.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-sm font-bold text-navy">{item.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.queueAndSpots}</p>
                <h2 className="mt-1 font-display text-xl font-bold text-navy">{copy.labels.currentWaitTimes}</h2>
              </div>
              <Link className="hidden text-sm font-semibold text-primary md:block" href={publicHref(publicLanguage, "agenda")}>
                {copy.labels.viewAllWaitTimes} -&gt;
              </Link>
            </div>

            <div className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border">
              {marketingPrograms.slice(0, 4).map((program) => (
                <div key={program.id} className="flex items-center justify-between gap-3 bg-card px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                      <Waves className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy">{program.name}</p>
                      <p className="text-[11px] text-muted-foreground">{program.ageLabel}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${waitlistTone(program.waitlist)}`}>{copy.labels.waitTime}: {program.weeks} {program.weeks === 1 ? copy.labels.week : copy.labels.weeks}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col rounded-3xl border border-border bg-card p-6 shadow-soft">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.diplomasAndBadges}</p>
            <h2 className="mt-1 font-display text-xl font-bold text-navy">{copy.labels.diplomaVaultTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.labels.diplomaVaultBody}</p>
            <div className="mt-6 flex flex-1 items-center justify-center gap-4">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white shadow-glow">
                <span className="font-display text-2xl font-bold">B</span>
              </div>
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-700 text-white shadow-glow">
                <CheckCircle2 className="h-8 w-8" />
              </div>
            </div>
            <Link className={`${tenantPrimaryButtonClassName} mt-6 w-full justify-center`} href={publicHref(publicLanguage, "intake")}>
              {copy.labels.startJourney} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-5">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.newsUpdates}</p>
            <h2 className="mt-1 font-display text-lg font-bold text-navy">{newsItem.title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{newsItem.body}</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
              <CalendarCheck className="h-4 w-4" /> {newsItem.date || copy.labels.today} - Team {tenantName}
            </div>
            <Link className="mt-4 inline-flex text-sm font-semibold text-primary" href={publicHref(publicLanguage, "news")}>
              {copy.labels.readMore} -&gt;
            </Link>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:col-span-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.ourPrograms}</p>
                <h2 className="mt-1 font-display text-lg font-bold text-navy">{copy.labels.programsIntroTitle}</h2>
              </div>
              <Link className="hidden text-sm font-semibold text-primary md:block" href={publicHref(publicLanguage, "programs")}>
                {copy.labels.viewAll} -&gt;
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {marketingPrograms.slice(0, 4).map((program) => (
                <div key={program.id} className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                    <Waves className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-navy">
                      {program.name} <span className="ml-1 text-xs font-normal text-muted-foreground">({program.ageLabel})</span>
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">{program.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-border bg-card p-8 shadow-soft md:p-10">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.childJourneyKicker}</p>
          <h2 className="mt-1 text-center font-display text-2xl font-bold text-navy">{copy.labels.childJourneyTitle}</h2>

          <div className="relative mt-10">
            <div className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-sky-300 via-blue-500 to-emerald-500 md:block" />
            <div className="grid gap-6 md:grid-cols-4">
              {copy.journeySteps.map((step, index) => (
                <div key={step.title} className="relative flex flex-col items-center text-center">
                  <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-glow ring-4 ring-card">
                    <span className="font-display text-sm font-bold">{index + 1}</span>
                  </div>
                  <p className="mt-3 font-display text-sm font-bold text-navy">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-border bg-card p-6 shadow-soft md:p-8">
          <div className="grid gap-6 md:grid-cols-4">
            {copy.valueProps.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-navy">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4 mt-10 rounded-3xl gradient-navy p-8 text-white shadow-card md:p-10">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="max-w-xl">
              <h2 className="font-display text-xl font-bold md:text-2xl">{tenantName} {locationLabel}</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">{profile.footerTagline ?? copy.fallbackProfile.footerTagline}</p>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-white/5 px-6 py-4 ring-1 ring-white/10">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">{copy.labels.platformBy}</span>
              <img alt="NXTTRACK" className="h-7 w-auto brightness-0 invert" src="/lovable/nxttrack-logo.svg" />
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

export function TenantNewsPage({ snapshot, language }: PublicPageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage language={publicLanguage} snapshot={snapshot} />;
  }

  const tenantName = snapshot.tenant.name;
  const profile = snapshot.profile ?? fallbackProfile(tenantName, publicLanguage);
  const items = profile.newsItems.length > 0 ? profile.newsItems : copy.fallbackNewsItems;

  return (
    <PublicShell currentRoute="news" language={publicLanguage} snapshot={snapshot}>
      <main className="mx-auto max-w-screen-2xl px-4 md:px-8">
        <CompactHero
          kicker={`${tenantName} - ${copy.labels.news.toLowerCase()}`}
          primary={{ href: publicHref(publicLanguage, "intake"), label: profile.primaryCtaLabel }}
          sub={profile.seoDescription ?? (publicLanguage === "en" ? "Announcements, practical updates and swim-school news in the same calm Lovable style." : "Mededelingen, praktische updates en zwemschoolnieuws in dezelfde rustige Lovable-stijl.")}
          title={copy.labels.newsUpdates}
        />
        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {items.map((item) => (
            <article key={item.title} className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                <Newspaper className="h-5 w-5" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-wider text-primary">{item.date}</p>
              <h2 className="mt-2 font-display text-lg font-bold text-navy">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </section>
      </main>
    </PublicShell>
  );
}

export function TenantAgendaPage({ snapshot, language }: PublicPageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage language={publicLanguage} snapshot={snapshot} />;
  }

  const programs = toMarketingPrograms(snapshot.programs, publicLanguage);
  const profile = snapshot.profile ?? fallbackProfile(snapshot.tenant.name, publicLanguage);
  const moments = profile.agendaItems.length > 0 ? profile.agendaItems : copy.fallbackAgendaItems;

  return (
    <PublicShell currentRoute="agenda" language={publicLanguage} snapshot={snapshot}>
      <main className="mx-auto max-w-screen-2xl px-4 md:px-8">
        <CompactHero
          kicker={`${snapshot.tenant.name} - ${copy.labels.agenda.toLowerCase()}`}
          primary={{ href: publicHref(publicLanguage, "intake"), label: profile.primaryCtaLabel }}
          sub={profile.introBody ?? (publicLanguage === "en" ? "Entry moments, trial lessons and wait times by program." : "Instroommomenten, proeflessen en wachttijden per programma.")}
          title={publicLanguage === "en" ? "Agenda and wait times" : "Agenda en wachttijden"}
        />
        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <div className="mb-5 flex items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-navy">{publicLanguage === "en" ? "Upcoming moments" : "Komende momenten"}</h2>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">{moments.length}</span>
            </div>
            <div className="grid gap-3">
              {moments.map((moment) => (
                <div key={moment.title} className="rounded-2xl border border-border bg-muted/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{moment.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{moment.time}</p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {moment.location}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-xl font-bold text-navy">{copy.labels.viewWaitTimes}</h2>
            <div className="mt-5 grid gap-3">
              {programs.slice(0, 4).map((program) => (
                <div key={program.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/35 p-4">
                  <div>
                    <p className="text-sm font-semibold">{program.name}</p>
                    <p className="text-xs text-muted-foreground">{program.ageLabel}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${waitlistTone(program.waitlist)}`}>{program.weeks} {program.weeks === 1 ? copy.labels.week : copy.labels.weeks}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}

export function ProgramOverviewPage({ snapshot, language }: PublicPageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage language={publicLanguage} snapshot={snapshot} />;
  }

  return (
    <PublicShell currentRoute="programs" language={publicLanguage} snapshot={snapshot}>
      <main>
        <CompactHero kicker={snapshot.tenant.name} sub={copy.labels.programsSub} title={copy.labels.programsTitle} />
        <Section>
          <ProgramGrid language={publicLanguage} programs={snapshot.programs} />
        </Section>
      </main>
    </PublicShell>
  );
}

export function ProgramDetailPage({ snapshot, language }: PublicPageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage language={publicLanguage} snapshot={snapshot} />;
  }

  const program = snapshot.selectedProgram;

  if (!program) {
    return (
      <PublicShell currentRoute="programs" language={publicLanguage} snapshot={snapshot}>
        <main>
          <CompactHero kicker={snapshot.tenant.name} sub={copy.labels.programNotFoundSub} title={copy.labels.programNotFound} />
          <Section>
            <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
              <p className="text-sm text-muted-foreground">{copy.labels.viewProgramOverview}</p>
              <div className="mt-5">
                <PrimaryLink href={publicHref(publicLanguage, "programs")}>{copy.labels.toPrograms}</PrimaryLink>
              </div>
            </div>
          </Section>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell currentRoute="programDetail" currentRouteParams={{ slug: program.slug }} language={publicLanguage} snapshot={snapshot}>
      <main>
        <CompactHero kicker={snapshot.tenant.name} primary={{ href: publicHref(publicLanguage, "intake", { program: program.slug }), label: copy.labels.startJourney }} sub={program.detail ?? program.summary ?? program.description ?? copy.labels.programFallback} title={program.name} />
        <Section>
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-2xl font-bold">{copy.labels.program}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{program.detail ?? program.summary ?? program.description ?? copy.labels.programFallback}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <DetailPill label={copy.labels.age} value={program.ageLabel} />
                <DetailPill label={copy.labels.duration} value={program.durationLabel} />
                <DetailPill label={copy.labels.price} value={program.priceLabel} />
                <DetailPill label={copy.labels.capacity} value={program.capacityLabel} />
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
              <h2 className="text-2xl font-bold">{copy.labels.intakeOptions}</h2>
              <div className="mt-5 grid gap-3">
                <OptionStatus copy={copy} enabled={program.trialEnabled} label={copy.labels.trial} />
                <OptionStatus copy={copy} enabled={program.registrationEnabled} label={copy.labels.register} />
              </div>
              <div className="mt-6">
                <PrimaryLink href={publicHref(publicLanguage, "intake", { program: program.slug })}>{copy.labels.startJourney}</PrimaryLink>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-border bg-card p-6 shadow-soft">
            <h2 className="text-2xl font-bold">{copy.labels.levels}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {program.stages.length > 0 ? (
                program.stages.map((stage) => (
                  <div key={stage.id} className="rounded-2xl border border-border bg-muted/40 p-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{stage.code}</p>
                    <p className="mt-1 font-semibold">{stage.name}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{copy.labels.noStages}</p>
              )}
            </div>
          </div>
        </Section>
      </main>
    </PublicShell>
  );
}

export function IntakePage({ snapshot, submitted, language }: IntakePageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  if (snapshot.status !== "ready" || !snapshot.tenant) {
    return <PublicStatusPage language={publicLanguage} snapshot={snapshot} />;
  }

  const program = snapshot.selectedProgram ?? snapshot.programs[0] ?? null;

  return (
    <PublicShell currentRoute="intake" currentRouteParams={{ program: program?.slug ?? null }} language={publicLanguage} snapshot={snapshot}>
      <main>
        <CompactHero kicker={snapshot.tenant.name} sub={copy.labels.intakeSub} title={copy.labels.intake} />
        <Section>
          {submitted ? <SuccessNotice copy={copy} /> : null}
          {program && program.intakeConfig ? <IntakeWizard action={submitIntakeAction} copy={toIntakeWizardCopy(copy)} language={publicLanguage} program={program} /> : <IntakeUnavailable copy={copy} language={publicLanguage} programs={snapshot.programs} />}
        </Section>
      </main>
    </PublicShell>
  );
}

function toIntakeWizardCopy(copy: TenantPublicCopy): IntakeWizardCopy {
  return {
    intakeOptionLabels: copy.intakeOptionLabels,
    preferredDays: copy.preferredDays,
    preferredTimes: copy.preferredTimes,
    labels: {
      age: copy.labels.age,
      birthdate: copy.labels.birthdate,
      child: copy.labels.child,
      childName: copy.labels.childName,
      chosenProgram: copy.labels.chosenProgram,
      duration: copy.labels.duration,
      email: copy.labels.email,
      extraQuestions: copy.labels.extraQuestions,
      guardian: copy.labels.guardian,
      guardianName: copy.labels.guardianName,
      intakeIntroFallback: copy.labels.intakeIntroFallback,
      intakeOption: copy.labels.intakeOption,
      missingInformation: copy.labels.missingInformation,
      nextStep: copy.labels.nextStep,
      notes: copy.labels.notes,
      phone: copy.labels.phone,
      previousStep: copy.labels.previousStep,
      preferredDays: copy.labels.preferredDays,
      preferredTimes: copy.labels.preferredTimes,
      price: copy.labels.price,
      chooseLessonPreferences: copy.labels.chooseLessonPreferences,
      lessonPreferenceHelp: copy.labels.lessonPreferenceHelp,
      lessonPreferenceLimit: copy.labels.lessonPreferenceLimit,
      recommendedLessonTimes: copy.labels.recommendedLessonTimes,
      recommendedLessonTimesSub: copy.labels.recommendedLessonTimesSub,
      recommendedStage: copy.labels.recommendedStage,
      requiredStepError: copy.labels.requiredStepError,
      reviewAndSubmit: copy.labels.reviewAndSubmit,
      select: copy.labels.select,
      smartScore: copy.labels.smartScore,
      waitTimeNone: copy.labels.waitTimeNone,
      waitTimeShort: copy.labels.waitTimeShort,
      waitTimeLong: copy.labels.waitTimeLong,
      submitIntake: copy.labels.submitIntake,
      availableSpots: copy.labels.availableSpots,
      whyThisTime: copy.labels.whyThisTime,
      noLessonTimes: copy.labels.noLessonTimes,
      wizardStepAdvice: copy.labels.wizardStepAdvice,
      wizardStepContact: copy.labels.wizardStepContact,
      wizardStepPreferences: copy.labels.wizardStepPreferences,
      wizardStepProgram: copy.labels.wizardStepProgram,
      wizardStepQuestions: copy.labels.wizardStepQuestions,
      yes: copy.labels.yes,
      no: copy.labels.no,
      experienceNone: copy.labels.experienceNone,
      experienceWaterFamiliar: copy.labels.experienceWaterFamiliar,
      experienceSome: copy.labels.experienceSome,
      experienceLonger: copy.labels.experienceLonger
    }
  };
}

function PublicShell({
  snapshot,
  language,
  children,
  currentRoute = "home",
  currentRouteParams = {}
}: PublicPageProps & {
  children: ReactNode;
  currentRoute?: PublicRouteKey;
  currentRouteParams?: PublicRouteParams;
}) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);
  const tenantName = snapshot.tenant?.name ?? "Zwemschool Demo";
  const profile = snapshot.profile ?? fallbackProfile(tenantName, publicLanguage);
  const logoUrl = profile.logoUrl ?? "/lovable/zwemdemo-logo.png";
  const location = profile.locationLabel ?? copy.fallbackProfile.locationLabel ?? "Den Haag";
  const addressLines = profile.addressLines.length > 0 ? profile.addressLines : [location];
  const visiblePrograms = snapshot.programs.slice(0, 4);
  const style = {
    "--primary": profile.brandPrimaryHex,
    "--primary-foreground": readableForegroundFor(profile.brandPrimaryHex),
    "--ring": profile.brandPrimaryHex,
    "--accent": profile.brandAccentHex
  } as CSSProperties;
  const primaryButtonStyle = {
    backgroundColor: profile.brandPrimaryHex,
    color: readableForegroundFor(profile.brandPrimaryHex)
  } as CSSProperties;
  const nav = [
    { href: publicHref(publicLanguage, "home"), label: copy.labels.home },
    { href: publicHref(publicLanguage, "news"), label: copy.labels.news },
    { href: publicHref(publicLanguage, "agenda"), label: copy.labels.agenda },
    { href: publicHref(publicLanguage, "programs"), label: copy.labels.programs },
    { href: publicHref(publicLanguage, "intake"), label: copy.labels.trial },
    { href: publicHref(publicLanguage, "intake"), label: copy.labels.register }
  ];

  return (
    <div className="min-h-screen text-foreground" style={style}>
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 md:px-8">
          <Link className="flex items-center" href={publicHref(publicLanguage, "home")}>
            <img alt={tenantName} className="h-5 w-auto" src={logoUrl} />
          </Link>
          <nav aria-label={copy.labels.navigation} className="ml-8 hidden items-center gap-1 md:flex">
            {nav.map((item, index) => (
              <HeaderLink key={`${item.href}-${index}`} href={item.href}>
                {item.label}
              </HeaderLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center overflow-hidden rounded-xl border border-border bg-background p-1 text-xs font-bold md:flex">
              {(["nl", "en"] as const).map((item) => (
                <Link
                  aria-current={publicLanguage === item ? "page" : undefined}
                  className={`rounded-lg px-2.5 py-1.5 ${publicLanguage === item ? "bg-primary text-[var(--primary-foreground)]" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  href={publicHref(item, currentRoute, currentRouteParams)}
                  key={item}
                >
                  {item.toUpperCase()}
                </Link>
              ))}
            </div>
            <Link className="hidden rounded-xl border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted md:inline-flex" href="/login">
              {copy.labels.login}
            </Link>
            <Link className="hidden rounded-xl px-4 py-2 text-sm font-semibold shadow-glow hover:opacity-90 md:inline-flex" href={publicHref(publicLanguage, "intake")} style={primaryButtonStyle}>
              {copy.labels.register}
            </Link>
            <Link className="rounded-xl px-4 py-2 text-sm font-semibold shadow-glow hover:opacity-90 md:hidden" href={publicHref(publicLanguage, "intake")} style={primaryButtonStyle}>
              {copy.labels.intake}
            </Link>
            <details className="group relative md:hidden">
              <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-soft hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden">
                <Menu className="h-5 w-5" />
              </summary>
              <div className="absolute right-0 top-12 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-border bg-card shadow-card">
                <nav aria-label={copy.labels.mobileNavigation} className="grid gap-1 p-3">
                  <div className="mb-1 grid grid-cols-2 gap-2">
                    {(["nl", "en"] as const).map((item) => (
                      <Link
                        aria-current={publicLanguage === item ? "page" : undefined}
                        className={`rounded-2xl px-3 py-3 text-center text-xs font-bold ${publicLanguage === item ? "bg-primary text-[var(--primary-foreground)]" : "bg-muted text-muted-foreground"}`}
                        href={publicHref(item, currentRoute, currentRouteParams)}
                        key={item}
                      >
                        {item.toUpperCase()}
                      </Link>
                    ))}
                  </div>
                  {nav.map((item, index) => (
                    <Link key={`${item.href}-mobile-${index}`} className="rounded-2xl px-3 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" href={item.href}>
                      {item.label}
                    </Link>
                  ))}
                  <Link className="rounded-2xl px-3 py-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" href="/login">
                    {copy.labels.login}
                  </Link>
                </nav>
              </div>
            </details>
          </div>
        </div>
      </header>
      {children}
      <footer className="mt-20 border-t border-border bg-card">
        <div className="mx-auto max-w-screen-2xl px-4 py-10 md:px-8">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <img alt={tenantName} className="h-4 w-auto" src={logoUrl} />
              <p className="mt-3 text-xs text-muted-foreground">{profile.footerTagline ?? copy.fallbackProfile.footerTagline}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.labels.programs}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {visiblePrograms.length > 0 ? (
                  visiblePrograms.map((program) => (
                    <li key={program.id}>
                      <Link href={publicHref(publicLanguage, "programDetail", { slug: program.slug })}>{program.name}</Link>
                    </li>
                  ))
                ) : (
                  <li>
                    <Link href={publicHref(publicLanguage, "programs")}>{copy.labels.programOverview}</Link>
                  </li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.labels.portals}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                <li>
                  <Link href="/parent">{copy.labels.parentPortal}</Link>
                </li>
                <li>
                  <Link href="/instructor">{copy.labels.instructorApp}</Link>
                </li>
                <li>
                  <Link href="/admin">{copy.labels.backoffice}</Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.labels.contact}</p>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {tenantName}
                <br />
                {addressLines.map((line) => (
                  <span key={line}>
                    {line}
                    <br />
                  </span>
                ))}
                {profile.contactEmail ? <Link href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</Link> : null}
                {profile.contactEmail && profile.contactPhone ? <br /> : null}
                {profile.contactPhone ? <Link href={`tel:${profile.contactPhone.replace(/\s+/g, "")}`}>{profile.contactPhone}</Link> : null}
              </p>
            </div>
          </div>
          <p className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">{copy.labels.copyright}</p>
        </div>
      </footer>
    </div>
  );
}

function ProgramGrid({ programs, language }: { programs: PublicProgram[]; language: SupportedLanguage }) {
  const copy = getPublicCopy(language);

  if (programs.length === 0) {
    return <div className="rounded-3xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">{copy.labels.noPrograms}</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {programs.map((program) => (
        <article key={program.id} className="flex min-h-[22rem] flex-col rounded-3xl border border-border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Waves className="h-5 w-5" />
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">{program.code}</span>
          </div>
          <h2 className="mt-5 text-xl font-bold">{program.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{program.summary ?? program.description ?? copy.labels.publishedProgram}</p>
          <div className="mt-5 grid gap-2 text-xs text-muted-foreground">
            <MetaLine icon={<Users className="h-4 w-4" />} value={program.ageLabel} />
            <MetaLine icon={<Clock className="h-4 w-4" />} value={program.durationLabel} />
            <MetaLine icon={<ShieldCheck className="h-4 w-4" />} value={program.capacityLabel} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {program.trialEnabled ? <SmallPill>{copy.labels.trial}</SmallPill> : null}
            {program.registrationEnabled ? <SmallPill>{copy.labels.register}</SmallPill> : null}
          </div>
          <div className="mt-auto flex flex-wrap gap-2 pt-6">
            <Link className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-muted" href={publicHref(language, "programDetail", { slug: program.slug })}>
              {copy.labels.details}
            </Link>
            <Link className={`${tenantPrimaryButtonClassName} rounded-lg px-3.5 py-2 shadow-soft`} href={publicHref(language, "intake", { program: program.slug })}>
              {copy.labels.intake} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}

function toMarketingPrograms(programs: PublicProgram[], language: SupportedLanguage): MarketingProgram[] {
  const copy = getPublicCopy(language);

  if (programs.length === 0) {
    return copy.fallbackMarketingPrograms;
  }

  return programs.slice(0, 6).map((program, index) => {
    const availability = waitlistPattern[index % waitlistPattern.length];

    return {
      id: program.id,
      name: program.name,
      ageLabel: program.ageLabel ?? (language === "en" ? "All ages" : "Alle leeftijden"),
      description: program.summary ?? program.description ?? copy.labels.publishedSwimProgram,
      slug: program.slug,
      waitlist: availability.waitlist,
      weeks: availability.weeks
    };
  });
}

function waitlistTone(waitlist: MarketingProgram["waitlist"]) {
  if (waitlist === "kort") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (waitlist === "gemiddeld") {
    return "bg-amber-50 text-amber-700";
  }

  return "bg-rose-50 text-rose-700";
}

function IntakeForm({ copy, language, program }: { copy: TenantPublicCopy; language: SupportedLanguage; program: PublicProgram }) {
  const config = program.intakeConfig;
  const publicIntakeOptions = config?.allowedOptions.filter((option) => option !== "waitlist") ?? [];

  if (!config) {
    return null;
  }

  return (
    <form action={submitIntakeAction} className="mx-auto max-w-5xl rounded-3xl border border-border bg-card p-5 shadow-card md:p-7">
      <input name="program_slug" type="hidden" value={program.slug} />
      <input name="public_language" type="hidden" value={language} />
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <aside className="rounded-3xl bg-muted/55 p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{copy.labels.chosenProgram}</p>
          <h2 className="mt-2 text-2xl font-bold">{program.name}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{config.intro ?? program.summary ?? copy.labels.intakeIntroFallback}</p>
          <div className="mt-5 grid gap-2">
            <DetailPill label={copy.labels.age} value={program.ageLabel} />
            <DetailPill label={copy.labels.duration} value={program.durationLabel} />
            <DetailPill label={copy.labels.price} value={program.priceLabel} />
          </div>
          <div className="mt-6">
            <label className="grid gap-2 text-sm font-semibold">
              {copy.labels.intakeOption}
              <select className="h-11 rounded-xl border border-border bg-card px-3 text-sm outline-none ring-primary/20 focus:ring-4" name="intake_type" required>
                {(publicIntakeOptions.length > 0 ? publicIntakeOptions : ["registration"]).map((option) => (
                  <option key={option} value={option}>
                    {copy.intakeOptionLabels[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>

        <div className="grid gap-5">
          <FormGrid title={copy.labels.guardian}>
            <TextField label={copy.labels.guardianName} name="parent_name" required />
            <TextField label={copy.labels.email} name="parent_email" required type="email" />
            <TextField label={copy.labels.phone} name="parent_phone" type="tel" />
          </FormGrid>

          <FormGrid title={copy.labels.child}>
            <TextField label={copy.labels.childName} name="participant_name" required />
            <TextField label={copy.labels.birthdate} name="participant_birthdate" type="date" />
          </FormGrid>

          <fieldset className="rounded-2xl border border-border p-4">
            <legend className="px-1 text-sm font-bold">{copy.labels.preferredDays}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
              {copy.preferredDays.map((day) => (
                <CheckboxField key={day.value} label={day.label} name="preferred_days" value={day.value} />
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-border p-4">
            <legend className="px-1 text-sm font-bold">{copy.labels.preferredTimes}</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {copy.preferredTimes.map((time) => (
                <CheckboxField key={time.value} label={time.label} name="preferred_time_windows" value={time.value} />
              ))}
            </div>
          </fieldset>

          {config.questions.length > 0 ? (
            <FormGrid title={copy.labels.extraQuestions}>
              {config.questions.map((question) => (
                <IntakeConditionalField condition={question.condition} key={question.name}>
                  <QuestionField copy={copy} question={question} />
                </IntakeConditionalField>
              ))}
            </FormGrid>
          ) : null}

          <TextAreaField label={copy.labels.notes} name="notes" />

          <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-[var(--primary-foreground)] shadow-glow hover:bg-primary/90 md:w-fit" type="submit">
            {copy.labels.submitIntake} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}

function PublicStatusPage({ snapshot, language }: PublicPageProps) {
  const publicLanguage = resolvePublicLanguage(language);
  const copy = getPublicCopy(publicLanguage);

  return (
    <div className="min-h-screen bg-background px-4 py-10 md:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center">
        <div className="w-full rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
          <Kicker>NXTTRACK tenant website</Kicker>
          <h1 className="mt-4 text-3xl font-bold md:text-4xl">{copy.labels.tenantUnavailable}</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{statusCopy(snapshot, copy)}</p>
          {snapshot.errors.length > 0 ? (
            <div className="mt-5 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              {snapshot.errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <SecondaryLink href="/nxttrack">NXTTRACK</SecondaryLink>
            <SecondaryLink href="/login">Login</SecondaryLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactHero({ kicker, title, sub, primary }: { kicker: string; title: string; sub: string; primary?: { href: string; label: string } }) {
  return (
    <section className="border-b border-border bg-gradient-to-b from-sky-50 to-white">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-18">
        <Kicker>{kicker}</Kicker>
        <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight tracking-tight text-slate-950 md:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{sub}</p>
        {primary ? (
          <div className="mt-7">
            <PrimaryLink href={primary.href}>{primary.label}</PrimaryLink>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Section({ title, sub, tinted, children }: { title?: string; sub?: string; tinted?: boolean; children?: ReactNode }) {
  return (
    <section className={tinted ? "bg-slate-50/80" : ""}>
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-8 md:py-20">
        {title ? (
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
            {sub ? <p className="mt-3 text-base leading-7 text-muted-foreground">{sub}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}

function SuccessNotice({ copy }: { copy: TenantPublicCopy }) {
  return (
    <div className="mx-auto mb-6 max-w-5xl rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800">
      {copy.labels.intakeReceived}
    </div>
  );
}

function IntakeUnavailable({ copy, language, programs }: { copy: TenantPublicCopy; language: SupportedLanguage; programs: PublicProgram[] }) {
  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-border bg-card p-6 text-center shadow-soft">
      <h2 className="text-2xl font-bold">{copy.labels.noIntake}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{copy.labels.noIntakeSub}</p>
      {programs.length > 0 ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {programs.map((program) => (
            <Link key={program.id} className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted" href={publicHref(language, "intake", { program: program.slug })}>
              {program.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FormGrid({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border p-4">
      <legend className="px-1 text-sm font-bold">{title}</legend>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function TextField({ label, name, required, type = "text" }: { label: string; name: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <input className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} required={required} type={type} />
    </label>
  );
}

function TextAreaField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm font-semibold md:col-span-2">
      <span>{label}</span>
      <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} required={required} />
    </label>
  );
}

function QuestionField({ copy, question }: { copy: TenantPublicCopy; question: IntakeQuestion }) {
  const name = `answer_${question.name}`;

  if (question.type === "textarea" || question.type === "free_text") {
    return <TextAreaField label={question.label} name={name} required={question.required} />;
  }

  if (question.type === "single_select") {
    return <SelectQuestionField copy={copy} label={question.label} name={name} options={question.options ?? []} required={question.required} />;
  }

  if (question.type === "multi_select") {
    return <MultiOptionField label={question.label} name={name} options={question.options ?? []} required={question.required} />;
  }

  if (question.type === "yes_no") {
    return (
      <MultiOptionField
        label={question.label}
        name={name}
        options={[
          { label: copy.labels.yes, value: "yes" },
          { label: copy.labels.no, value: "no" }
        ]}
        radio
        required={question.required}
      />
    );
  }

  if (question.type === "consent") {
    return (
      <label className="flex min-h-12 items-start gap-3 rounded-xl border border-border bg-background px-3 py-3 text-sm font-semibold md:col-span-2">
        <input className="mt-0.5 h-4 w-4 accent-primary" name={name} required={question.required} type="checkbox" value="accepted" />
        <span>
          {question.label}
          {question.helpText ? <span className="mt-1 block text-xs font-normal text-muted-foreground">{question.helpText}</span> : null}
        </span>
      </label>
    );
  }

  if (question.type === "swim_experience_scale") {
    return (
      <MultiOptionField
        label={question.label}
        name={name}
        options={[
          { label: copy.labels.experienceNone, value: "none" },
          { label: copy.labels.experienceWaterFamiliar, value: "water_familiar" },
          { label: copy.labels.experienceSome, value: "some" },
          { label: copy.labels.experienceLonger, value: "longer" }
        ]}
        radio
        required={question.required}
      />
    );
  }

  return <TextField label={question.label} name={name} required={question.required} type={question.type === "number" ? "number" : question.type === "date" ? "date" : "text"} />;
}

function SelectQuestionField({ copy, label, name, options, required }: { copy: TenantPublicCopy; label: string; name: string; options: IntakeQuestionOption[]; required?: boolean }) {
  return (
    <label className="grid gap-1 text-sm font-semibold">
      <span>{label}</span>
      <select className="h-11 rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none ring-primary/20 focus:ring-4" name={name} required={required}>
        <option value="">{copy.labels.select}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiOptionField({ label, name, options, radio, required }: { label: string; name: string; options: IntakeQuestionOption[]; radio?: boolean; required?: boolean }) {
  return (
    <fieldset className="rounded-xl border border-border bg-background p-3 md:col-span-2">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map((option, index) => (
          <label className="flex min-h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold" key={option.value}>
            <input className="h-4 w-4 accent-primary" name={name} required={required && radio && index === 0} type={radio ? "radio" : "checkbox"} value={option.value} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CheckboxField({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm font-semibold">
      <input className="h-4 w-4 accent-primary" name={name} type="checkbox" value={value} />
      {label}
    </label>
  );
}

function DetailPill({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-2xl border border-border bg-background p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value ?? "-"}</p>
    </div>
  );
}

function OptionStatus({ copy, enabled, label }: { copy: TenantPublicCopy; enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-background p-3">
      <span className="text-sm font-semibold">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${enabled ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>{enabled ? copy.labels.active : copy.labels.inactive}</span>
    </div>
  );
}

function MetaLine({ icon, value }: { icon: ReactNode; value: string | null }) {
  return value ? (
    <div className="flex items-center gap-2">
      {icon}
      <span>{value}</span>
    </div>
  ) : null;
}

function SmallPill({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{children}</span>;
}

function HeaderLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground" href={href}>
      {children}
    </Link>
  );
}

function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-lg bg-[#0f172a] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#111c34]" href={href} style={{ color: "#ffffff" }}>
      {children} <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50" href={href}>
      {children}
    </Link>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white/85 px-3 py-1 text-xs font-bold text-slate-700 shadow-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

const tenantPrimaryButtonClassName = "inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] shadow-glow hover:opacity-95";

function statusCopy(snapshot: PublicTenantSiteSnapshot, copy: TenantPublicCopy) {
  if (snapshot.status === "not_configured") {
    return copy.labels.tenantUnavailableSubConfigured;
  }

  if (snapshot.status === "no_tenant") {
    return copy.labels.tenantUnavailableSubNoTenant;
  }

  return copy.labels.tenantUnavailableSubQuery;
}

function readableForegroundFor(hexColor: string) {
  const normalized = normalizeHexColor(hexColor);

  if (!normalized) {
    return "#ffffff";
  }

  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  const luminance = [red, green, blue]
    .map((channel) => {
      const value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    })
    .reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);

  return luminance > 0.55 ? "#0f172a" : "#ffffff";
}

function normalizeHexColor(value: string) {
  const trimmed = value.trim();

  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed
      .slice(1)
      .split("")
      .map((part) => `${part}${part}`)
      .join("")}`;
  }

  return null;
}

function resolvePublicLanguage(language: SupportedLanguage | null | undefined) {
  return normalizeSupportedLanguage(language, defaultLanguage);
}

function getPublicCopy(language: SupportedLanguage | null | undefined) {
  return publicCopies[resolvePublicLanguage(language)];
}

function withTenantName(value: string | null, tenantName: string) {
  return value?.replaceAll("{{tenantName}}", tenantName) ?? null;
}

function fallbackProfile(tenantName: string, language: SupportedLanguage = defaultLanguage): PublicTenantProfile {
  const copy = getPublicCopy(language);
  const profile = copy.fallbackProfile;

  return {
    heroTitle: withTenantName(profile.heroTitle, tenantName) ?? tenantName,
    heroSubtitle: profile.heroSubtitle,
    primaryCtaLabel: profile.primaryCtaLabel,
    secondaryCtaLabel: profile.secondaryCtaLabel,
    introTitle: profile.introTitle,
    introBody: profile.introBody,
    logoUrl: profile.logoUrl,
    heroImageUrl: profile.heroImageUrl,
    heroImageAlt: profile.heroImageAlt,
    brandPrimaryHex: profile.brandPrimaryHex,
    brandAccentHex: profile.brandAccentHex,
    locationLabel: profile.locationLabel,
    footerTagline: profile.footerTagline,
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    addressLines: profile.addressLines,
    seoTitle: profile.seoTitle,
    seoDescription: profile.seoDescription,
    socialImageUrl: profile.socialImageUrl,
    newsItems: copy.fallbackNewsItems,
    agendaItems: copy.fallbackAgendaItems
  };
}
