import { AdminStudentsParentsPage } from "@/components/operations/admin-operations-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminStudentsPage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminStudentsParentsPage snapshot={snapshot} />;
}
