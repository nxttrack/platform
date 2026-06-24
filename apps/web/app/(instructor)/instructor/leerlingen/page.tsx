import { InstructorStudentsPage as InstructorStudentsPortalPage } from "@/components/instructor-portal/instructor-portal-pages";
import { getInstructorPortalSnapshot } from "@/lib/instructor-portal/instructor-portal-read-model";

export default async function InstructorStudentsPage() {
  const snapshot = await getInstructorPortalSnapshot();

  return <InstructorStudentsPortalPage snapshot={snapshot} />;
}
