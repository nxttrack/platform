import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function ParentLessonsPage() {
  return <RoutePlaceholder kicker="Mijn lessen" title="Lessons skeleton" description="Sessions, cancellations en catch-up credits komen later." items={["Sessions", "Attendance", "Catch-up credits", "Cancellation policy"]} />;
}
