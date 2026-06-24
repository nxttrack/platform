import { ProgramDetailPage } from "@/components/public-site/tenant-public-pages";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type ProgramDetailRoutePageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ProgramDetailRoutePage({ params }: ProgramDetailRoutePageProps) {
  const { slug } = await params;
  const snapshot = await getPublicTenantSiteSnapshot(slug);

  return <ProgramDetailPage snapshot={snapshot} />;
}
