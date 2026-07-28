import type { ReactNode } from "react";

import { PublicAnalytics } from "@/components/analytics/public-analytics";
import { TenantPublicShell } from "@/components/tenant-public/site-shell";
import { getPublicTenantSiteData } from "@/lib/domain/public-site";

export const dynamic = "force-dynamic";

export default async function TenantPublicLayout({ children }: { children: ReactNode }) {
  const data = await getPublicTenantSiteData();
  const hiddenPaths = data ? [
    data.pages.programs.status === "hidden" ? "/programmas" : null,
    data.pages.agenda.status === "hidden" ? "/agenda" : null,
    data.pages.news.status === "hidden" ? "/nieuws" : null
  ].filter((value): value is string => Boolean(value)) : [];

  return (
    <>
      <TenantPublicShell hiddenPaths={hiddenPaths} tenantName={data?.tenant.name ?? "NXTTRACK"}>{children}</TenantPublicShell>
      <PublicAnalytics measurementId={data?.analyticsMeasurementId} />
    </>
  );
}
