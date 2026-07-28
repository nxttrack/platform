import { BarChart3, HeartHandshake, MessageSquareText, Star } from "lucide-react";

import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createFeedbackCampaignAction, requestFeedbackAction } from "@/lib/domain/feedback-actions";
import { getFeedbackAdminData } from "@/lib/domain/feedback";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export const dynamic = "force-dynamic";

export default async function FeedbackAdminPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getFeedbackAdminData(), searchParams ?? Promise.resolve({})]);
  const campaigns = new Map(data.campaigns.map((row) => [row.id, row]));
  const participants = new Map(data.participants.map((row) => [row.id, row]));
  const requests = new Map(data.requests.map((row) => [row.id, row]));
  const activeCampaigns = data.campaigns.filter((row) => row.status === "active");

  return (
    <div className="space-y-5">
      <PageHeader
        kicker="Customer experience"
        title="Feedback & NPS"
        subtitle="Vraag op een passend moment om feedback, analyseer patronen en volg alleen op wanneer een ouder daar toestemming voor geeft."
      />
      <RouteFeedback
        error={errorMessage(getParam(params, "error"))}
        success={successMessage(getParam(params, "saved"))}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={Star} label="Gemiddelde score" tone="info" value={data.metrics.average ?? "—"} />
        <AdminMetricCard icon={HeartHandshake} label="Promotors (9–10)" tone="success" value={data.metrics.promoters} />
        <AdminMetricCard icon={MessageSquareText} label="Open verzoeken" tone={data.metrics.open ? "warning" : "success"} value={data.metrics.open} />
        <AdminMetricCard icon={BarChart3} label="Reacties" tone="neutral" value={data.metrics.responses} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <div className="mb-4">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Campagnes</p>
            <h2 className="mt-1 text-lg font-bold">Gerichte feedbackmomenten</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Nieuwe campagnes starten veilig als concept. Alleen actieve campagnes kunnen handmatig worden aangeboden.</p>
          </div>
          <form action={createFeedbackCampaignAction} className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Campagnenaam"><input className={inputClass} maxLength={120} name="name" placeholder="Eerste maand check-in" required /></Field>
              <Field label="Moment">
                <select className={inputClass} defaultValue="first_month" name="triggerType">
                  <option value="trial_completed">Na proefles</option>
                  <option value="first_month">Na eerste maand</option>
                  <option value="certificate_issued">Na diploma</option>
                  <option value="manual">Handmatig moment</option>
                </select>
              </Field>
            </div>
            <Field label="Hoofdvraag"><input className={inputClass} maxLength={240} name="prompt" placeholder="Hoe waarschijnlijk is het dat je onze zwemschool aanbeveelt?" required /></Field>
            <Field label="Open vervolgvraag"><input className={inputClass} maxLength={240} name="followUp" placeholder="Wat kunnen we volgens jou nog beter doen?" /></Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold"><input name="activate" type="checkbox" /> Direct activeren</label>
              <Button type="submit">Campagne opslaan</Button>
            </div>
          </form>
          <div className="mt-4 grid gap-3">
            {data.campaigns.length === 0 ? <Empty>Er zijn nog geen feedbackcampagnes.</Empty> : data.campaigns.map((campaign) => (
              <article className="rounded-xl border border-border bg-background p-4" key={campaign.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h3 className="font-bold">{campaign.name}</h3><p className="mt-1 text-sm text-muted-foreground">{campaign.prompt}</p></div>
                  <StatusPill tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}>{statusLabel(campaign.status)}</StatusPill>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{triggerLabel(campaign.trigger_type)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">Menselijk aanbieden</p>
          <h2 className="mt-1 text-lg font-bold">Feedbackverzoek klaarzetten</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Het verzoek verschijnt in het beveiligde ouderportaal. Er wordt niets automatisch verstuurd.</p>
          <form action={requestFeedbackAction} className="mt-4 grid gap-3">
            <Field label="Actieve campagne">
              <select className={inputClass} name="campaignId" required>
                <option value="">Kies campagne</option>
                {activeCampaigns.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </Field>
            <Field label="Leerling en ouder/verzorger">
              <select className={inputClass} name="participantId" required>
                <option value="">Kies leerling</option>
                {data.participants.map((row) => <option key={row.id} value={row.id}>{row.displayName} · {row.guardianName}</option>)}
              </select>
            </Field>
            <input name="humanConfirmation" type="hidden" value="confirmed" />
            <Button disabled={!activeCampaigns.length || !data.participants.length} type="submit">Verzoek klaarzetten</Button>
          </form>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="font-bold">Recente reacties</h3>
            <div className="mt-3 grid gap-3">
              {data.responses.length === 0 ? <Empty>Nog geen reacties ontvangen.</Empty> : data.responses.slice(0, 8).map((response) => {
                const request = requests.get(response.request_id);
                const participant = request ? participants.get(request.participant_id) : null;
                return (
                  <article className="rounded-xl border border-border bg-muted/20 p-4" key={response.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="font-bold">{participant?.displayName ?? "Leerling"}</p><p className="text-xs text-muted-foreground">{request ? campaigns.get(request.campaign_id)?.name : "Feedback"}</p></div>
                      <span className="grid size-10 place-items-center rounded-xl bg-primary text-lg font-black text-primary-foreground">{response.score}</span>
                    </div>
                    {response.comment ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{response.comment}</p> : null}
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">{response.follow_up_allowed ? "Persoonlijke opvolging toegestaan" : "Geen opvolgtoestemming"}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const inputClass = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className="grid gap-1.5 text-sm font-semibold">{label}{children}</label>; }
function Empty({ children }: { children: React.ReactNode }) { return <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>; }
function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function statusLabel(value: string) { return ({ active: "Actief", archived: "Gearchiveerd", draft: "Concept", paused: "Gepauzeerd" } as Record<string, string>)[value] ?? value; }
function triggerLabel(value: string) { return ({ trial_completed: "Na proefles", first_month: "Na eerste maand", certificate_issued: "Na diploma", manual: "Handmatig" } as Record<string, string>)[value] ?? value; }
function successMessage(value?: string) { return ({ campaign: "Feedbackcampagne opgeslagen.", request: "Feedbackverzoek veilig klaargezet in het ouderportaal." } as Record<string, string>)[value ?? ""] ?? null; }
function errorMessage(value?: string) { return ({ campaign: "De campagne kon niet worden opgeslagen.", confirmation: "Menselijke bevestiging ontbreekt.", request: "Het verzoek bestaat mogelijk al of kon niet worden opgeslagen.", selection: "Kies een actieve campagne en een echte leerling met ouderaccount.", forbidden: "Je hebt geen beheerrechten." } as Record<string, string>)[value ?? ""] ?? null; }
