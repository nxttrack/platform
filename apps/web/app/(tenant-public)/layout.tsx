import type { ReactNode } from "react";

import { TenantPublicShell } from "@/components/tenant-public/site-shell";
import { getPublicTenantSiteData } from "@/lib/domain/public-site";

export const dynamic = "force-dynamic";

export default async function TenantPublicLayout({ children }: { children: ReactNode }) {
  const data = await getPublicTenantSiteData();

  return <TenantPublicShell tenantName={data?.tenant.name ?? "NXTTRACK"}>{children}</TenantPublicShell>;
}
