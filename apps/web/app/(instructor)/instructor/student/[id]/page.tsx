import { InstructorStudentDetailPage } from "@/components/instructor-portal/instructor-portal-pages";
import { getInstructorPortalSnapshot } from "@/lib/instructor-portal/instructor-portal-read-model";

export default async function InstructorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await getInstructorPortalSnapshot();

  return <InstructorStudentDetailPage participantId={id} snapshot={snapshot} />;
}
