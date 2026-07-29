import { FileText, RadioTower, ShieldCheck, Variable } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { CommunicationTemplatesTable } from "@/components/communication/communication-admin-tables";
import { CommunicationTemplateForm } from "@/components/communication/communication-forms";
import { PageHeader } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { getAdminCommunicationHub } from "@/lib/domain/communication-hub";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";

export default async function CommunicationTemplatesPage({ searchParams }: PageProps) {
  const [hub, params] = await Promise.all([getAdminCommunicationHub(), searchParams ?? Promise.resolve({})]);
  const active = hub.templates.filter((item) => item.status === "active").length;
  const external = hub.templates.filter((item) => item.channel !== "in_app").length;
  const variables = new Set(hub.templates.flatMap((item) => item.variables_json)).size;

  return (
    <div className="space-y-5">
      <PageHeader
        action={<AdminActionDrawer description="Bouw een herbruikbare, tenant-scoped template met veilige shortcodes en preview." title="Nieuwe template" triggerLabel="Template maken" width="wide"><CommunicationTemplateForm /></AdminActionDrawer>}
        kicker="Communicatiehub"
        title="Templates"
        subtitle="Beheer consistente teksten per kanaal met TipTap, toegestane variabelen en inhoudscontrole."
      />
      <RouteFeedback error={param(params, "error")} success={param(params, "success")} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard detail="beschikbaar" icon={FileText} label="Templates" tone="info" value={hub.templates.length} />
        <AdminMetricCard detail="bruikbaar" icon={ShieldCheck} label="Actief" tone="success" value={active} />
        <AdminMetricCard detail="e-mail of fallback" icon={RadioTower} label="Extern kanaal" tone="warning" value={external} />
        <AdminMetricCard detail="unieke shortcodes" icon={Variable} label="Variabelen" value={variables} />
      </div>
      <CommunicationTemplatesTable data={hub.templates} />
    </div>
  );
}

function param(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
