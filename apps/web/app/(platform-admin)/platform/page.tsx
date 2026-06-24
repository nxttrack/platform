import { PlatformAdminDashboard } from "@/components/platform-admin/platform-admin-dashboard";
import { getPlatformAdminSnapshot } from "@/lib/platform-admin/platform-admin-read-model";

type PlatformPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformPage({ searchParams }: PlatformPageProps) {
  const params = (await searchParams) ?? {};
  const snapshot = await getPlatformAdminSnapshot();

  return <PlatformAdminDashboard snapshot={snapshot} notice={getParam(params.notice)} error={getParam(params.error)} />;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
