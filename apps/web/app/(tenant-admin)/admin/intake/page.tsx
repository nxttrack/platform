import { AdminIntakeWorkflowPage } from "@/components/placement/admin-placement-pages";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminIntakePage() {
  const snapshot = await getPlacementWorkflowSnapshot();

  return <AdminIntakeWorkflowPage snapshot={snapshot} />;
}
