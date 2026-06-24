import { AdminReportsExportsPage } from "@/components/operations/admin-phase12-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";
import { getAdminPhase12Snapshot } from "@/lib/operations/admin-phase12-read-model";
import { getAdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminReportsPage() {
  const [phase12, domain, placement, payments] = await Promise.all([getAdminPhase12Snapshot(), getAdminDomainSnapshot(), getPlacementWorkflowSnapshot(), getAdminPaymentsSnapshot()]);

  return <AdminReportsExportsPage domain={domain} payments={payments} phase12={phase12} placement={placement} />;
}
