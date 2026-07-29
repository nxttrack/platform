import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getTenantBadgeData } from "@/lib/domain/badge-system";

export const dynamic = "force-dynamic";

export default async function AdminBadgeCollectionsPage() {
  const data = await getTenantBadgeData();
  return <div className="space-y-6"><PageHeader kicker="Badges" title="Collecties" subtitle="Bekijk de badgepaden die ouders en leerlingen als positieve reis zien." /><BadgeSectionNav active="/admin/badges/collecties" scope="admin" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.collections.map((collection) => <article className="rounded-3xl border border-border bg-card p-5 shadow-soft" key={collection.id}><div className="flex items-start justify-between gap-2"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-aqua text-2xl text-white">✦</span><StatusPill tone={collection.tenant_id ? "info" : "neutral"}>{collection.tenant_id ? "Eigen" : "NXTTRACK"}</StatusPill></div><h2 className="mt-5 text-lg font-bold">{collection.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{collection.description}</p></article>)}</div></div>;
}

