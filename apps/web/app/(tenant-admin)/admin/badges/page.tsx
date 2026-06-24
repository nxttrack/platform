import { AdminBadgesPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function TenantAdminBadgesPage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminBadgesPage snapshot={snapshot} />;
}
