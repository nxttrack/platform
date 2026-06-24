import { InstructorAgendaPage as InstructorAgendaPortalPage } from "@/components/instructor-portal/instructor-portal-pages";
import { getInstructorPortalSnapshot } from "@/lib/instructor-portal/instructor-portal-read-model";

export default async function InstructorAgendaPage() {
  const snapshot = await getInstructorPortalSnapshot();

  return <InstructorAgendaPortalPage snapshot={snapshot} />;
}
