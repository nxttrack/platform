import { AdminPaymentsPage } from "@/components/payments/admin-payments-page";
import { getAdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";

export default async function AdminPaymentsRoutePage() {
  const snapshot = await getAdminPaymentsSnapshot();

  return <AdminPaymentsPage snapshot={snapshot} />;
}
