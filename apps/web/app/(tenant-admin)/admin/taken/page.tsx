import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminTasksPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Taken foundation" description="Operationele taken blijven voorbereid tot planning, plaatsing en berichten echte workflows hebben." items={["Backoffice", "Planning", "Plaatsing", "Opvolging"]} />;
}
