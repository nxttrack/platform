import { randomUUID } from "node:crypto";
import { ArrowRight, CalendarCheck, CalendarX, CheckCircle2, Clock, CreditCard, GraduationCap, MapPin, RefreshCcw, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SelectField } from "@/components/admin/domain-ui";
import { ParentSectionNav } from "@/components/parent/parent-section-nav";
import { WaitTimeChip } from "@/components/public/wait-time-chip";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { ConfirmActionForm } from "@/components/ui/confirm-action-form";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getParentCatchUpData } from "@/lib/domain/catch-up";
import { cancelLessonAction, requestCatchUpSessionAction, respondGraduationInviteAction } from "@/lib/domain/parent-portal-actions";
import { canCancelSession, canParentMutateParticipant, formatLessonDate, getParentPortalData } from "@/lib/domain/parent-portal";
import { getSelectedParticipantId, participantContextHref, type ParentPortalSearchParams } from "@/lib/domain/parent-portal-selection";
import { reserveTemporaryOfferingAction } from "@/lib/domain/temporary-offering-actions";
import { calculateOfferingDisplayPrice, loadParentTemporaryOfferings } from "@/lib/domain/temporary-offerings";
import type { SessionRow } from "@/lib/domain/core";

type PageProps = { searchParams?: Promise<ParentPortalSearchParams> };

export const dynamic = "force-dynamic";

export default async function ParentLessonsPage({ searchParams }: PageProps) {
  const [data, catchUpData] = await Promise.all([getParentPortalData(), getParentCatchUpData()]);
  const params = (await searchParams) ?? {};
  const selectedParticipantId = getSelectedParticipantId(params, data.participants.map((participant) => participant.id));
  const visibleParticipantIds = new Set(selectedParticipantId ? [selectedParticipantId] : data.participants.map((participant) => participant.id));
  const visibleEnrollments = data.enrollments.filter((enrollment) => visibleParticipantIds.has(enrollment.participant_id));
  const temporaryOfferings = await loadParentTemporaryOfferings({
    enrollmentIds: visibleEnrollments.map((enrollment) => enrollment.id),
    participantIds: [...visibleParticipantIds],
    tenantId: data.tenant.id
  });
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const cancellationBySessionParticipant = new Map(data.cancellations.map((cancellation) => [`${cancellation.session_id}:${cancellation.participant_id}`, cancellation]));
  const visibleCredits = catchUpData.credits.filter((credit) => visibleParticipantIds.has(credit.participant_id));
  const visibleGraduationInvites = data.graduationParticipants.filter((invite) =>
    visibleParticipantIds.has(invite.participant_id) && ["sent", "confirmed", "declined"].includes(invite.invite_status)
  );
  const eventById = new Map(data.graduationEvents.map((event) => [event.id, event]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const lessonItems = data.sessions
    .flatMap((session) =>
      data.groupMemberships
        .filter((membership) => visibleParticipantIds.has(membership.participant_id) && membership.group_id === session.group_id && (membership.status === "active" || membership.status === "trial"))
        .map((membership) => ({ session, membership }))
    )
    .sort((a, b) => new Date(a.session.starts_at).getTime() - new Date(b.session.starts_at).getTime());

  return (
    <div className="space-y-6">
      <PageHeader kicker="Lessen, inhalen en afzwemmen" title="Planning" subtitle={`Alles rond de planning op één plek. Annuleren kan tot ${data.settings.lesson_cancellation_cutoff_hours} uur vooraf met automatische inhaalcredit.`} />
      <Feedback saved={saved} error={error} />
      <ParentSectionNav
        items={[
          { active: true, href: participantContextHref("/portaal/planning#lessen", selectedParticipantId), label: "Lessen" },
          { href: participantContextHref("/portaal/planning#inhalen", selectedParticipantId), label: "Inhalen" },
          { href: participantContextHref("/portaal/planning#afzwemmen", selectedParticipantId), label: "Afzwemmen" },
          { href: participantContextHref("/portaal/planning#aanbod", selectedParticipantId), label: "Vakantieaanbod" }
        ]}
        label="Planning onderdelen"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Clock className="h-5 w-5" />} label="Komende lessen" value={lessonItems.filter((item) => new Date(item.session.starts_at).getTime() >= Date.now()).length} />
        <Metric icon={<RefreshCcw className="h-5 w-5" />} label="Inhaalcredits" value={visibleCredits.filter((credit) => credit.status === "available").length} />
        <Metric icon={<GraduationCap className="h-5 w-5" />} label="Afzwemuitnodigingen" value={visibleGraduationInvites.filter((invite) => invite.invite_status === "sent").length} />
      </div>

      <div className="flex flex-col gap-6">
      <section className="order-4 scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-soft" id="aanbod">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Vakantie- en turboaanbod</h2>
            <p className="mt-1 text-sm text-muted-foreground">Tijdelijke cursussen met een echte capaciteitsreservering en veilige betaling.</p>
          </div>
          <StatusPill tone={temporaryOfferings.offerings.length ? "info" : "neutral"}>{temporaryOfferings.offerings.length} beschikbaar</StatusPill>
        </div>
        {temporaryOfferings.offerings.length === 0 ? (
          <EmptyState>Er staat nu geen passend vakantie- of turboaanbod open.</EmptyState>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {temporaryOfferings.offerings.map((offering) => {
              const group = temporaryOfferings.groups.find((item) => item.id === offering.group_id);
              const occurrences = temporaryOfferings.sessions.filter((session) => session.group_id === offering.group_id);
              const eligibleEnrollments = visibleEnrollments.filter((enrollment) => enrollment.program_id === group?.program_id && ["active", "paused"].includes(enrollment.status));
              const registrations = temporaryOfferings.registrations.filter((registration) => registration.offering_id === offering.id);
              const totalPrice = calculateOfferingDisplayPrice(offering, occurrences.length);

              return (
                <article className="rounded-xl border border-border bg-background p-4" key={offering.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-primary">{group?.offering_type?.replaceAll("_", " ") ?? "Tijdelijk aanbod"}</p>
                      <h3 className="mt-1 text-lg font-bold text-foreground">{offering.title}</h3>
                      {offering.description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{offering.description}</p> : null}
                    </div>
                    <StatusPill tone={offering.pricing_model === "free" ? "success" : "info"}>
                      {offering.pricing_model === "free" ? "Gratis" : formatCurrency(totalPrice, offering.currency)}
                    </StatusPill>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <PlanningDetail icon={<CalendarCheck className="size-4" />} label="Lesmomenten" value={`${occurrences.length} lessen`} />
                    <PlanningDetail icon={<CreditCard className="size-4" />} label="Betaling" value={paymentModeLabel(offering.payment_mode)} />
                    {occurrences[0] ? <PlanningDetail icon={<Clock className="size-4" />} label="Eerste les" value={formatDateTime(occurrences[0].starts_at)} /> : null}
                    <PlanningDetail icon={<CheckCircle2 className="size-4" />} label="Voorwaarden" value={offering.terms_version} />
                  </div>
                  {eligibleEnrollments.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-muted-foreground">Dit aanbod sluit niet aan op een actieve inschrijving.</p>
                  ) : (
                    <div className="mt-4 grid gap-3">
                      {eligibleEnrollments.map((enrollment) => {
                        const participant = participantById.get(enrollment.participant_id);
                        const registration = registrations.find((item) => item.enrollment_id === enrollment.id);

                        return (
                          <div className="rounded-lg border border-border bg-muted/20 p-3" key={enrollment.id}>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-bold text-foreground">{participant?.display_name ?? "Kind"}</p>
                              {registration ? <StatusPill tone={registration.status === "confirmed" ? "success" : registration.status === "payment_review" ? "danger" : "warning"}>{registrationStatusLabel(registration.status)}</StatusPill> : null}
                            </div>
                            {registration?.hold_expires_at ? <p className="mt-1 text-xs text-muted-foreground">Plaats gereserveerd tot {formatDateTime(registration.hold_expires_at)}.</p> : null}
                            {!registration && canParentMutateParticipant(data, enrollment.participant_id) ? (
                              <form action={reserveTemporaryOfferingAction} className="mt-3 grid gap-3">
                                <input name="offeringId" type="hidden" value={offering.id} />
                                <input name="enrollmentId" type="hidden" value={enrollment.id} />
                                <input name="idempotencyKey" type="hidden" value={randomUUID()} />
                                <SelectField label="Plaatssoort" name="capacityBucket">
                                  <option value="regular">Reguliere plaats</option>
                                  <option value="flex">Flexplaats</option>
                                  <option value="trial">Proefplaats</option>
                                </SelectField>
                                <label className="flex min-h-11 items-start gap-3 rounded-lg border border-border bg-background p-3 text-xs leading-5 text-muted-foreground">
                                  <input className="mt-0.5 size-4" name="termsAccepted" required type="checkbox" value="accepted" />
                                  Ik accepteer voorwaardenversie {offering.terms_version} en begrijp dat een betaalde plaats pas definitief is na geverifieerde betaling.
                                </label>
                                <button className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground" type="submit">
                                  {offering.payment_mode === "direct_mollie" ? "Reserveer en betaal via Mollie" : offering.payment_mode === "free" ? "Definitief inschrijven" : "Plaats reserveren"}
                                </button>
                              </form>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="order-2 scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-soft" id="inhalen">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Inhaalles kiezen</h2>
            <p className="mt-1 text-sm text-muted-foreground">Zet een beschikbare credit om naar een concrete inhaalles.</p>
          </div>
          <StatusPill tone={catchUpData.options.length > 0 ? "success" : "neutral"}>{catchUpData.options.length} opties</StatusPill>
        </div>
        {visibleCredits.length === 0 ? (
          <EmptyState>Je hebt nog geen beschikbare inhaalcredits.</EmptyState>
        ) : (
          <div className="space-y-3">
            {visibleCredits.map((credit) => {
              const participant = participantById.get(credit.participant_id);
              const request = catchUpData.requests.find((item) => item.credit_id === credit.id && (item.status === "requested" || item.status === "approved"));
              const options = catchUpData.options.filter((option) => option.creditId === credit.id).slice(0, 4);
              const canMutate = canParentMutateParticipant(data, credit.participant_id);

              return (
                <article className="rounded-lg border border-border bg-white p-4" key={credit.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 font-bold text-foreground">Inhaalcredit</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Geldig tot {credit.expires_on ? formatDate(credit.expires_on) : "geen einddatum"}.</p>
                    </div>
                    <StatusPill tone={credit.status === "available" ? "success" : "warning"}>{request?.status ?? credit.status}</StatusPill>
                  </div>
                  {!canMutate ? (
                    <p className="mt-3 text-sm font-semibold text-muted-foreground">Alleen-lezen toegang: een primaire of secundaire verzorger kan deze credit gebruiken.</p>
                  ) : request ? (
                    <p className="mt-3 text-sm font-semibold text-muted-foreground">Aanvraag ingediend. Status: {request.status}.</p>
                  ) : options.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Geen passende les met vrije capaciteit binnen de boekingsperiode.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {options.map((option) => (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3" key={`${credit.id}:${option.sessionId}`}>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{formatLessonDate(option.startsAt, option.endsAt)}</p>
                            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              {option.groupName} <WaitTimeChip band="short" />
                            </span>
                          </div>
                          <ConfirmActionForm
                            action={requestCatchUpSessionAction}
                            confirmLabel="Inhaalmoment bevestigen"
                            description="De geldigheid, het niveau en de actuele vrije plek worden bij bevestiging opnieuw transactioneel gecontroleerd. Afhankelijk van de zwemschool volgt directe boeking of adminbeoordeling."
                            hiddenFields={{ creditId: credit.id, sessionId: option.sessionId, next: participantContextHref("/portaal/planning", selectedParticipantId), humanConfirmation: "confirmed" }}
                            title="Dit inhaalmoment kiezen?"
                            triggerLabel={<><RefreshCcw className="h-4 w-4" />Kiezen<span className="sr-only"> {option.groupName}</span></>}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="order-3 scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-soft" id="afzwemmen">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Afzwemmen</h2>
            <p className="mt-1 text-sm text-muted-foreground">Uitnodigingen, praktische informatie en je actuele reactie.</p>
          </div>
          <StatusPill tone={visibleGraduationInvites.some((invite) => invite.invite_status === "sent") ? "warning" : "neutral"}>
            {visibleGraduationInvites.filter((invite) => invite.invite_status === "sent").length} actie nodig
          </StatusPill>
        </div>
        {visibleGraduationInvites.length === 0 ? (
          <EmptyState>Er zijn nog geen afzwemuitnodigingen. Zodra een kind klaar is, verschijnt de uitnodiging hier.</EmptyState>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleGraduationInvites.map((invite) => {
              const participant = participantById.get(invite.participant_id);
              const event = eventById.get(invite.event_id);
              const stage = event?.stage_id ? stageById.get(event.stage_id) : null;
              const resource = event?.resource_id ? resourceById.get(event.resource_id) : null;

              return (
                <article className="rounded-xl border border-border bg-background p-4" key={invite.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Kind"}</p>
                      <h3 className="mt-1 text-lg font-bold text-foreground">{event?.title ?? "Afzwemevent"}</h3>
                    </div>
                    <StatusPill tone={invite.invite_status === "confirmed" ? "success" : invite.invite_status === "declined" ? "danger" : "info"}>{graduationInviteLabel(invite.invite_status)}</StatusPill>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <PlanningDetail icon={<CalendarCheck className="size-4" />} label="Moment" value={event ? formatDateTime(event.starts_at) : "Datum volgt"} />
                    <PlanningDetail icon={<MapPin className="size-4" />} label="Locatie" value={resource?.name ?? "Locatie volgt"} />
                    <PlanningDetail icon={<GraduationCap className="size-4" />} label="Niveau" value={stage?.badge_label ?? stage?.name ?? "Wordt bepaald"} />
                    <PlanningDetail icon={<CheckCircle2 className="size-4" />} label="Resultaat" value={invite.result === "pending" ? "Nog niet bekend" : invite.result} />
                  </div>
                  {invite.invite_status === "sent" && canParentMutateParticipant(data, invite.participant_id) ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <GraduationResponseForm eventParticipantId={invite.id} next={participantContextHref("/portaal/planning", selectedParticipantId)} response="confirmed">
                        <CheckCircle2 className="size-4" /> Bevestigen
                      </GraduationResponseForm>
                      <GraduationResponseForm eventParticipantId={invite.id} next={participantContextHref("/portaal/planning", selectedParticipantId)} response="declined" secondary>
                        <XCircle className="size-4" /> Afwijzen
                      </GraduationResponseForm>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="order-1 scroll-mt-24 space-y-3" id="lessen">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Lessen</h2>
          <p className="mt-1 text-sm text-muted-foreground">Je actuele planning en lesdetails.</p>
        </div>
        <StatusPill tone="info">{lessonItems.filter((item) => new Date(item.session.starts_at).getTime() >= Date.now()).length} gepland</StatusPill>
      </div>
      {lessonItems.length === 0 ? (
        <EmptyState>Er zijn nog geen lessen gekoppeld aan dit portaal.</EmptyState>
      ) : (
        <div className="space-y-3">
          {lessonItems.map(({ session, membership }) => {
            const participant = participantById.get(membership.participant_id);
            const group = groupById.get(session.group_id);
            const cancellation = cancellationBySessionParticipant.get(`${session.id}:${membership.participant_id}`);
            const future = new Date(session.starts_at).getTime() > Date.now();
            const onTime = canCancelSession(data.settings, session.starts_at);
            const canMutate = canParentMutateParticipant(data, membership.participant_id);

            return (
              <article className="rounded-xl border border-border bg-card p-4 shadow-soft" key={`${session.id}:${membership.participant_id}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{participant?.display_name ?? "Athlete"}</p>
                    <h2 className="mt-1 text-lg font-bold text-foreground">{formatLessonDate(session.starts_at, session.ends_at)}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{group?.name ?? "Lesgroep"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusPill tone={session.status === "scheduled" ? "info" : session.status === "completed" ? "success" : "neutral"}>{session.status}</StatusPill>
                    {cancellation ? <StatusPill tone={cancellation.eligible_for_credit ? "success" : "warning"}>{cancellation.policy_status}</StatusPill> : null}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
                  <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:bg-muted" href={participantContextHref(`/portaal/lessen/${session.id}`, selectedParticipantId)}>
                    Details <ArrowRight className="h-4 w-4" />
                  </Link>
                  {future && session.status === "scheduled" && !cancellation && canMutate ? <CancelForm participantId={membership.participant_id} session={session} onTime={onTime} /> : null}
                  {cancellation ? <p className="text-sm font-semibold text-muted-foreground">Geannuleerd op {formatShortDate(cancellation.requested_at)}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      </section>
      </div>
    </div>
  );
}

function CancelForm({ onTime, participantId, session }: { onTime: boolean; participantId: string; session: SessionRow }) {
  return (
    <ConfirmActionForm
      action={cancelLessonAction}
      className="flex flex-wrap items-end gap-2"
      confirmLabel="Les definitief annuleren"
      description={
        onTime
          ? "Deze les wordt geannuleerd. Volgens de huidige termijn ontvang je hiervoor automatisch een inhaalcredit."
          : "Deze les wordt geannuleerd buiten de geldende termijn. Je ontvangt hiervoor geen inhaalcredit."
      }
      hiddenFields={{ sessionId: session.id, participantId, next: "/portaal/planning" }}
      title="Wil je deze les annuleren?"
      triggerLabel={
        <>
          <CalendarX className="h-4 w-4" />
          {onTime ? "Annuleer met credit" : "Annuleer zonder credit"}
        </>
      }
      triggerVariant={onTime ? "outline" : "destructive"}
    >
      <Field className="w-48 gap-1">
        <FieldLabel className="text-xs text-muted-foreground" htmlFor={`reason-${session.id}-${participantId}`}>
          Reden
        </FieldLabel>
        <Input className="h-9" id={`reason-${session.id}-${participantId}`} name="reason" placeholder="Optioneel" />
      </Field>
    </ConfirmActionForm>
  );
}

function PlanningDetail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-primary">{icon}<span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span></div>
      <p className="mt-2 text-sm font-bold text-foreground">{value}</p>
    </div>
  );
}

function GraduationResponseForm({ eventParticipantId, next, response, secondary = false, children }: { eventParticipantId: string; next: string; response: "confirmed" | "declined"; secondary?: boolean; children: ReactNode }) {
  return (
    <form action={respondGraduationInviteAction}>
      <input name="eventParticipantId" type="hidden" value={eventParticipantId} />
      <input name="next" type="hidden" value={next} />
      <input name="response" type="hidden" value={response} />
      <button className={secondary ? "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-semibold" : "inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"} type="submit">{children}</button>
    </form>
  );
}

function graduationInviteLabel(value: string) {
  if (value === "confirmed") return "Bevestigd";
  if (value === "declined") return "Afgewezen";
  return "Actie nodig";
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </section>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "offering-confirmed") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">De plaats in de tijdelijke cursus is definitief bevestigd.</p>;
  }
  if (saved === "confirmed") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Afzwemuitnodiging bevestigd.</p>;
  }

  if (saved === "declined") {
    return <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Afzwemuitnodiging afgewezen.</p>;
  }

  if (saved === "cancelled") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Les geannuleerd en inhaalcredit toegevoegd.</p>;
  }

  if (saved === "late") {
    return <p className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-sm font-semibold text-warning">Les geannuleerd buiten de credittermijn.</p>;
  }

  if (saved === "catchup-requested") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Inhaalles aangevraagd. De administratie beoordeelt de aanvraag.</p>;
  }

  if (saved === "catchup-approved") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Inhaalles ingepland.</p>;
  }

  if (error) {
    const message = error === "offering-full"
      ? "Deze plaatssoort is intussen vol. Er is niets afgeschreven."
      : error.startsWith("offering")
        ? "De cursusplaats kon niet veilig worden gereserveerd. Probeer opnieuw of neem contact op met de zwemschool."
        : `Actie is niet gelukt: ${error}.`;
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">{message}</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">{children}</p>;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatCurrency(cents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { currency, style: "currency" }).format(cents / 100);
}

function paymentModeLabel(value: string) {
  return {
    direct_mollie: "Direct via Mollie",
    free: "Geen betaling",
    manual: "Handmatige betaling",
    periodic_debit: "Periodieke incasso"
  }[value] ?? value;
}

function registrationStatusLabel(value: string) {
  return {
    confirmed: "Bevestigd",
    expired: "Verlopen",
    held: "Gereserveerd",
    payment_review: "Betaling controleren",
    pending_payment: "Wacht op betaling"
  }[value] ?? value;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
