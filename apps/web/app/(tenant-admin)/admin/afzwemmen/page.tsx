import { AdminAfzwemPage } from "@/components/afzwem/admin-afzwem-page";
import { getAdminAfzwemSnapshot } from "@/lib/afzwem/admin-afzwem-read-model";

export default async function AdminGraduationPage() {
  const snapshot = await getAdminAfzwemSnapshot();

  return <AdminAfzwemPage snapshot={snapshot} />;
}
