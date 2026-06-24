import { AdminInstructorsPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminInstructorsRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminInstructorsPage snapshot={snapshot} />;
}
