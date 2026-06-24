import { AdminStagesPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminStagesRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminStagesPage snapshot={snapshot} />;
}
