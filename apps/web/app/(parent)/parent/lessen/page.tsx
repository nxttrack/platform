import { ParentLessonsPage } from "@/components/parent-portal/parent-portal-pages";
import { getParentPortalSnapshot } from "@/lib/parent-portal/parent-portal-read-model";

export default async function ParentLessonsRoutePage() {
  const snapshot = await getParentPortalSnapshot();

  return <ParentLessonsPage snapshot={snapshot} />;
}
