import { notFound } from "next/navigation";

import { TenantMarketingPage } from "@/components/public-site/tenant-public-pages";
import { publicLanguageFromSegment } from "@/lib/i18n";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type LocalizedTenantHomePageProps = {
  params: Promise<{ language: string }>;
};

export async function generateMetadata({ params }: LocalizedTenantHomePageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    return {};
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, language === "en" ? "NXTTRACK tenant website" : "NXTTRACK tenantwebsite");
}

export default async function LocalizedTenantHomePage({ params }: LocalizedTenantHomePageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    notFound();
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantMarketingPage language={language} snapshot={snapshot} />;
}
