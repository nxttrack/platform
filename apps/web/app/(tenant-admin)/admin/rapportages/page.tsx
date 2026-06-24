import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminReportsPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Rapportages foundation" description="Bezetting, wachtlijst, voortgang en betalingen worden later echte rapporten." items={["Bezetting", "Wachtlijst", "Voortgang", "Betalingen"]} />;
}
