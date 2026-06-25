import { AdminAutomationPage } from "@/components/automation/admin-automation-page";
import { getAdminAutomationSnapshot } from "@/lib/automation/admin-automation-read-model";

export default async function AdminAutomationRoutePage() {
  const snapshot = await getAdminAutomationSnapshot();

  return <AdminAutomationPage snapshot={snapshot} />;
}
