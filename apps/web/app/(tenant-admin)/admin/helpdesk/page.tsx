import { AdminHelpdeskPage } from "@/components/operations/admin-phase12-pages";
import { getAdminPhase12Snapshot } from "@/lib/operations/admin-phase12-read-model";

type AdminHelpdeskRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminHelpdeskRoute({ searchParams }: AdminHelpdeskRouteProps) {
  const params = await searchParams;
  const snapshot = await getAdminPhase12Snapshot();

  return (
    <AdminHelpdeskPage
      filters={{
        status: asString(params.status),
        category: asString(params.category),
        priority: asString(params.priority)
      }}
      snapshot={snapshot}
    />
  );
}

function asString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
