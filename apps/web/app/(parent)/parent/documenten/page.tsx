import { ParentDocumentsPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentDocumentsRoutePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentDocumentsPage snapshot={snapshot} />;
}
