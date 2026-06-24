import { InstructorGroupsPage as InstructorGroupsPortalPage } from "@/components/instructor-portal/instructor-portal-pages";
import { getInstructorPortalSnapshot } from "@/lib/instructor-portal/instructor-portal-read-model";

export default async function InstructorGroupsPage() {
  const snapshot = await getInstructorPortalSnapshot();

  return <InstructorGroupsPortalPage snapshot={snapshot} />;
}
