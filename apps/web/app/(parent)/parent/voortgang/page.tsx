import { ParentProgressPage as ParentProgressPortalPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentProgressPage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentProgressPortalPage snapshot={snapshot} />;
}
