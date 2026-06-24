import { ParentProfilePage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentProfileRoutePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentProfilePage snapshot={snapshot} />;
}
