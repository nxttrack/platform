import { AdminSessionsPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminSessionsRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminSessionsPage snapshot={snapshot} />;
}
