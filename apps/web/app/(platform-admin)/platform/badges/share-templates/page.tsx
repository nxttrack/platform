import Link from "next/link";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeTemplateEditor } from "@/components/badges/badge-template-editor";
import { badgeFormats, type BadgeFormat } from "@/lib/domain/badge-system-contract";
import { getBadgeEditorData } from "@/lib/domain/badge-system";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlatformBadgeTemplatesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await (searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>));
  const data = await getBadgeEditorData(readParam(params.template));
  const selected = data.selected;
  return <div className="space-y-3 xl:flex xl:h-[calc(100dvh-6.5rem)] xl:min-h-0 xl:flex-col xl:gap-3 xl:space-y-0 xl:overflow-hidden 2xl:h-[calc(100dvh-7.5rem)]">
    <header className="flex shrink-0 flex-col gap-1 border-b border-border/70 pb-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Badge Studio</p>
        <h1 className="font-display text-2xl font-bold leading-tight tracking-tight">Canva-achtige share editor</h1>
      </div>
      <p className="max-w-2xl text-xs leading-5 text-muted-foreground">Bouw versieerbare formats met lagen, shortcodes en veilige voorbeelddata.</p>
    </header>
    <BadgeSectionNav active="/platform/badges/share-templates" scope="platform" />
    <Feedback error={readParam(params.error)} success={readParam(params.success)} />
    <div className="flex gap-2 overflow-x-auto">
      {data.templates.map((template) => <Link className={cn("shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold", template.id === selected?.id ? "border-primary bg-primary text-white" : "border-border bg-card text-foreground")} href={`/platform/badges/share-templates?template=${template.id}`} key={template.id}>{formatLabel(template.format as BadgeFormat)} · v{template.version}</Link>)}
    </div>
    <div className="xl:min-h-0 xl:flex-1">
      {selected ? <BadgeTemplateEditor canManage={data.canManage} format={selected.format as BadgeFormat} initialAssets={data.assets} initialLayers={selected.layers_json} initialStatus={selected.status} initialVersion={selected.version} key={`${selected.id}:${selected.version}`} templateId={selected.id} /> : <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nog geen sharetemplate beschikbaar.</p>}
    </div>
  </div>;
}

function formatLabel(format: BadgeFormat) {
  return ({ square: "Vierkant", story: "Story", landscape: "Liggend", certificate: "Certificaat" } satisfies Record<BadgeFormat, string>)[format] ?? format;
}
function Feedback({ error, success }: { error?: string; success?: string }) {
  if (!error && !success) return null;
  return <p className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{error ?? success}</p>;
}
function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
