import { CalendarDays, CheckCircle2, Clock, Mail, RefreshCcw, Users } from "lucide-react";
import Link from "next/link";

import { AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { AdminSection, DataList, EmptyState } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { decideCatchUpRequestAction } from "@/lib/domain/planning-actions";
import { getPlanningData } from "@/lib/domain/planning";
import { findMakeupMarketplaceMatches } from "@/lib/domain/makeup-marketplace";
import {
  bookMakeupMarketplaceDirectAction,
  ignoreMakeupMarketplaceMatchAction,
  inviteMakeupMarketplaceParentAction
} from "@/lib/domain/makeup-marketplace-actions";
import { cn } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminMakeupMarketplacePage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getPlanningData(), searchParams ?? Promise.resolve({})]);
  const selectedSessionId = getParam(params, "sessie");
  const marketplace = selectedSessionId
    ? await findMakeupMarketplaceMatches({ tenantId: data.tenant.id, sessionId: selectedSessionId })
    : null;
  const pendingCatchUps = data.catchUpRequests.filter((request) => request.status === "requested");
  const sessionInsightById = new Map(data.sessionInsights.map((insight) => [insight.session.id, insight]));
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const availableSessions = data.sessionInsights
    .filter((insight) =>
      new Date(insight.session.starts_at).getTime() > Date.now() &&
      insight.available > 0 &&
      ["draft", "scheduled"].includes(insight.session.status)
    )
    .slice(0, 18);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-5">
      <PageHeader
        action={<Link className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted" href="/admin/agenda">Terug naar planbord</Link>}
        kicker="Planning"
        title="Inhaalmarkt"
        subtitle="Behandel open verzoeken en match vrijgekomen lescapaciteit met geldige inhaalcredits. Uitnodigen en boeken blijven altijd menselijke keuzes."
      />
      <RouteFeedback
        error={error ? marketplaceError(error) : null}
        success={saved ? marketplaceSuccess(saved) : null}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <AdminMetricCard icon={Clock} label="Open verzoeken" tone={pendingCatchUps.length ? "warning" : "success"} value={pendingCatchUps.length} />
        <AdminMetricCard icon={CalendarDays} label="Lessen met flexplek" tone="info" value={availableSessions.length} />
        <AdminMetricCard icon={Users} label="Matches geselecteerde les" tone={marketplace?.matches.length ? "success" : "neutral"} value={marketplace?.matches.length ?? 0} />
      </div>

      <AdminListSurface>
        <div className="mb-3">
          <h2 className="text-base font-bold">Kies een les met vrije capaciteit</h2>
          <p className="text-[13px] text-muted-foreground">Alleen toekomstige lessen met ten minste één aantoonbare flexplek worden aangeboden.</p>
        </div>
        {availableSessions.length === 0 ? (
          <EmptyState>Er zijn momenteel geen toekomstige lessen met vrije flexcapaciteit.</EmptyState>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {availableSessions.map((insight) => (
              <Link
                aria-current={selectedSessionId === insight.session.id ? "page" : undefined}
                className={cn(
                  "rounded-xl border p-3 transition hover:border-primary/30 hover:bg-primary/5",
                  selectedSessionId === insight.session.id ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "border-border bg-card"
                )}
                href={`/admin/inhaalmarkt?sessie=${insight.session.id}`}
                key={insight.session.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{insight.group?.name ?? "Lesgroep"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(insight.session.starts_at)}</p>
                  </div>
                  <StatusPill tone="success">{formatNumber(insight.available)} vrij</StatusPill>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground">{insight.resourceName} · {insight.instructorNames.join(", ") || "geen instructeur"}</p>
              </Link>
            ))}
          </div>
        )}
      </AdminListSurface>

      <AdminSection
        title="Slimme marktplaatsmatches"
        description="Programma, niveau, sessiedatum, creditstatus en actuele capaciteit worden opnieuw gecontroleerd bij iedere mutatie."
      >
        {!selectedSessionId ? (
          <EmptyState>Kies hierboven een les om verklaarbare matches te bekijken.</EmptyState>
        ) : !marketplace ? (
          <EmptyState>Deze sessie is niet beschikbaar voor de inhaalmarkt.</EmptyState>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <div>
                <p className="font-bold">{marketplace.session.groupName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(marketplace.session.startsAt)} · effectief {marketplace.session.effectiveUsed}/{marketplace.session.capacity} bezet</p>
              </div>
              <StatusPill tone={marketplace.session.available > 0 ? "success" : "warning"}>{marketplace.session.available > 0 ? "Plek beschikbaar" : "Geen vrije flexplek"}</StatusPill>
            </div>
            {marketplace.matches.length === 0 ? (
              <EmptyState>Geen geldige credit met passend programma, niveau, sessiedatum en beschikbare flexplek.</EmptyState>
            ) : (
              <div className="grid gap-3">
                {marketplace.matches.map((match) => {
                  const decision = marketplace.decisions.find((item) => item.creditId === match.credit_id);
                  const inactive = decision?.status === "ignored" || decision?.status === "booked";
                  return (
                    <article className="rounded-xl border border-border bg-card p-4" key={match.credit_id}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-bold">{match.participant_name}</p>
                            {match.expires_soon ? <StatusPill tone="warning">Credit verloopt snel</StatusPill> : null}
                            {match.is_test ? <StatusPill tone="info">Journey Bot · intern</StatusPill> : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">Matchscore {match.score}/100 · {Math.round(match.confidence * 100)}% confidence</p>
                        </div>
                        <StatusPill tone={decision?.status === "booked" ? "success" : decision?.status === "ignored" ? "neutral" : decision?.status === "invited" ? "info" : "success"}>{decision?.status ?? match.suggested_action.replaceAll("_", " ")}</StatusPill>
                      </div>
                      <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
                        {match.reasons.map((reason) => <li key={`${match.credit_id}:${reason.label}`}><span className="font-semibold text-foreground">{reason.label}</span> — {reason.explanation} ({reason.evidence})</li>)}
                      </ul>
                      {!inactive ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {!match.is_test && match.notification_allowed && match.guardian_user_id ? (
                            <ConfirmActionForm
                              action={inviteMakeupMarketplaceParentAction}
                              confirmLabel="Uitnodiging versturen"
                              description="Er wordt een in-app bericht gemaakt. E-mail wordt alleen verzonden wanneer de communicatievoorkeur dit toestaat. De ouder boekt daarna zelf."
                              hiddenFields={{ sessionId: marketplace.session.id, creditId: match.credit_id, humanConfirmation: "confirmed" }}
                              title={`Nodig ouder van ${match.participant_name} uit?`}
                              triggerLabel={<><Mail className="size-4" />Nodig ouder uit</>}
                            />
                          ) : null}
                          {!match.is_test ? (
                            <ConfirmActionForm
                              action={bookMakeupMarketplaceDirectAction}
                              confirmLabel="Direct boeken"
                              description="Gebruik dit alleen na bevestigde oudertoestemming. Credit, niveau en actuele sessiecapaciteit worden transactioneel opnieuw gecontroleerd."
                              hiddenFields={{ sessionId: marketplace.session.id, creditId: match.credit_id, humanConfirmation: "confirmed" }}
                              title={`Boek ${match.participant_name} direct?`}
                              triggerLabel={<><RefreshCcw className="size-4" />Boek direct</>}
                              triggerVariant="destructive"
                            />
                          ) : null}
                          <ConfirmActionForm
                            action={ignoreMakeupMarketplaceMatchAction}
                            confirmLabel="Match negeren"
                            description="De match wordt alleen voor deze credit en sessie genegeerd en blijft in de audit zichtbaar."
                            hiddenFields={{ sessionId: marketplace.session.id, creditId: match.credit_id, humanConfirmation: "confirmed" }}
                            title="Deze match negeren?"
                            triggerLabel="Negeer"
                            triggerVariant="outline"
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </AdminSection>

      <AdminSection title="Open inhaalverzoeken" description="Zet een expliciet ouderverzoek pas om naar een les nadat capaciteit, credit en niveau opnieuw zijn gecontroleerd.">
        {pendingCatchUps.length === 0 ? (
          <EmptyState>Geen open inhaalverzoeken.</EmptyState>
        ) : (
          <DataList>
            {pendingCatchUps.map((request) => {
              const insight = sessionInsightById.get(request.preferred_session_id);
              const participant = participantById.get(request.participant_id);
              return (
                <div className="grid gap-3 px-3 py-3" key={request.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-foreground">{participant?.display_name ?? "Leerling"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {insight ? `${formatDateTime(insight.session.starts_at)} · ${insight.group?.name ?? "Lesgroep"} · ${formatNumber(insight.available)} vrij` : "Sessie niet gevonden"}
                      </p>
                    </div>
                    <StatusPill tone={insight && insight.available > 0 ? "success" : "danger"}>{insight ? insight.status : "ontbreekt"}</StatusPill>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <ConfirmActionForm
                      action={decideCatchUpRequestAction}
                      className="flex flex-wrap items-end gap-2"
                      confirmLabel="Inhaalplek goedkeuren"
                      description="Capaciteit, credit, programma en niveau worden opnieuw transactioneel gecontroleerd. De credit blijft gereserveerd tot aanwezigheid is vastgelegd."
                      hiddenFields={{ requestId: request.id, decision: "approved", humanConfirmation: "confirmed" }}
                      title="Inhaalplek definitief goedkeuren?"
                      triggerLabel={<><CheckCircle2 className="h-4 w-4" />Goedkeuren</>}
                    >
                      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                        <span>Notitie bij goedkeuring</span>
                        <input className="block h-9 w-56 rounded-lg border border-border bg-white px-3 text-sm font-normal text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" name="adminNotes" placeholder="Optioneel" />
                      </label>
                    </ConfirmActionForm>
                    <ConfirmActionForm
                      action={decideCatchUpRequestAction}
                      confirmLabel="Aanvraag afwijzen"
                      description="De aanvraag wordt afgewezen en de inhaalcredit komt opnieuw beschikbaar voor een ander passend moment."
                      hiddenFields={{ requestId: request.id, decision: "declined", humanConfirmation: "confirmed" }}
                      title="Inhaalverzoek afwijzen?"
                      triggerLabel="Afwijzen"
                      triggerVariant="outline"
                    />
                  </div>
                </div>
              );
            })}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function marketplaceSuccess(value: string) {
  const labels: Record<string, string> = {
    "catchup-approved": "Inhaalverzoek goedgekeurd.",
    "catchup-declined": "Inhaalverzoek afgewezen.",
    "marketplace-booked": "Inhaalles geboekt.",
    "marketplace-ignored": "Match genegeerd.",
    "marketplace-invited": "Ouder uitgenodigd."
  };
  return labels[value] ?? "Inhaalmarkt bijgewerkt.";
}

function marketplaceError(value: string) {
  const labels: Record<string, string> = {
    booking: "Boeking is niet gelukt; capaciteit en credit zijn niet gewijzigd.",
    capacity: "Er is geen geldige capaciteit meer voor deze inhaalles.",
    communication_preference: "De ouder heeft dit communicatiekanaal uitgeschakeld.",
    confirmation: "Bevestig de actie eerst expliciet.",
    invite: "De uitnodiging kon niet worden vastgelegd.",
    invite_not_allowed: "Deze match mag niet worden uitgenodigd.",
    match: "De match is niet meer geldig.",
    notification: "De uitnodiging is niet verzonden.",
    ignore: "De match kon niet worden genegeerd."
  };
  return labels[value] ?? `De actie is niet gelukt: ${value}.`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
