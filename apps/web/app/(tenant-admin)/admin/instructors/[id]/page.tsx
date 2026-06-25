import { InstructorDetailPage } from "@/components/admin/admin-detail-pages";
import { getAdminDomainSnapshot } from "@/lib/domain/admin-domain-read-model";

export default async function InstructorDetailRoutePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, domain] = await Promise.all([params, getAdminDomainSnapshot()]);

  return <InstructorDetailPage domain={domain} id={id} />;
}
