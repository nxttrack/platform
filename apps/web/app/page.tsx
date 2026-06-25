import { TenantMarketingPage } from "@/components/public-site/tenant-public-pages";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, "NXTTRACK tenantwebsite");
}

export default async function HomePage() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantMarketingPage snapshot={snapshot} />;
}
