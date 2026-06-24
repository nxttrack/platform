import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function PlatformSettingsPage() {
  return <RoutePlaceholder kicker="Platform admin" title="Settings foundation" description="Globale platforminstellingen, audit en support tools blijven platform-only." items={["Security", "Audit", "Domains", "Integrations"]} />;
}
