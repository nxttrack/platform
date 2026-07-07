import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/lovable/page-kit";

type PageProps = {
  params: Promise<{ slug: string }>;
};

const pages = {
  ouderportaal: {
    kicker: "Ouderportaal",
    title: "Self-service voor ouders en kinderen",
    sub: "Ouders zien lessen, voortgang, diploma's, betalingen en berichten op een rustige plek."
  },
  "trainer-app": {
    kicker: "Trainer app",
    title: "Tabletworkflow voor instructeurs",
    sub: "Instructeurs zien hun agenda, groepsrosters, attendance en voortgang direct aan de badrand."
  },
  backoffice: {
    kicker: "Backoffice",
    title: "Dagelijkse operatie voor zwemscholen",
    sub: "Tenant admins beheren programma's, groepen, planning, intake, documenten, taken en rapportages."
  },
  prijzen: {
    kicker: "Prijzen",
    title: "Heldere pakketten voor moderne zwemscholen",
    sub: "Prijsinformatie volgt zodra de staging-MVP door product-owner review is."
  },
  demo: {
    kicker: "Demo",
    title: "Plan een NXTTRACK demo",
    sub: "Laat zien hoe intake, wachtlijst, lessen, voortgang, diploma's en administratie samenkomen."
  },
  contact: {
    kicker: "Contact",
    title: "Neem contact op met NXTTRACK",
    sub: "Voor demo's, productvragen en pilots met zwemscholen."
  },
  privacy: {
    kicker: "Privacy & AVG",
    title: "Privacy-first gebouwd",
    sub: "NXTTRACK werkt met tenant-isolatie, rollen, audit trail en minimale datatoegang als uitgangspunt."
  },
  "wachtrij-planning": {
    kicker: "Wachtrij & planning",
    title: "Van aanmelding naar juiste plek",
    sub: "Intake, plaatsingssuggesties, slot offers en acceptatieflows helpen capaciteit beter benutten."
  },
  "badges-diplomas": {
    kicker: "Badges & diploma's",
    title: "Voortgang die positief voelt",
    sub: "Badges, voortgangsscores en diploma vault maken de zwemreis zichtbaar voor ouders en kinderen."
  },
  login: {
    kicker: "Inloggen",
    title: "Kies de juiste NXTTRACK omgeving",
    sub: "Gebruik tenant-login voor ouders, instructeurs en tenant admins, of de platformomgeving voor NXTTRACK beheer."
  }
} as const;

type KnownSlug = keyof typeof pages;

export function generateStaticParams() {
  return Object.keys(pages).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: `${page.title} | NXTTRACK`,
    description: page.sub
  };
}

export default async function NxttrackMarketingSubpage({ params }: PageProps) {
  const { slug } = await params;
  const page = getPage(slug);

  if (!page) {
    notFound();
  }

  return <PageHero kicker={page.kicker} title={page.title} sub={page.sub} primary={{ href: "/nxttrack", label: "Terug naar NXTTRACK" }} secondary={{ href: "/nxttrack/zwemscholen", label: "Voor zwemscholen" }} />;
}

function getPage(slug: string) {
  return Object.hasOwn(pages, slug) ? pages[slug as KnownSlug] : null;
}
