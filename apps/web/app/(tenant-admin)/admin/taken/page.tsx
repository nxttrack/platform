import { AdminTasksTodoPage } from "@/components/operations/admin-phase12-pages";
import { getAdminPhase12Snapshot } from "@/lib/operations/admin-phase12-read-model";

export default async function AdminTasksPage() {
  const snapshot = await getAdminPhase12Snapshot();

  return <AdminTasksTodoPage snapshot={snapshot} />;
}
