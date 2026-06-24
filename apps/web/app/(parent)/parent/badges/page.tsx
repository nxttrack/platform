import { ParentBadgesPage as ParentBadgesPortalPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentBadgesPage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentBadgesPortalPage snapshot={snapshot} />;
}
