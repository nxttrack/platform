import { Award, Eye, Send } from "lucide-react";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { getTenantBadgeData } from "@/lib/domain/badge-system";

export const dynamic = "force-dynamic";

export default async function AdminBadgeAnalyticsPage() {
  const data = await getTenantBadgeData();
  const realEvents = data.events.filter((event) => !event.is_test);
  const definitionById = new Map(data.definitions.map((definition) => [definition.id, definition]));
  return <div className="space-y-6"><PageHeader kicker="Badges" title="Badge-analytics" subtitle="Operationele inzichten voor activatie en communicatie, zonder kinderen te rangschikken of automatisch te beoordelen." /><BadgeSectionNav active="/admin/badges/analytics" scope="admin" /><div className="grid gap-4 md:grid-cols-3"><Metric icon={<Award className="size-5" />} label="Verdienmomenten" value={realEvents.filter((event) => ["earned", "approved"].includes(event.event_type)).length} /><Metric icon={<Eye className="size-5" />} label="Bekeken" value={realEvents.filter((event) => event.event_type === "viewed").length} /><Metric icon={<Send className="size-5" />} label="Gedeeld" value={realEvents.filter((event) => event.event_type === "shared").length} /></div><section className="rounded-3xl border border-border bg-card p-5 shadow-card"><h2 className="text-lg font-bold">Meest toegekende badges</h2><div className="mt-4 space-y-3">{Array.from(countByDefinition(data.awards.filter((award) => !award.is_test && award.status === "awarded")).entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id, count]) => <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3" key={id}><div><p className="font-semibold">{definitionById.get(id)?.name_default ?? "Eigen of legacy badge"}</p><p className="text-xs text-muted-foreground">Geen leerlingnamen in deze rapportage</p></div><StatusPill tone="info">{count}×</StatusPill></div>)}</div></section></div>;
}
function countByDefinition(awards: Array<{ catalog_definition_id: string | null }>) { const result = new Map<string, number>(); for (const award of awards) { const key = award.catalog_definition_id ?? "legacy"; result.set(key, (result.get(key) ?? 0) + 1); } return result; }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <article className="rounded-3xl border border-border bg-card p-5 shadow-soft"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="text-sm font-semibold">{label}</p></article>; }
