import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { commercialSubpageSlugs, MarketingCommercialSubpage, type CommercialSubpageSlug } from "@/components/marketing/commercial-subpages";
import { MarketingProductSubpage, productSubpageSlugs, type ProductSubpageSlug } from "@/components/marketing/product-subpages";

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
    sub: "Beheerders beheren programma's, groepen, planning, intake, documenten, taken en rapportages."
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
    sub: "NXTTRACK werkt met organisatie-isolatie, rollen, audit trail en minimale datatoegang als uitgangspunt."
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
    sub: "Gebruik de organisatie-login voor ouders, instructeurs en beheerders, of de platformomgeving voor NXTTRACK beheer."
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

  if (isProductSubpage(slug)) {
    return <MarketingProductSubpage slug={slug} />;
  }

  if (isCommercialSubpage(slug)) {
    return <MarketingCommercialSubpage slug={slug} />;
  }

  notFound();
}

function getPage(slug: string) {
  return Object.hasOwn(pages, slug) ? pages[slug as KnownSlug] : null;
}

function isProductSubpage(slug: string): slug is ProductSubpageSlug {
  return (productSubpageSlugs as readonly string[]).includes(slug);
}

function isCommercialSubpage(slug: string): slug is CommercialSubpageSlug {
  return (commercialSubpageSlugs as readonly string[]).includes(slug);
}
