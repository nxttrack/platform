import { ParentDiplomasPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentDiplomasRoutePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentDiplomasPage snapshot={snapshot} />;
}
