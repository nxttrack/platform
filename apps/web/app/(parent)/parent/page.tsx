import { ParentDashboardPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentHomePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentDashboardPage snapshot={snapshot} />;
}
