import { AdminImportsPage } from "@/components/imports/admin-imports-page";
import { getAdminImportsSnapshot } from "@/lib/imports/admin-imports-read-model";

export default async function AdminImportsRoutePage() {
  const snapshot = await getAdminImportsSnapshot();

  return <AdminImportsPage snapshot={snapshot} />;
}
