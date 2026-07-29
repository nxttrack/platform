import { Activity, Building2, ShieldCheck } from "lucide-react";
import { AuditExplorerTable } from "@/components/audit/audit-explorer-table";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { PageHeader } from "@/components/shell/ui";
import { getPlatformAuditRows } from "@/lib/domain/audit-explorer";

export const dynamic = "force-dynamic";

export default async function PlatformAuditPage() {
  const rows = await getPlatformAuditRows();
  return <div className="space-y-5"><PageHeader kicker="Control plane governance" title="Platform Audit Explorer" subtitle="Eén afgeschermd overzicht van tenant-, account-, incident- en supportwijzigingen met actor, object en voor/na-bewijs." /><div className="grid gap-3 sm:grid-cols-3"><AdminMetricCard icon={Activity} label="Gebeurtenissen" tone="info" value={rows.length} /><AdminMetricCard icon={Building2} label="Organisaties geraakt" tone="neutral" value={new Set(rows.map((row) => row.tenant)).size} /><AdminMetricCard icon={ShieldCheck} label="Afgeschermde details" tone="success" value="actief" /></div><AuditExplorerTable rows={rows} storageKey="platform.audit" /></div>;
}
