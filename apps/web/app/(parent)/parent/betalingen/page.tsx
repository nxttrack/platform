import { ParentPaymentsPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentPaymentsRoutePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentPaymentsPage snapshot={snapshot} />;
}
