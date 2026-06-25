import { AdminOperationsDashboardPage } from "@/components/operations/admin-operations-pages";
import { getAdminAfzwemSnapshot } from "@/lib/afzwem/admin-afzwem-read-model";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";
import { getAdminPhase12Snapshot } from "@/lib/operations/admin-phase12-read-model";
import { getAdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminHomePage() {
  const [domain, placement, payments, phase12, afzwem] = await Promise.all([getAdminDomainSnapshot(), getPlacementWorkflowSnapshot(), getAdminPaymentsSnapshot(), getAdminPhase12Snapshot(), getAdminAfzwemSnapshot()]);

  return <AdminOperationsDashboardPage afzwem={afzwem} domain={domain} payments={payments} phase12={phase12} placement={placement} />;
}
