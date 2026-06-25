import { ProgramOverviewPage } from "@/components/public-site/tenant-public-pages";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, "Programma's");
}

export default async function ProgramsPage() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return <ProgramOverviewPage snapshot={snapshot} />;
}
