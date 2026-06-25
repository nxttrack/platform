import { AdminTenantWebsiteSettingsPage } from "@/components/tenant-website-settings/admin-tenant-website-settings-page";
import { getAdminTenantWebsiteSettingsSnapshot } from "@/lib/tenant-website-settings/admin-tenant-website-read-model";

export default async function AdminSettingsPage() {
  const snapshot = await getAdminTenantWebsiteSettingsSnapshot();

  return <AdminTenantWebsiteSettingsPage snapshot={snapshot} />;
}
