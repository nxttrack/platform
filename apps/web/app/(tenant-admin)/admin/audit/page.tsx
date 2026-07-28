import { Activity, ShieldCheck, UsersRound } from "lucide-react";
import { AuditExplorerTable } from "@/components/audit/audit-explorer-table";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { PageHeader } from "@/components/shell/ui";
import { getTenantAuditRows } from "@/lib/domain/audit-explorer";

export const dynamic = "force-dynamic";

export default async function TenantAuditPage() {
  const rows = await getTenantAuditRows();
  return <div className="space-y-5"><PageHeader kicker="Governance" title="Audit Explorer" subtitle="Doorzoek wie wat wijzigde, wanneer en met welk resultaat. Details blijven tenantgebonden; secrets worden automatisch afgeschermd." /><div className="grid gap-3 sm:grid-cols-3"><AdminMetricCard icon={Activity} label="Gebeurtenissen" tone="info" value={rows.length} /><AdminMetricCard icon={UsersRound} label="Actoren" tone="neutral" value={new Set(rows.map((row) => row.actor)).size} /><AdminMetricCard icon={ShieldCheck} label="Mislukt / teruggedraaid" tone={rows.some((row) => row.outcome === "failed") ? "warning" : "success"} value={rows.filter((row) => row.outcome === "failed" || row.outcome === "reverted").length} /></div><AuditExplorerTable rows={rows} storageKey="admin.audit" /></div>;
}
