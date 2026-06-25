import { LearnerDetailPage } from "@/components/admin/admin-detail-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function LearnerDetailRoutePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query, domain] = await Promise.all([params, searchParams, getAdminDomainSnapshot()]);

  return <LearnerDetailPage domain={domain} id={id} tab={query.tab} />;
}
