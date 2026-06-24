import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function PlatformSettingsPage() {
  return <RoutePlaceholder kicker="Platformbeheer" title="Instellingen" description="Globale platforminstellingen, audit, domeinen en integraties blijven platform-only en krijgen hier een nette beheerplek." items={["Beveiliging", "Audit", "Domeinen", "Integraties"]} status="Voorbereid" />;
}
