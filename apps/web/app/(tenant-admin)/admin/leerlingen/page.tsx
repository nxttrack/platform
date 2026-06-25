import { AdminPeopleOperationsPage } from "@/components/people/admin-people-page";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminStudentsPage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminPeopleOperationsPage snapshot={snapshot} />;
}
