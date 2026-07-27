import Link from "next/link";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { BadgeTemplateEditor } from "@/components/badges/badge-template-editor";
import { PageHeader } from "@/components/shell/ui";
import { badgeFormats, type BadgeFormat } from "@/lib/domain/badge-system-contract";
import { getBadgeEditorData } from "@/lib/domain/badge-system";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PlatformBadgeTemplatesPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await (searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>));
  const data = await getBadgeEditorData(readParam(params.template));
  const selected = data.selected;
  return <div className="space-y-6">
    <PageHeader kicker="Badge Studio" title="Canva-achtige share editor" subtitle="Bouw versieerbare formats met lagen, shortcodes en privacyveilige voorbeelddata. Native social-posting valt bewust buiten deze foundation." />
    <BadgeSectionNav active="/platform/badges/share-templates" scope="platform" />
    <div className="flex gap-2 overflow-x-auto">
      {data.templates.map((template) => <Link className={cn("shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold", template.id === selected?.id ? "border-primary bg-primary text-white" : "border-border bg-card text-foreground")} href={`/platform/badges/share-templates?template=${template.id}`} key={template.id}>{formatLabel(template.format as BadgeFormat)}</Link>)}
    </div>
    {selected ? <BadgeTemplateEditor format={selected.format as BadgeFormat} initialLayers={selected.layers_json} initialStatus={selected.status} initialVersion={selected.version} templateId={selected.id} /> : <p className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nog geen sharetemplate beschikbaar.</p>}
  </div>;
}

function formatLabel(format: BadgeFormat) {
  return ({ square: "Vierkant", story: "Story", landscape: "Liggend", certificate: "Certificaat" } satisfies Record<BadgeFormat, string>)[format] ?? format;
}
function readParam(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
