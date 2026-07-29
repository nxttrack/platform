import { BellRing, CheckCheck, Link2, ShieldAlert } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { NotificationTable } from "@/components/communication/communication-admin-tables";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getAdminCommunicationHub } from "@/lib/domain/communication-hub";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage({ searchParams }: PageProps) {
  const [hub, params] = await Promise.all([getAdminCommunicationHub(), searchParams ?? Promise.resolve({})]);
  const unread = hub.notifications.filter((item) => item.status === "unread").length;
  const urgent = hub.notifications.filter((item) => item.priority === "urgent" || item.priority === "high").length;
  const linked = hub.notifications.filter((item) => item.entity_type).length;

  return (
    <div className="space-y-5">
      <PageHeader kicker="Communicatiehub" title="Notificaties" subtitle="Controleer persoonlijke in-appsignalen, prioriteit en dossiercontext binnen de huidige organisatie." />
      <RouteFeedback error={param(params, "error")} success={param(params, "success")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard detail="in totaal" icon={BellRing} label="Notificaties" tone="info" value={hub.notifications.length} />
        <AdminMetricCard detail="actie gevraagd" icon={CheckCheck} label="Ongelezen" tone={unread ? "warning" : "success"} value={unread} />
        <AdminMetricCard detail="hoog of urgent" icon={ShieldAlert} label="Prioriteit" tone={urgent ? "danger" : "neutral"} value={urgent} />
        <AdminMetricCard detail="met dossierlink" icon={Link2} label="Context" tone="neutral" value={linked} />
      </div>
      <NotificationTable data={hub.notifications} />
    </div>
  );
}

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
