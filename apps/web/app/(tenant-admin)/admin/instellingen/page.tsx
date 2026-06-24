import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminSettingsPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Instellingen foundation" description="Tenantinstellingen, sector-termen en branding worden later editable gemaakt." items={["Tenant", "Terminologie", "Branding", "Rechten"]} />;
}
