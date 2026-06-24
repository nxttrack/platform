import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default async function InstructorGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <RoutePlaceholder kicker="Group skeleton" title={`Group ${id}`} description="Groep/session roster route voor attendance workflow." items={["Roster", "Attendance", "Capacity", "Session notes"]} />;
}
