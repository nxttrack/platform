import { Plus } from "lucide-react";
import Link from "next/link";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";
import { archiveBadgeCollectionAction, saveBadgeCollectionAction } from "@/lib/domain/badge-system-actions";

export const dynamic = "force-dynamic";

type PlatformBadgeData = Awaited<ReturnType<typeof getPlatformBadgeData>>;
type Collection = PlatformBadgeData["collections"][number];

export default async function PlatformBadgeCollectionsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const [data, params] = await Promise.all([getPlatformBadgeData(), searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)]);
  const editId = readParam(params.edit);
  const showNew = readParam(params.new) === "1";

  return (
    <div className="space-y-6">
      <PageHeader kicker="Badge Studio" title="Canonieke collecties" subtitle="Maak en orden positieve badgepaden zonder kinderen onderling te vergelijken." />
      <BadgeSectionNav active="/platform/badges/collections" scope="platform" />
      <Feedback error={readParam(params.error)} success={readParam(params.success)} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-bold">Collecties</h2><p className="mt-1 text-sm text-muted-foreground">Selecteer precies welke canonieke badges in ieder pad horen.</p></div>
        {data.canManage ? <Link className={buttonVariants()} href="/platform/badges/collections?new=1#collection-editor"><Plus className="size-4" /> Nieuwe collectie</Link> : null}
      </div>

      {showNew && data.canManage ? (
        <section className="rounded-3xl border-2 border-primary/30 bg-card p-5 shadow-card" id="collection-editor">
          <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Nieuw pad</p><h2 className="mt-1 text-xl font-bold">Collectie aanmaken</h2></div><Link className={buttonVariants({ variant: "ghost", size: "sm" })} href="/platform/badges/collections">Sluiten</Link></div>
          <CollectionForm badges={data.definitions} canManage collection={null} selectedIds={new Set()} />
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.collections.map((collection) => {
          const selectedIds = new Set(data.collectionItems.filter((item) => item.collection_id === collection.id).map((item) => item.catalog_definition_id).filter(Boolean));
          return (
            <details className="rounded-3xl border border-border bg-card shadow-soft" key={collection.id} open={editId === collection.id}>
              <summary className="cursor-pointer list-none p-5">
                <div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-primary to-aqua text-xl text-white">✦</span><StatusPill tone={collection.status === "active" ? "success" : collection.status === "draft" ? "warning" : "neutral"}>{collection.status}</StatusPill></div>
                <h2 className="mt-5 text-lg font-bold">{collection.name}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{collection.description}</p>
                <div className="mt-4 flex items-center justify-between gap-3"><code className="text-xs text-primary">{collection.collection_key}</code><span className="text-xs font-semibold text-muted-foreground">{selectedIds.size} badges</span></div>
              </summary>
              <div className="border-t border-border p-5"><CollectionForm badges={data.definitions} canManage={data.canManage} collection={collection} selectedIds={selectedIds} /></div>
            </details>
          );
        })}
      </div>
      {!data.collections.length ? <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nog geen collecties.</p> : null}
    </div>
  );
}

function CollectionForm({ badges, canManage, collection, selectedIds }: { badges: PlatformBadgeData["definitions"]; canManage: boolean; collection: Collection | null; selectedIds: Set<string | null> }) {
  return (
    <form action={saveBadgeCollectionAction} className="grid gap-3 md:grid-cols-2">
      <input name="next" type="hidden" value={collection ? `/platform/badges/collections?edit=${collection.id}` : "/platform/badges/collections"} />
      {collection ? <input name="id" type="hidden" value={collection.id} /> : <Field disabled={!canManage} label="Stabiele key" name="collectionKey" placeholder="eerste_mijlpalen" required />}
      {collection ? <ReadOnly label="Stabiele key" value={collection.collection_key} /> : null}
      <Select defaultValue={collection?.status ?? "draft"} disabled={!canManage} label="Status" name="status"><option value="draft">Concept</option><option value="active">Actief</option><option value="archived">Gearchiveerd</option></Select>
      <Field defaultValue={collection?.name ?? ""} disabled={!canManage} label="Naam" name="name" required />
      <Field defaultValue={String(collection?.sort_order ?? 0)} disabled={!canManage} label="Sorteervolgorde" name="sortOrder" type="number" />
      <label className="grid gap-1.5 text-sm font-semibold md:col-span-2">Beschrijving<textarea className="min-h-24 rounded-xl border border-border bg-background p-3 font-normal" defaultValue={collection?.description ?? ""} disabled={!canManage} name="description" /></label>
      <label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold md:col-span-2"><input className="size-4 accent-primary" defaultChecked={collection?.is_surprise ?? false} disabled={!canManage} name="isSurprise" type="checkbox" /> Verrassingscollectie</label>
      <fieldset className="md:col-span-2">
        <legend className="text-sm font-bold">Badges in deze collectie</legend>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">De volgorde volgt de canonieke sorteervolgorde. Archiveren verwijdert bestaande voortgang niet.</p>
        <div className="mt-3 grid max-h-80 gap-2 overflow-y-auto rounded-2xl border border-border p-3 sm:grid-cols-2">
          {badges.map((badge) => <label className="flex items-start gap-3 rounded-xl bg-muted/30 p-3 text-sm" key={badge.id}><input className="mt-0.5 size-4 accent-primary" defaultChecked={selectedIds.has(badge.id)} disabled={!canManage} name="definitionId" type="checkbox" value={badge.id} /><span><span className="block font-semibold">{badge.name_default}</span><code className="text-[10px] text-muted-foreground">{badge.badge_key}</code></span></label>)}
        </div>
      </fieldset>
      {canManage ? <div className="flex flex-wrap gap-2 md:col-span-2"><Button type="submit">{collection ? "Collectie opslaan" : "Collectie aanmaken"}</Button>{collection && collection.status !== "archived" ? <Button formAction={archiveBadgeCollectionAction} formNoValidate type="submit" variant="outline">Archiveren</Button> : null}</div> : null}
    </form>
  );
}

function Field({ defaultValue, disabled, label, name, placeholder, required, type = "text" }: { defaultValue?: string; disabled?: boolean; label: string; name: string; placeholder?: string; required?: boolean; type?: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<input className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name} placeholder={placeholder} required={required} type={type} /></label>;
}

function Select({ children, defaultValue, disabled, label, name }: { children: React.ReactNode; defaultValue: string; disabled?: boolean; label: string; name: string }) {
  return <label className="grid gap-1.5 text-sm font-semibold">{label}<select className="h-11 rounded-xl border border-border bg-background px-3 font-normal" defaultValue={defaultValue} disabled={disabled} name={name}>{children}</select></label>;
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-muted/40 px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><code className="mt-1 block text-xs text-foreground">{value}</code></div>;
}

function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <p className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>;
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
