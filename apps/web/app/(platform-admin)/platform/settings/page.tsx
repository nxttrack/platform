import { PlatformSettingsCompletionPage } from "@/components/platform-admin/platform-completion-pages";
import { getPlatformCompletionSnapshot } from "@/lib/platform-admin/platform-completion-read-model";

type PlatformSettingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformSettingsPage({ searchParams }: PlatformSettingsPageProps) {
  const params = (await searchParams) ?? {};
  const snapshot = await getPlatformCompletionSnapshot({
    query: getParam(params.query),
    sector: getParam(params.sector),
    status: getParam(params.status),
    auditTable: getParam(params.auditTable)
  });

  return <PlatformSettingsCompletionPage snapshot={snapshot} notice={getParam(params.notice)} error={getParam(params.error)} />;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
