import type { AppRole, TenantRole } from "@/lib/auth/roles";
import type { SectorKey } from "./terminology";

export type TenantContext = {
  tenantId: string;
  slug: string;
  sector: SectorKey;
  roles: TenantRole[];
};

export type PlatformContext = {
  userId: string;
  roles: AppRole[];
  activeTenantId?: string;
};
