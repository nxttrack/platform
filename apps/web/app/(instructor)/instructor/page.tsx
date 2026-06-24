import { InstructorDashboardPage } from "@/components/instructor-portal/instructor-portal-pages";
import { getInstructorPortalSnapshot } from "@/lib/instructor-portal/instructor-portal-read-model";

export default async function InstructorHomePage() {
  const snapshot = await getInstructorPortalSnapshot();

  return <InstructorDashboardPage snapshot={snapshot} />;
}
