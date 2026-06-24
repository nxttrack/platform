import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminSettingsPage() {
  return <RoutePlaceholder kicker="Backoffice - instellingen" title="Instellingen" description="Tenantinstellingen, sector-termen en branding staan klaar als nette placeholder tot het echte beheer wordt gekoppeld." items={["Tenantprofiel", "Terminologie", "Branding", "Rechten"]} status="Voorbereid" />;
}
