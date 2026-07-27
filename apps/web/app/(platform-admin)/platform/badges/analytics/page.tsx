import { Activity, Building2, CheckCircle2 } from "lucide-react";

import { BadgeSectionNav } from "@/components/badges/badge-section-nav";
import { PageHeader } from "@/components/shell/ui";
import { getPlatformBadgeData } from "@/lib/domain/badge-system";

export const dynamic = "force-dynamic";

export default async function PlatformBadgeAnalyticsPage() {
  const data = await getPlatformBadgeData();
  const tenantById = new Map(data.tenants.map((tenant) => [tenant.id, tenant]));
  const realEvents = data.events.filter((event) => !event.is_test);
  return <div className="space-y-6">
    <PageHeader kicker="Badge Studio" title="Platformanalytics" subtitle="Geaggregeerde productinzichten. Journey Bot-events blijven herkenbaar en staan los van echte tenantcijfers." />
    <BadgeSectionNav active="/platform/badges/analytics" scope="platform" />
    <div className="grid gap-4 md:grid-cols-3"><Metric icon={<Activity className="size-5" />} label="Events" value={realEvents.length} /><Metric icon={<CheckCircle2 className="size-5" />} label="Verdienmomenten" value={realEvents.filter((event) => event.event_type === "earned" || event.event_type === "approved").length} /><Metric icon={<Building2 className="size-5" />} label="Actieve tenants" value={new Set(realEvents.map((event) => event.tenant_id)).size} /></div>
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card"><div className="border-b border-border p-5"><h2 className="font-bold">Recente audit-events</h2><p className="mt-1 text-sm text-muted-foreground">Geen ranglijst van kinderen; alleen operationele productevents.</p></div><div className="divide-y divide-border">{data.events.slice(0, 100).map((event) => <div className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_180px_180px]" key={event.id}><div><p className="font-semibold">{event.event_type.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{tenantById.get(event.tenant_id)?.name ?? "Tenant"}</p></div><span>{event.is_test ? "Journey Bot" : "Productiedata"}</span><time className="text-muted-foreground">{new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurred_at))}</time></div>)}</div></section>
  </div>;
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <article className="rounded-3xl border border-border bg-card p-5 shadow-soft"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-1 text-sm font-semibold">{label}</p></article>; }
