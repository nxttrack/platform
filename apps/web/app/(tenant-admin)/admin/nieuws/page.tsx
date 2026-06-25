import { AdminTenantNewsPage } from "@/components/tenant-website-settings/admin-tenant-website-settings-page";
import { getAdminTenantWebsiteSettingsSnapshot } from "@/lib/tenant-website-settings/admin-tenant-website-read-model";

export default async function AdminNewsRoutePage() {
  const snapshot = await getAdminTenantWebsiteSettingsSnapshot();

  return <AdminTenantNewsPage snapshot={snapshot} />;
}
