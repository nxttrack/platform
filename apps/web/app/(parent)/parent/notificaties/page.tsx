import { ParentNotificationsPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentNotificationsRoutePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentNotificationsPage snapshot={snapshot} />;
}
