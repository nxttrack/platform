import { notFound } from "next/navigation";

import { ProgramDetailPage } from "@/components/public-site/tenant-public-pages";
import { publicLanguageFromSegment } from "@/lib/i18n";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type LocalizedProgramDetailPageProps = {
  params: Promise<{ language: string; slug: string }>;
};

export async function generateMetadata({ params }: LocalizedProgramDetailPageProps) {
  const { language: languageSegment, slug } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    return {};
  }

  const snapshot = await getPublicTenantSiteSnapshot(slug);
  const title = snapshot.selectedProgram ? `${snapshot.selectedProgram.name} - ${snapshot.tenant?.name ?? "NXTTRACK"}` : language === "en" ? "Program" : "Programma";

  return buildTenantPublicMetadata(snapshot, title);
}

export default async function LocalizedProgramDetailPage({ params }: LocalizedProgramDetailPageProps) {
  const { language: languageSegment, slug } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    notFound();
  }

  const snapshot = await getPublicTenantSiteSnapshot(slug);

  return <ProgramDetailPage language={language} snapshot={snapshot} />;
}
