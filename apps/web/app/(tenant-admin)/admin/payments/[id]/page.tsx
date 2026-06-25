import { InvoiceDetailPage } from "@/components/admin/admin-detail-pages";
import { getAdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";

export default async function InvoiceDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, payments] = await Promise.all([params, getAdminPaymentsSnapshot()]);

  return <InvoiceDetailPage id={id} payments={payments} />;
}
