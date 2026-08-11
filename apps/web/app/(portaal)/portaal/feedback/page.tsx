import { CheckCircle2, MessageSquareHeart, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { submitParentFeedbackAction } from "@/lib/domain/feedback-actions";
import { getParentFeedbackData } from "@/lib/domain/feedback";
import { getSelectedParticipantId, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { resolveCurrentParentPortalTheme } from "@/lib/theme/portal-theme-server";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";

type PageProps = { searchParams?: Promise<ParentPortalSearchParams> };

export const dynamic = "force-dynamic";

export default async function ParentFeedbackPage({ searchParams }: PageProps) {
  const [data, params, portalTheme] = await Promise.all([
    getParentFeedbackData(),
    searchParams ?? Promise.resolve({}),
    resolveCurrentParentPortalTheme("/portaal/feedback")
  ]);
  const campaigns = new Map((data.campaigns as Array<{ id: string; name: string; prompt: string; follow_up_question: string | null }>).map((row) => [row.id, row]));
  const participants = new Map((data.participants as Array<{ id: string; display_name: string }>).map((row) => [row.id, row.display_name]));
  const responses = new Map((data.responses as Array<{ request_id: string; score: number; submitted_at: string }>).map((row) => [row.request_id, row]));
  const selectedParticipantId = getSelectedParticipantId(params, [...participants.keys()]);
  const visibleRequests = data.requests.filter((row) => !selectedParticipantId || row.participant_id === selectedParticipantId);
  const open = visibleRequests.filter((row) => row.status === "open" && new Date(row.expires_at).getTime() > Date.now());
  const terminology = getPortalTerminology(portalTheme.manifest);

  return (
    <div className="space-y-5">
      <PageHeader kicker="Jouw stem" title="Feedback" subtitle={`Help je ${terminology.organization} met een korte, veilige beoordeling. Jij bepaalt of er persoonlijk contact mag volgen.`} />
      <RouteFeedback error={errorMessage(getParam(params, "error"))} success={getParam(params, "saved") ? "Dank je wel—je feedback is veilig ontvangen." : null} />
      <section className="overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-cyan-50 p-5 shadow-card">
        <div className="flex items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground"><MessageSquareHeart className="size-5" /></span><div><h2 className="text-lg font-bold">Klein moment, waardevol inzicht</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Scores worden alleen binnen jouw {terminology.organization} gebruikt. Vrije tekst wordt als persoonsgegevens behandeld en nooit openbaar gemaakt.</p></div></div>
      </section>
      <div className="grid gap-4">
        {open.length === 0 ? <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft"><CheckCircle2 className="mx-auto size-8 text-success" /><h2 className="mt-3 font-bold">Je bent helemaal bij</h2><p className="mt-1 text-sm text-muted-foreground">Er staan geen open feedbackvragen klaar.</p></div> : open.map((request) => {
          const campaign = campaigns.get(request.campaign_id);
          return (
            <form action={submitParentFeedbackAction} className="rounded-2xl border border-border bg-card p-5 shadow-card" key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">{participants.get(request.participant_id) ?? "Jouw kind"}</p><h2 className="mt-1 text-xl font-bold">{campaign?.name ?? "Korte evaluatie"}</h2></div><StatusPill tone="info">± 1 minuut</StatusPill></div>
              <p className="mt-5 text-base font-semibold">{campaign?.prompt ?? "Hoe waarschijnlijk is het dat je ons aanbeveelt?"}</p>
              <fieldset className="mt-3"><legend className="sr-only">Score van nul tot tien</legend><div className="grid grid-cols-6 gap-2 sm:grid-cols-11">{Array.from({ length: 11 }, (_, score) => <label className="group cursor-pointer" key={score}><input className="peer sr-only" name="score" required type="radio" value={score} /><span className="grid h-11 place-items-center rounded-xl border border-border bg-background text-sm font-bold transition peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{score}</span></label>)}</div><div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Niet waarschijnlijk</span><span>Zeer waarschijnlijk</span></div></fieldset>
              <label className="mt-5 grid gap-1.5 text-sm font-semibold">{campaign?.follow_up_question ?? "Wil je nog iets met ons delen?"}<textarea className="min-h-28 rounded-xl border border-input bg-background p-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" maxLength={2000} name="comment" placeholder="Optioneel" /></label>
              <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm"><input className="mt-1" name="followUpAllowed" type="checkbox" /><span><strong>De {terminology.organization} mag persoonlijk opvolgen</strong><br /><span className="text-muted-foreground">Zonder dit vinkje blijft je reactie alleen onderdeel van de analyse.</span></span></label>
              <input name="requestId" type="hidden" value={request.id} />
              <Button className="mt-4 w-full sm:w-auto" type="submit">Feedback veilig versturen</Button>
            </form>
          );
        })}
        {visibleRequests.filter((row) => row.status === "completed").slice(0, 3).map((request) => <article className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-4" key={request.id}><div className="flex items-center gap-3"><ShieldCheck className="size-5 text-success" /><div><p className="font-semibold">{campaigns.get(request.campaign_id)?.name ?? "Feedback"}</p><p className="text-xs text-muted-foreground">Veilig ontvangen</p></div></div><StatusPill tone="success">score {responses.get(request.id)?.score ?? "—"}</StatusPill></article>)}
      </div>
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) { const value = params[key]; return Array.isArray(value) ? value[0] : value; }
function errorMessage(value?: string) { return ({ score: "Kies een score tussen 0 en 10.", request: "Deze feedbackvraag is niet meer beschikbaar.", save: "Je feedback kon niet veilig worden opgeslagen.", sensitive: "Plaats geen wachtwoorden, bankgegevens of andere geheime gegevens in je reactie." } as Record<string, string>)[value ?? ""] ?? null; }
