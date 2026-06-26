import { AdminWaitlistWorkflowPage } from "@/components/placement/admin-placement-pages";
import { getPlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

type AdminWaitlistPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminWaitlistPage({ searchParams }: AdminWaitlistPageProps) {
  const snapshot = await getPlacementWorkflowSnapshot();
  const params = (await searchParams) ?? {};

  return <AdminWaitlistWorkflowPage filters={normalizeFilters(params)} snapshot={snapshot} />;
}

function normalizeFilters(params: Record<string, string | string[] | undefined>) {
  return {
    tab: stringParam(params.tab),
    program: stringParam(params.program),
    stage: stringParam(params.stage),
    preferred_day: stringParam(params.preferred_day),
    status: stringParam(params.status),
    priority: stringParam(params.priority),
    duplicate: stringParam(params.duplicate),
    contact: stringParam(params.contact)
  };
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
