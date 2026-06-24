import { AdminSlotOffersPage } from "@/components/placement/admin-placement-pages";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminSlotOffersRoutePage() {
  const snapshot = await getPlacementWorkflowSnapshot();

  return <AdminSlotOffersPage snapshot={snapshot} />;
}
