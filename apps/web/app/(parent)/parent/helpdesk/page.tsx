import { ParentHelpdeskPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentHelpdeskRoute() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentHelpdeskPage snapshot={snapshot} />;
}
