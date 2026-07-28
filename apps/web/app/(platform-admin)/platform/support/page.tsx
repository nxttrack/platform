import { Clock3, Eye, LifeBuoy, LockKeyhole, Plus } from "lucide-react";
import Link from "next/link";
import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requestSupportAccessAction } from "@/lib/domain/support-access-actions";
import { getPlatformSupportAccessData } from "@/lib/domain/support-access";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };
export const dynamic = "force-dynamic";

export default async function PlatformSupportPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getPlatformSupportAccessData(), searchParams ?? Promise.resolve({})]);
  const tenantNames = new Map(data.tenants.map((row) => [row.id, row.name]));
  const active = data.grants.filter((row) => row.status === "active");
  const pending = data.grants.filter((row) => row.status === "requested");
  return <div className="space-y-5">
    <PageHeader kicker="Veilige customer support" title="Supporttoegang" subtitle="Vraag doelgebonden, read-only diagnose aan. Een tenantbeheerder moet iedere toegang expliciet goedkeuren; toegang verloopt automatisch." action={<AdminActionDrawer description="Leg concreet vast welk probleem je onderzoekt. De tenantbeheerder ziet deze reden vóór goedkeuring." icon={<Plus className="size-4" />} title="Toegang aanvragen" triggerLabel="Aanvraag" width="wide"><form action={requestSupportAccessAction} className="space-y-4"><SelectField label="Organisatie" name="tenantId" required><option value="">Kies organisatie</option>{data.tenants.filter((row) => row.status === "active").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</SelectField><TextAreaField label="Concrete supportreden" name="reason" required maxLength={1000} /><SelectField defaultValue="60" label="Maximale duur" name="duration"><option value="15">15 minuten</option><option value="30">30 minuten</option><option value="60">60 minuten</option><option value="120">120 minuten</option></SelectField><SubmitButton>Ter goedkeuring versturen</SubmitButton></form></AdminActionDrawer>} />
    <RouteFeedback error={getParam(params, "error") ? "De supportaanvraag kon niet veilig worden verwerkt." : null} success={getParam(params, "saved") ? "Aanvraag vastgelegd; de tenantbeheerder moet deze nog goedkeuren." : null} />
    <div className="grid gap-3 sm:grid-cols-3"><AdminMetricCard icon={Clock3} label="Wacht op tenant" tone={pending.length ? "warning" : "success"} value={pending.length} /><AdminMetricCard icon={Eye} label="Actieve vensters" tone={active.length ? "info" : "neutral"} value={active.length} /><AdminMetricCard icon={LockKeyhole} label="Scope" tone="success" value="read-only" /></div>
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary"><LifeBuoy className="size-5" /></span><div><h2 className="text-lg font-bold">Toegangshistorie</h2><p className="text-sm text-muted-foreground">Alleen de aanvrager kan een goedgekeurd diagnosevenster openen.</p></div></div><div className="mt-5 grid gap-3">{data.grants.length ? data.grants.map((grant) => <article className="rounded-xl border border-border bg-muted/20 p-4" key={grant.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{tenantNames.get(grant.tenant_id) ?? "Organisatie"}</p><p className="mt-1 text-xs text-muted-foreground">Aangevraagd door {data.people[grant.requested_by_user_id] ?? "Platformmedewerker"} · {formatDateTime(grant.requested_at)}</p></div><StatusPill tone={statusTone(grant.status)}>{statusLabel(grant.status)}</StatusPill></div><p className="mt-3 text-sm leading-6 text-muted-foreground">{grant.reason}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-muted-foreground"><span>{grant.duration_minutes} min · alleen diagnostiek</span>{grant.status === "active" && grant.requested_by_user_id === data.currentUserId ? <Link className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-primary-foreground" href={`/platform/support/${grant.tenant_id}`}>Diagnose openen</Link> : null}</div></article>) : <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nog geen supporttoegang aangevraagd.</p>}</div></section>
  </div>;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusLabel(value: string) { return ({ active: "Actief", denied: "Afgewezen", expired: "Verlopen", requested: "Wacht op goedkeuring", revoked: "Ingetrokken" } as Record<string, string>)[value] ?? value; }
function statusTone(value: string) { return value === "active" ? "info" as const : value === "requested" ? "warning" as const : value === "denied" || value === "revoked" ? "danger" as const : "neutral" as const; }
