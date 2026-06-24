import { AdminDomainHome } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminHomePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminDomainHome snapshot={snapshot} />;
}
