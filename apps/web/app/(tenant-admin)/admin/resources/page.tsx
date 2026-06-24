import { AdminResourcesPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminResourcesRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminResourcesPage snapshot={snapshot} />;
}
