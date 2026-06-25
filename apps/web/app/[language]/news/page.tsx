import { notFound } from "next/navigation";

import { TenantNewsPage } from "@/components/public-site/tenant-public-pages";
import { publicLanguageFromSegment } from "@/lib/i18n";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type LocalizedNewsPageProps = {
  params: Promise<{ language: string }>;
};

export async function generateMetadata({ params }: LocalizedNewsPageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    return {};
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, language === "en" ? "News" : "Nieuws");
}

export default async function LocalizedNewsPage({ params }: LocalizedNewsPageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    notFound();
  }

  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantNewsPage language={language} snapshot={snapshot} />;
}
