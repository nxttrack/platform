import { TenantNewsPage } from "@/components/public-site/tenant-public-pages";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantNewsPage snapshot={snapshot} />;
}
