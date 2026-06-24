import { ProgramOverviewPage } from "@/components/public-site/tenant-public-pages";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const snapshot = await getPublicTenantSiteSnapshot();

  return <ProgramOverviewPage snapshot={snapshot} />;
}
