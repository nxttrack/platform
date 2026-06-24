import { IntakePage as PublicIntakePage } from "@/components/public-site/tenant-public-pages";
import { getPublicTenantSiteSnapshot } from "@/lib/public-site/tenant-site";

export const dynamic = "force-dynamic";

type IntakeRoutePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function IntakeRoutePage({ searchParams }: IntakeRoutePageProps) {
  const params = (await searchParams) ?? {};
  const program = getParam(params.program);
  const submitted = getParam(params.submitted) === "1";
  const snapshot = await getPublicTenantSiteSnapshot(program);

  return <PublicIntakePage snapshot={snapshot} submitted={submitted} />;
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
