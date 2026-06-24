import { AdminWaitlistWorkflowPage } from "@/components/placement/admin-placement-pages";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminWaitlistPage() {
  const snapshot = await getPlacementWorkflowSnapshot();

  return <AdminWaitlistWorkflowPage snapshot={snapshot} />;
}
