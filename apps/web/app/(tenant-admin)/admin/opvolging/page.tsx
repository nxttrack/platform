import { CheckCircle2, Mail, Phone, Sparkles, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { EmptyState } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { completeCrmFollowUpAction, createCrmFollowUpTaskAction, saveCrmDraftAction } from "@/lib/domain/crm-follow-up-actions";
import { generateCrmFollowUpItems } from "@/lib/domain/crm-follow-up";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminFollowUpPage({ searchParams }: PageProps) {
  const context = await requirePrivateShellContext("/admin/opvolging");
  const tenant = getActiveTenant(context);
  const params = (await searchParams) ?? {};
  const intakeFilter = getParam(params, "intake");
  const items = await generateCrmFollowUpItems(tenant.id);
  const visible = intakeFilter ? items.filter((item) => item.intake_submission_id === intakeFilter) : items;
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader kicker="Communicatie" title="Opvolgen" subtitle="Rule-based CRM-signalen met bronbewijs en een bewerkbaar concept. NXTTRACK verstuurt hier nooit automatisch." />
      <RouteFeedback success={saved ? `Opvolgactie opgeslagen: ${saved}.` : null} error={error ? `Opvolgactie niet uitgevoerd: ${error}.` : null} />
      <div className="grid gap-3 sm:grid-cols-3">
        <AdminMetricCard icon={UserRoundCheck} label="Open opvolging" tone={items.length ? "warning" : "success"} value={items.length} />
        <AdminMetricCard icon={Sparkles} label="Hoge leadscore" tone="info" value={items.filter((item) => item.leadScoreBand === "high").length} />
        <AdminMetricCard icon={Mail} label="Concepten" value={items.filter((item) => item.draft_body).length} />
      </div>
      {intakeFilter ? <Link className="inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline" href="/admin/opvolging">Toon alle opvolgsignalen</Link> : null}
      <AdminListSurface>
        {visible.length === 0 ? (
          <EmptyState>Geen live lead of ouder vraagt nu om opvolging. Journey Bot-data is bewust uitgesloten.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {visible.map((item) => (
              <article className="rounded-2xl border border-border bg-card p-4 shadow-soft" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold">{item.participantName}</h2>
                      <StatusPill tone={item.leadScoreBand === "high" ? "success" : "info"}>Leadscore {leadScoreLabel(item.leadScoreBand)}</StatusPill>
                      <StatusPill tone="warning">{signalLabel(item.signal_type)}</StatusPill>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.parentName} · {item.parentEmail}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.parentPhone ? <a className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-primary hover:bg-muted" href={`tel:${item.parentPhone}`}><Phone className="size-4" />Bel</a> : null}
                    <form action={createCrmFollowUpTaskAction}><input name="itemId" type="hidden" value={item.id} /><button className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" type="submit">Taak maken</button></form>
                    <ConfirmActionForm
                      action={completeCrmFollowUpAction}
                      confirmLabel="Markeer als gedaan"
                      description="Bevestig dit pas nadat de opvolging werkelijk buiten of binnen NXTTRACK is uitgevoerd. Het moment wordt als menselijk contact vastgelegd."
                      hiddenFields={{ itemId: item.id, humanConfirmation: "confirmed" }}
                      title="Opvolging afgerond?"
                      triggerLabel={<><CheckCircle2 className="size-4" />Markeer gedaan</>}
                    />
                  </div>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                  <section className="rounded-xl bg-muted/40 p-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Waarom nu</h3>
                    <p className="mt-3 text-sm font-semibold">{item.reason}</p>
                    <ul className="mt-3 grid gap-1 text-xs text-muted-foreground">{item.evidence_json.map((evidence) => <li key={evidence}>• {evidence}</li>)}</ul>
                    <p className="mt-4 text-sm text-primary">{item.suggested_action}</p>
                    {item.intake_submission_id ? <Link className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline" href={`/admin/intake?q=${encodeURIComponent(item.participantName)}`}>Open intakedossier</Link> : null}
                  </section>
                  <DirtyForm action={saveCrmDraftAction} className="grid gap-3 rounded-xl border border-border p-4">
                    <input name="itemId" type="hidden" value={item.id} />
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Conceptbericht — menselijke controle verplicht</h3>
                      <p className="mt-1 text-xs text-muted-foreground">Opslaan wijzigt alleen het concept; er wordt niets verzonden.</p>
                    </div>
                    <label className="grid gap-1.5 text-xs font-semibold">Onderwerp<input className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-normal" defaultValue={item.draft_subject ?? ""} maxLength={180} name="subject" required /></label>
                    <label className="grid gap-1.5 text-xs font-semibold">Bericht<textarea className="min-h-36 rounded-lg border border-border bg-background p-3 text-sm font-normal leading-6" defaultValue={item.draft_body ?? ""} maxLength={4000} name="body" required /></label>
                    <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" type="submit">Concept opslaan</button>
                  </DirtyForm>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminListSurface>
    </div>
  );
}

function signalLabel(value: string) {
  const labels: Record<string, string> = {
    intake_unfollowed: "Intake opvolgen",
    offer_unanswered: "Aanbod zonder reactie",
    trial_unfollowed: "Proefles opvolgen",
    placeable_uncontacted: "Plaatsbaar",
    payment_missing: "Betaling",
    parent_waiting: "Ouder wacht"
  };
  return labels[value] ?? value;
}

function leadScoreLabel(value: string) {
  return value === "high" ? "hoog" : value === "average" ? "gemiddeld" : value === "low" ? "laag" : value.replaceAll("_", " ");
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
