import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default async function InstructorStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <RoutePlaceholder kicker="Student skeleton" title={`Student ${id}`} description="Student assessment route voor progress, notes en badges." items={["Progress scoring", "Internal notes", "Parent-visible notes", "Badge action"]} />;
}
