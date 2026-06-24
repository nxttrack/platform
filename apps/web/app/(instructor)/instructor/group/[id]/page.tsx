import { InstructorGroupDetailPage } from "@/components/instructor-portal/instructor-portal-pages";
import { getInstructorPortalSnapshot } from "@/lib/instructor-portal/instructor-portal-read-model";

export default async function InstructorGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const snapshot = await getInstructorPortalSnapshot();

  return <InstructorGroupDetailPage groupId={id} snapshot={snapshot} />;
}
