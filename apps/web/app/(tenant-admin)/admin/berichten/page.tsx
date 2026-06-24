import { RoutePlaceholder } from "@/components/shell/route-placeholder";

export default function AdminMessagesPage() {
  return <RoutePlaceholder kicker="Tenant admin" title="Berichten foundation" description="SendGrid/SMTP templates en notificatiestromen worden in Phase 12 gekoppeld." items={["SMTP", "SendGrid", "Templates", "Notificaties"]} />;
}
