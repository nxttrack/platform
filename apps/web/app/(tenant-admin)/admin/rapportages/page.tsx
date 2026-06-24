import { AdminCapacityReportsPage } from "@/components/operations/admin-operations-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";
import { getAdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminReportsPage() {
  const [domain, placement, payments] = await Promise.all([getAdminDomainSnapshot(), getPlacementWorkflowSnapshot(), getAdminPaymentsSnapshot()]);

  return <AdminCapacityReportsPage domain={domain} payments={payments} placement={placement} />;
}
