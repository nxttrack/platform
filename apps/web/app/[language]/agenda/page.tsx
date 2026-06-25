import { notFound } from "next/navigation";

import { TenantAgendaPage } from "@/components/public-site/tenant-public-pages";
import { publicLanguageFromSegment } from "@/lib/i18n";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type LocalizedAgendaPageProps = {
  params: Promise<{ language: string }>;
};

export async function generateMetadata({ params }: LocalizedAgendaPageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    return {};
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, language === "en" ? "Agenda" : "Agenda");
}

export default async function LocalizedAgendaPage({ params }: LocalizedAgendaPageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    notFound();
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantAgendaPage language={language} snapshot={snapshot} />;
}
