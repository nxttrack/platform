import { notFound } from "next/navigation";

import { ProgramOverviewPage } from "@/components/public-site/tenant-public-pages";
import { publicLanguageFromSegment } from "@/lib/i18n";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type LocalizedProgramsPageProps = {
  params: Promise<{ language: string }>;
};

export async function generateMetadata({ params }: LocalizedProgramsPageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    return {};
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, language === "en" ? "Programs" : "Programma's");
}

export default async function LocalizedProgramsPage({ params }: LocalizedProgramsPageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    notFound();
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return <ProgramOverviewPage language={language} snapshot={snapshot} />;
}
