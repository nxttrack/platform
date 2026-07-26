import { Clock3, Users } from "lucide-react";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { FamiliesTable } from "@/components/admin/families-table";
import { PageHeader } from "@/components/shell/ui";
import { getTenantFamilies } from "@/lib/domain/families";

export const dynamic = "force-dynamic";

export default async function AdminFamiliesPage() {
  const data = await getTenantFamilies();
  return (
    <div className="space-y-5">
      <PageHeader kicker="Leerlingen" title="Gezinnen" subtitle="Open één ouderdossier voor gekoppelde kinderen, wachtlijststatus en uitlegbare gezinsplanning." />
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminMetricCard icon={Users} label="Gezinnen" value={data.families.length} />
        <AdminMetricCard icon={Clock3} label="Met wachtend kind" tone="warning" value={data.families.filter((family) => family.waitingNames.length > 0).length} />
      </div>
      <AdminListSurface>
        <FamiliesTable rows={data.families.map((family) => ({
          guardianId: family.guardianId,
          guardianName: family.guardianName,
          guardianEmail: family.guardianEmail,
          children: [...new Set([...family.participantNames, ...family.waitingNames])].join(", "),
          waiting: family.waitingNames.join(", "),
          childCount: new Set([...family.participantNames, ...family.waitingNames]).size,
          waitingCount: family.waitingNames.length
        }))} />
      </AdminListSurface>
    </div>
  );
}
