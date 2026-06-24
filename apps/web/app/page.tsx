import { TenantMarketingPage } from "@/components/public-site/tenant-public-pages";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantMarketingPage snapshot={snapshot} />;
}
