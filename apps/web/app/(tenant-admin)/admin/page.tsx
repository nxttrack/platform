import { TenantAdminDashboard } from "@/components/admin/tenant-admin-dashboard";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getAdminOperationsData } from "@/lib/domain/admin-operations";
import { getActiveTenant } from "@/lib/domain/core";
import { getDailyOperationalCockpit } from "@/lib/domain/operational-cockpit";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const [data, cockpit] = await Promise.all([getAdminOperationsData(), getDailyOperationalCockpit(tenant.id)]);

  return <TenantAdminDashboard data={data} signals={cockpit.signals} tenantName={tenant.name} />;
}
