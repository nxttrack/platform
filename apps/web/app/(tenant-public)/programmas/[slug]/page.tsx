import { ProgramDetailPage } from "@/components/public-site/tenant-public-pages";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type ProgramDetailRoutePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ProgramDetailRoutePageProps) {
  const { slug } = await params;
  const snapshot = await getPublicTenantSiteSnapshot(slug);
  const title = snapshot.selectedProgram ? `${snapshot.selectedProgram.name} - ${snapshot.tenant?.name ?? "NXTTRACK"}` : "Programma";

  return buildTenantPublicMetadata(snapshot, title);
}

export default async function ProgramDetailRoutePage({ params }: ProgramDetailRoutePageProps) {
  const { slug } = await params;
  const snapshot = await getPublicTenantSiteSnapshot(slug);

  return <ProgramDetailPage snapshot={snapshot} />;
}
