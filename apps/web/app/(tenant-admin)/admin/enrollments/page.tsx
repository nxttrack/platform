import { AdminEnrollmentsPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminEnrollmentsRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminEnrollmentsPage snapshot={snapshot} />;
}
