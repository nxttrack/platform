import { PlatformTemplatesCompletionPage } from "@/components/platform-admin/platform-completion-pages";
import { getPlatformCompletionSnapshot } from "@/lib/platform-admin/platform-completion-read-model";

type PlatformTemplatesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PlatformTemplatesPage({ searchParams }: PlatformTemplatesPageProps) {
  const params = (await searchParams) ?? {};
  const snapshot = await getPlatformCompletionSnapshot();

  return <PlatformTemplatesCompletionPage snapshot={snapshot} notice={getParam(params.notice)} error={getParam(params.error)} />;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
