import { IntakeDetailPage } from "@/components/admin/admin-detail-pages";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

export default async function IntakeDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, placement] = await Promise.all([params, getPlacementWorkflowSnapshot()]);

  return <IntakeDetailPage id={id} placement={placement} />;
}
