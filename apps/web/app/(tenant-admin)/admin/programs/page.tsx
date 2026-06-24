import { AdminProgramsPage } from "@/components/domain/admin-domain-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function AdminProgramsRoutePage() {
  const snapshot = await getAdminDomainSnapshot();

  return <AdminProgramsPage snapshot={snapshot} />;
}
