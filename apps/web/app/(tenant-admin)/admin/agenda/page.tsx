import { AdminPlanningOperationsPage } from "@/components/planning/admin-planning-page";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminAgendaPage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminPlanningOperationsPage snapshot={snapshot} />;
}
