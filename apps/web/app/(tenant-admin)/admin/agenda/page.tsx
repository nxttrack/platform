import { AdminPlanningBoardPage } from "@/components/operations/admin-operations-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminAgendaPage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminPlanningBoardPage snapshot={snapshot} />;
}
