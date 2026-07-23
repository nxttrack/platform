import { Bot, Pause, Play, Workflow } from "lucide-react";

import { AdminSection, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAutomationRuleAction, setAutomationRuleStatusAction } from "@/lib/domain/premium-operations-actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Rule = { action_key: string; event_key: string; id: string; last_run_at: string | null; name: string; run_count: number; status: string };

export default async function AutomationPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await requirePrivateShellContext("/admin/automatisering");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { data, error: loadError } = await admin.from("automation_rules").select("id, name, event_key, action_key, status, run_count, last_run_at").eq("tenant_id", tenant.id).neq("status", "archived").order("created_at", { ascending: false });
  if (loadError) throw new Error(`Could not load automation rules: ${loadError.message}`);
  const rules = (data ?? []) as Rule[];
  const params = (await searchParams) ?? {};

  return <div className="space-y-6"><PageHeader kicker="Premium operations" title="Automation builder" subtitle="Bouw expliciete als-dit-dan-dat workflows. Uitvoering gebruikt per run een idempotency key." />
    {getParam(params, "saved") ? <Feedback ok>Automatisering opgeslagen.</Feedback> : null}{getParam(params, "error") ? <Feedback>Automatisering kon niet worden opgeslagen.</Feedback> : null}
    <div className="grid gap-4 md:grid-cols-3"><Metric label="Regels" value={rules.length} /><Metric label="Actief" value={rules.filter((rule) => rule.status === "active").length} /><Metric label="Uitvoeringen" value={rules.reduce((total, rule) => total + rule.run_count, 0)} /></div>
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <AdminSection title="Nieuwe regel" description="Start klein: één gebeurtenis, één actie en een duidelijke boodschap."><form action={createAutomationRuleAction} className="grid gap-4"><Field label="Naam" name="name" placeholder="No-show opvolging" required /><SelectField label="Als dit gebeurt" name="eventKey" required><option value="no_show">No-show geregistreerd</option><option value="birthday">Verjaardag</option><option value="milestone">Mijlpaal behaald</option><option value="offer_expiring">Aanbod verloopt bijna</option><option value="payment_failed">Betaling mislukt</option><option value="long_absence">Lange afwezigheid</option><option value="graduation_ready">Klaar voor afzwemmen</option></SelectField><SelectField label="Doe dan dit" name="actionKey" required><option value="send_email">E-mail versturen</option><option value="create_task">Taak aanmaken</option><option value="notify_parent">Ouder notificeren</option><option value="notify_admin">Admin notificeren</option><option value="add_tag">Label toevoegen</option></SelectField><TextAreaField label="Bericht of instructie" name="message" /><label className="flex min-h-11 items-center gap-3 rounded-xl border border-border px-3 text-sm font-semibold"><input className="size-4" name="active" type="checkbox" />Direct activeren</label><SubmitButton>Regel opslaan</SubmitButton></form></AdminSection>
      <AdminSection title="Workflowregels" description="Pauzeren is omkeerbaar; archiveren haalt de regel uit dit overzicht.">{rules.length ? <div className="grid gap-3">{rules.map((rule) => <article className="rounded-2xl border border-border p-4" key={rule.id}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Workflow className="size-5" /></span><div><h3 className="font-bold text-foreground">{rule.name}</h3><p className="mt-1 text-sm text-muted-foreground">{eventLabel(rule.event_key)} → {actionLabel(rule.action_key)}</p></div></div><StatusPill tone={rule.status === "active" ? "success" : rule.status === "paused" ? "warning" : "neutral"}>{rule.status}</StatusPill></div><div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3"><p className="mr-auto text-xs text-muted-foreground">{rule.run_count} runs{rule.last_run_at ? ` · laatst ${formatDate(rule.last_run_at)}` : " · nog niet uitgevoerd"}</p><form action={setAutomationRuleStatusAction}><input name="ruleId" type="hidden" value={rule.id} /><input name="status" type="hidden" value={rule.status === "active" ? "paused" : "active"} /><button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" type="submit">{rule.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}{rule.status === "active" ? "Pauzeren" : "Activeren"}</button></form></div></article>)}</div> : <EmptyState><Bot className="mb-2 size-5 text-primary" />Nog geen automatiseringsregels.</EmptyState>}</AdminSection>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border border-border bg-card p-4 shadow-soft"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold text-foreground">{value}</p></div>; }
function Feedback({ children, ok = false }: { children: string; ok?: boolean }) { return <p className={`rounded-xl border px-3 py-2 text-sm font-semibold ${ok ? "border-success/20 bg-success/10 text-success" : "border-danger/20 bg-danger/10 text-danger"}`}>{children}</p>; }
function eventLabel(value: string) { return ({ no_show: "No-show", birthday: "Verjaardag", milestone: "Mijlpaal", offer_expiring: "Aanbod verloopt", payment_failed: "Betaling mislukt", long_absence: "Lange afwezigheid", graduation_ready: "Klaar voor afzwemmen" } as Record<string, string>)[value] ?? value; }
function actionLabel(value: string) { return ({ send_email: "E-mail", create_task: "Taak", notify_parent: "Oudermelding", notify_admin: "Adminmelding", add_tag: "Label" } as Record<string, string>)[value] ?? value; }
function formatDate(value: string) { return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
