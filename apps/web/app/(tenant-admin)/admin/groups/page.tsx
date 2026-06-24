import { AdminGroupsPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminGroupsRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminGroupsPage snapshot={snapshot} />;
}
