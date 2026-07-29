import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";

export const dynamic = "force-dynamic";

export default async function PlatformBadgeCollectionsPage() {
  const data = await getPlatformBadgeData();
  return <div className="space-y-6">
    <PageHeader kicker="Badge Studio" title="Canonieke collecties" subtitle="Logische, positieve paden die ouders voortgang laten beleven zonder kinderen onderling te vergelijken." />
    <BadgeSectionNav active="/platform/badges/collections" scope="platform" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data.collections.map((collection) => <article className="rounded-3xl border border-border bg-card p-5 shadow-soft" key={collection.id}><div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-aqua text-xl text-white">✦</span><StatusPill tone={collection.status === "active" ? "success" : "neutral"}>{collection.status}</StatusPill></div><h2 className="mt-5 text-lg font-bold">{collection.name}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{collection.description}</p><code className="mt-4 block text-xs text-primary">{collection.collection_key}</code></article>)}
    </div>
  </div>;
}

