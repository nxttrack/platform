import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminDocumentsPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Documenten foundation" description="Tenantdocumenten, uploads en rechten worden later via storage gekoppeld." items={["Storage", "Mappen", "Rechten", "Dossiers"]} />;
}
