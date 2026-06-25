import { GroupDetailPage } from "@/components/admin/admin-detail-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function GroupDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, domain] = await Promise.all([params, getAdminDomainSnapshot()]);

  return <GroupDetailPage domain={domain} id={id} />;
}
