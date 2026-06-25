import { TenantNewsPage } from "@/components/public-site/tenant-public-pages";
import { buildTenantPublicMetadata } from "@/lib/public-site/metadata";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return buildTenantPublicMetadata(snapshot, "Nieuws");
}

export default async function NewsPage() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return <TenantNewsPage snapshot={snapshot} />;
}
