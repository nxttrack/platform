import { AdminPlacementSuggestionsPage } from "@/components/placement/admin-placement-pages";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function AdminPlacementSuggestionsRoutePage() {
  const snapshot = await getPlacementWorkflowSnapshot();

  return <AdminPlacementSuggestionsPage snapshot={snapshot} />;
}
