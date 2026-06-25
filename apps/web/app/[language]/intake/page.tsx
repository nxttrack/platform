import { notFound } from "next/navigation";

import { IntakePage as PublicIntakePage } from "@/components/public-site/tenant-public-pages";
import { publicLanguageFromSegment } from "@/lib/i18n";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type LocalizedIntakePageProps = {
  params: Promise<{ language: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LocalizedIntakePage({ params, searchParams }: LocalizedIntakePageProps) {
  const { language: languageSegment } = await params;
  const language = publicLanguageFromSegment(languageSegment);

  if (!language) {
    notFound();
  }

  const query = (await searchParams) ?? {};
  const program = getParam(query.program);
  const submitted = getParam(query.submitted) === "1";
  const snapshot = await getPublicTenantSiteSnapshot(program);

  return <PublicIntakePage language={language} snapshot={snapshot} submitted={submitted} />;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
