import type { ReactNode } from "react";
import { AlertTriangle, Award, Banknote, Bell, CalendarDays, CheckCircle2, CircleDollarSign, CreditCard, Sparkles, UserRound } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { markNotificationReadAction, requestCatchUpLessonAction } from "@/lib/parent-portal/parent-portal-actions";
import type {
  ParentCatchUpRequestRow,
  ParentAchievementCardRow,
  ParentBadgeAwardRow,
  ParentBadgeRow,
  ParentCertificateRow,
  ParentDocumentRow,
  ParentEnrollmentRow,
  ParentGroupMembershipRow,
  ParentGroupRow,
  ParentInvoiceRow,
  ParentMilestoneEventParticipantRow,
  ParentMilestoneEventRow,
  ParentMilestoneResultRow,
  ParentNotificationRow,
  ParentPaymentRecordRow,
  ParentParticipantRow,
  ParentPortalData,
  ParentPortalSnapshot,
  ParentProgramRow,
  ParentProgressRow,
  ParentResourceRow,
  ParentSessionRow,
  ParentStageModuleProgressRow,
  ParentStageModuleRow,
  ParentStageTransitionProposalRow,
  ParentStageRow,
  ParentSubscriptionPlanRow
} from "@/lib/parent-portal/parent-portal-read-model";

type ParentPageProps = {
  snapshot: ParentPortalSnapshot;
};

type LookupMaps = {
  participants: Map<string, ParentParticipantRow>;
  programs: Map<string, ParentProgramRow>;
  stages: Map<string, ParentStageRow>;
  stageModules: Map<string, ParentStageModuleRow>;
  stageModulesByStage: Map<string, ParentStageModuleRow[]>;
  subscriptionPlans: Map<string, ParentSubscriptionPlanRow>;
  groups: Map<string, ParentGroupRow>;
  resources: Map<string, ParentResourceRow>;
  enrollments: Map<string, ParentEnrollmentRow>;
  enrollmentsByParticipant: Map<string, ParentEnrollmentRow[]>;
  membershipsByEnrollment: Map<string, ParentGroupMembershipRow[]>;
  sessionsByGroup: Map<string, ParentSessionRow[]>;
  progressByEnrollment: Map<string, ParentProgressRow[]>;
  moduleProgressByEnrollment: Map<string, ParentStageModuleProgressRow[]>;
  badges: Map<string, ParentBadgeRow>;
  badgeAwardsByParticipant: Map<string, ParentBadgeAwardRow[]>;
  achievementCardsByParticipant: Map<string, ParentAchievementCardRow[]>;
  transitionProposalsByEnrollment: Map<string, ParentStageTransitionProposalRow[]>;
  milestoneEvents: Map<string, ParentMilestoneEventRow>;
  milestoneEventParticipantsByParticipant: Map<string, ParentMilestoneEventParticipantRow[]>;
  milestoneResultsByParticipant: Map<string, ParentMilestoneResultRow[]>;
  certificatesByParticipant: Map<string, ParentCertificateRow[]>;
  documentsByParticipant: Map<string, ParentDocumentRow[]>;
  notificationsByParticipant: Map<string, ParentNotificationRow[]>;
  catchUpsBySession: Map<string, ParentCatchUpRequestRow[]>;
  invoicesByParticipant: Map<string, ParentInvoiceRow[]>;
  paymentRecordsByInvoice: Map<string, ParentPaymentRecordRow[]>;
};

type LessonRow = {
  participant: ParentParticipantRow;
  enrollment: ParentEnrollmentRow;
  group: ParentGroupRow;
  session: ParentSessionRow;
  resource: ParentResourceRow | null;
};

export function ParentDashboardPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);
  const lessons = buildLessonRows(snapshot.data, lookups);
  const nextLesson = lessons[0] ?? null;
  const unread = snapshot.data.notifications.filter((notification) => notification.status === "unread").length;
  const openInvoices = snapshot.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status));
  const openCatchUps = snapshot.data.catchUpRequests.filter((request) => ["requested", "approved"].includes(request.status));
  const pendingTransitions = snapshot.data.stageTransitionProposals.filter((proposal) => ["proposed", "approved"].includes(proposal.status));
  const actionCount = unread + openInvoices.length + openCatchUps.length + pendingTransitions.length;

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal" title="Dashboard" subtitle="Actueel overzicht van lessen, voortgang, berichten, documenten en betalingen.">
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<UserRound className="h-5 w-5" />} label="Kinderen" value={snapshot.data.participants.length.toString()} detail="gekoppelde profielen" />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Lessen" value={lessons.length.toString()} detail="aankomende sessies" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Actie nodig" value={actionCount.toString()} detail="berichten, betalingen, inhalen" />
        <MetricCard icon={<Award className="h-5 w-5" />} label="Achievements" value={snapshot.data.achievementCards.length.toString()} detail={`${snapshot.data.badgeAwards.length} badges`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionHeader title="Kinderen" count={snapshot.data.participants.length} />
          <ChildCards data={snapshot.data} lookups={lookups} />
        </Card>

        <Card>
          <SectionHeader title="Volgende les" count={nextLesson ? 1 : 0} />
          {nextLesson ? <LessonSummary lesson={nextLesson} lookups={lookups} /> : <EmptyState>Geen aankomende lessen gevonden.</EmptyState>}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ParentActionCard
          icon={<Bell className="h-5 w-5" />}
          label="Berichten"
          tone={unread > 0 ? "warning" : "success"}
          value={unread > 0 ? `${unread} ongelezen` : "Bij"}
        />
        <ParentActionCard
          icon={<CircleDollarSign className="h-5 w-5" />}
          label="Betalingen"
          tone={openInvoices.some((invoice) => invoice.status === "overdue") ? "danger" : openInvoices.length > 0 ? "warning" : "success"}
          value={openInvoices.length > 0 ? `${openInvoices.length} open` : "Geen openstaand"}
        />
        <ParentActionCard
          icon={<CalendarDays className="h-5 w-5" />}
          label="Inhaallessen"
          tone={openCatchUps.length > 0 ? "info" : "success"}
          value={openCatchUps.length > 0 ? `${openCatchUps.length} in behandeling` : "Geen open aanvraag"}
        />
        <ParentActionCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Doorstroom"
          tone={pendingTransitions.length > 0 ? "info" : "success"}
          value={pendingTransitions.length > 0 ? `${pendingTransitions.length} voorstel(len)` : "Geen open voorstel"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <NotificationList notifications={snapshot.data.notifications.slice(0, 5)} title="Laatste notificaties" />
        <DocumentList documents={snapshot.data.documents.slice(0, 5)} lookups={lookups} title="Documenten en diploma's" />
      </div>
    </ParentFrame>
  );
}

export function ParentProfilePage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - kindprofiel" title="Kindprofiel(en)" subtitle="Read-only kindprofielen met programma, stage, groep en abonnement. Billing blijft apart van stage/badje.">
      <Card>
        <SectionHeader title="Kindprofielen" count={snapshot.data.participants.length} />
        <ChildCards data={snapshot.data} lookups={lookups} expanded />
      </Card>
    </ParentFrame>
  );
}

export function ParentLessonsPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);
  const lessons = buildLessonRows(snapshot.data, lookups);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - lessen" title="Mijn lessen" subtitle="Aankomende lessen vanuit groepsplaatsingen, inclusief basisaanvraag voor een inhaalles.">
      <Card>
        <SectionHeader title="Mijn lessen" count={lessons.length} />
        <div className="grid gap-4">
          {lessons.length === 0 ? <EmptyState>Geen lessen gevonden voor gekoppelde kinderen.</EmptyState> : null}
          {lessons.map((lesson) => (
            <LessonCard key={`${lesson.enrollment.id}-${lesson.session.id}`} lesson={lesson} lookups={lookups} />
          ))}
        </div>
      </Card>
    </ParentFrame>
  );
}

export function ParentNotificationsPage({ snapshot }: ParentPageProps) {
  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - berichten" title="Notificaties" subtitle="Read status wordt opgeslagen op parent_notifications.read_at.">
      <NotificationList notifications={snapshot.data.notifications} title="Alle notificaties" />
    </ParentFrame>
  );
}

export function ParentDocumentsPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame snapshot={snapshot} kicker="Ouderportaal - documenten" title="Documenten" subtitle="Read-only documenten die aan een kind, enrollment of certificate gekoppeld zijn.">
      <DocumentList documents={snapshot.data.documents} lookups={lookups} title="Documenten" />
    </ParentFrame>
  );
}

export function ParentPaymentsPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);
  const openInvoices = snapshot.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status));
  const totalOpen = openInvoices.reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), 0);
  const totalPaid = snapshot.data.paymentRecords.filter((payment) => ["recorded", "paid"].includes(payment.status)).reduce((sum, payment) => sum + payment.amount_cents, 0);
  const nextDueInvoice = [...openInvoices].sort((a, b) => (a.due_on ?? a.issued_on).localeCompare(b.due_on ?? b.issued_on))[0] ?? null;

  return (
    <ParentFrame
      phase="Betalingen"
      snapshot={snapshot}
      kicker="Ouderportaal - betalingen"
      title="Betalingen"
      subtitle="Manual payment status voor ouders. Mollie/iDEAL is voorbereid in de architectuur, maar nog niet actief zolang de handmatige flow leidend is."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<CircleDollarSign className="h-5 w-5" />} label="Facturen" value={snapshot.data.invoices.length.toString()} detail="gekoppeld aan deelname" />
        <MetricCard icon={<Banknote className="h-5 w-5" />} label="Openstaand" value={formatMoney(totalOpen, "EUR")} detail="handmatig te voldoen" />
        <MetricCard icon={<Award className="h-5 w-5" />} label="Betaald" value={formatMoney(totalPaid, "EUR")} detail="geregistreerd door admin" />
        <MetricCard icon={<CreditCard className="h-5 w-5" />} label="Online betalen" value="Voorbereid" detail="Mollie/iDEAL later" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionHeader title="Facturen" count={snapshot.data.invoices.length} />
          <div className="grid gap-4">
            {snapshot.data.invoices.length === 0 ? <EmptyState>Nog geen facturen gevonden.</EmptyState> : null}
            {snapshot.data.invoices.map((invoice) => (
              <ParentInvoiceCard key={invoice.id} invoice={invoice} lookups={lookups} />
            ))}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card>
            <SectionHeader title="Eerstvolgende betaling" count={nextDueInvoice ? 1 : 0} />
            {nextDueInvoice ? <ParentInvoiceSummary invoice={nextDueInvoice} lookups={lookups} /> : <EmptyState>Geen openstaande betalingen.</EmptyState>}
          </Card>

          <Card>
            <SectionHeader title="Laatste betalingen" count={snapshot.data.paymentRecords.length} />
            <div className="grid gap-3">
              {snapshot.data.paymentRecords.length === 0 ? <EmptyState>Nog geen geregistreerde betalingen.</EmptyState> : null}
              {snapshot.data.paymentRecords.map((payment) => (
                <ParentPaymentRecordRowView key={payment.id} payment={payment} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Manual-first betaalflow</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Betalingen worden nu handmatig door de tenant admin geregistreerd. De ouder ziet status en historie, zonder checkout of Mollie-call.
            </p>
          </div>
          <StatusPill tone="warning">Mollie later</StatusPill>
        </div>
      </Card>
    </ParentFrame>
  );
}

function ParentInvoiceCard({ invoice, lookups }: { invoice: ParentInvoiceRow; lookups: LookupMaps }) {
  const payments = lookups.paymentRecordsByInvoice.get(invoice.id) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <ParentInvoiceSummary invoice={invoice} lookups={lookups} />
      {invoice.description ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{invoice.description}</p> : null}
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoTile label="Periode" value={invoice.period_start && invoice.period_end ? `${formatDate(invoice.period_start)} - ${formatDate(invoice.period_end)}` : "Niet ingesteld"} />
        <InfoTile label="Betaalmethode" value={invoice.collection_method === "manual" ? "Handmatig" : invoice.collection_method} />
        <InfoTile label="Vervaldatum" value={invoice.due_on ? formatDate(invoice.due_on) : "Nog niet bekend"} />
      </div>
      {payments.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {payments.map((payment) => (
            <ParentPaymentRecordRowView key={payment.id} payment={payment} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ParentInvoiceSummary({ invoice, lookups }: { invoice: ParentInvoiceRow; lookups: LookupMaps }) {
  const participant = lookups.participants.get(invoice.participant_id);
  const enrollment = lookups.enrollments.get(invoice.enrollment_id);
  const program = enrollment ? lookups.programs.get(enrollment.program_id) : null;
  const plan = invoice.subscription_plan_id ? lookups.subscriptionPlans.get(invoice.subscription_plan_id) : null;
  const remaining = Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{invoice.invoice_number} - {invoice.title}</p>
          <p className="text-sm text-muted-foreground">
            {participant?.display_name ?? "Leerling"} - {program?.name ?? "Programma"} - {plan?.name ?? "abonnement onbekend"}
          </p>
        </div>
        <StatusPill tone={invoice.status === "paid" ? "success" : invoice.status === "overdue" ? "danger" : invoice.status === "partially_paid" ? "warning" : "info"}>{invoice.status}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoTile label="Factuurbedrag" value={formatMoney(invoice.amount_due_cents, invoice.currency)} />
        <InfoTile label="Betaald" value={formatMoney(invoice.amount_paid_cents, invoice.currency)} />
        <InfoTile label="Openstaand" value={formatMoney(remaining, invoice.currency)} />
      </div>
    </div>
  );
}

function ParentPaymentRecordRowView({ payment }: { payment: ParentPaymentRecordRow }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{formatMoney(payment.amount_cents, payment.currency)}</p>
          <p className="text-sm text-muted-foreground">{payment.payment_method} - {payment.provider}</p>
          {payment.note ? <p className="mt-1 text-sm text-muted-foreground">{payment.note}</p> : null}
        </div>
        <StatusPill tone={payment.status === "recorded" || payment.status === "paid" ? "success" : payment.status === "failed" ? "danger" : "warning"}>{payment.status}</StatusPill>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{payment.received_on ? formatDate(payment.received_on) : formatDate(payment.created_at)}</p>
    </div>
  );
}

export function ParentDiplomasPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame
      phase="Afzwemmen"
      snapshot={snapshot}
      kicker="Ouderportaal - diploma's"
      title="Afzwemmen & diploma's"
      subtitle="Afzwemmomenten, resultaatregistratie en digitale diplomakluis. Downloaden en delen zijn voorbereid via vault-statussen."
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <SectionHeader title="Afzwemmomenten" count={snapshot.data.milestoneEventParticipants.length} />
          <div className="grid gap-3">
            {snapshot.data.milestoneEventParticipants.length === 0 ? <EmptyState>Geen afzwemmomenten gevonden.</EmptyState> : null}
            {snapshot.data.milestoneEventParticipants.map((eventParticipant) => (
              <MilestoneEventParticipantCard key={eventParticipant.id} eventParticipant={eventParticipant} lookups={lookups} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Resultaten" count={snapshot.data.milestoneResults.length} />
          <div className="grid gap-3">
            {snapshot.data.milestoneResults.length === 0 ? <EmptyState>Nog geen afzwemresultaten geregistreerd.</EmptyState> : null}
            {snapshot.data.milestoneResults.map((result) => (
              <MilestoneResultCard key={result.id} lookups={lookups} result={result} />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <SectionHeader title="Digitale diplomakluis" count={snapshot.data.certificates.length} />
          <div className="grid gap-3">
            {snapshot.data.certificates.length === 0 ? <EmptyState>Nog geen certificaten of diploma's gevonden.</EmptyState> : null}
            {snapshot.data.certificates.map((certificate) => (
              <DiplomaVaultCard key={certificate.id} certificate={certificate} lookups={lookups} />
            ))}
          </div>
        </Card>

        <DocumentList documents={snapshot.data.documents.filter((document) => ["diploma", "certificate"].includes(document.document_type))} lookups={lookups} title="Diplomadocumenten" />
      </div>
    </ParentFrame>
  );
}

function MilestoneEventParticipantCard({ eventParticipant, lookups }: { eventParticipant: ParentMilestoneEventParticipantRow; lookups: LookupMaps }) {
  const event = lookups.milestoneEvents.get(eventParticipant.milestone_event_id);
  const enrollment = snapshotEnrollmentByProgress(lookups, eventParticipant.enrollment_id);
  const program = enrollment ? lookups.programs.get(enrollment.program_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{event?.title ?? "Afzwemmoment"}</p>
          <p className="text-sm text-muted-foreground">
            {participantName(lookups, eventParticipant.participant_id)} - {program?.name ?? "Programma"}
          </p>
          {event ? <p className="mt-2 text-sm font-semibold">{formatDateTime(event.starts_at)} - {formatTime(event.ends_at)}</p> : null}
          {eventParticipant.note ? <p className="mt-2 text-sm text-muted-foreground">{eventParticipant.note}</p> : null}
        </div>
        <StatusPill tone={eventParticipant.status === "confirmed" || eventParticipant.status === "attended" ? "success" : eventParticipant.status === "declined" || eventParticipant.status === "no_show" ? "danger" : "warning"}>{eventParticipant.status}</StatusPill>
      </div>
    </div>
  );
}

function MilestoneResultCard({ result, lookups }: { result: ParentMilestoneResultRow; lookups: LookupMaps }) {
  const event = lookups.milestoneEvents.get(result.milestone_event_id);

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{participantName(lookups, result.participant_id)}</p>
          <p className="text-sm text-muted-foreground">{event?.title ?? "Afzwemresultaat"} - {formatDateTime(result.registered_at)}</p>
          {result.note ? <p className="mt-2 text-sm text-muted-foreground">{result.note}</p> : null}
        </div>
        <StatusPill tone={result.result_status === "passed" ? "success" : result.result_status === "failed" ? "danger" : "warning"}>{result.result_status}</StatusPill>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Score: {result.score === null ? "-" : `${result.score}%`}</p>
    </div>
  );
}

function DiplomaVaultCard({ certificate, lookups }: { certificate: ParentCertificateRow; lookups: LookupMaps }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{certificate.title}</p>
          <p className="text-sm text-muted-foreground">{participantName(lookups, certificate.participant_id)} - {lookups.programs.get(certificate.program_id)?.name ?? "Programma"}</p>
        </div>
        <StatusPill tone={certificate.vault_status === "available" || certificate.status === "issued" ? "success" : "warning"}>{certificate.vault_status}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <InfoTile label="Nummer" value={certificate.certificate_number ?? "Nog niet uitgegeven"} />
        <InfoTile label="Uitgiftedatum" value={certificate.issued_on ? formatDate(certificate.issued_on) : "Nog niet bekend"} />
        <InfoTile label="Download" value={certificate.download_status === "ready" ? "Voorbereid" : certificate.download_status} />
        <InfoTile label="Delen" value={certificate.share_enabled ? "Voorbereid" : "Nog uit"} />
      </div>
      <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
        {certificate.file_path ? `Bestand: ${certificate.file_path}` : "Diploma-PDF wordt gekoppeld zodra de tenant deze publiceert."}
      </div>
      {certificate.share_enabled && certificate.share_token ? (
        <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          Deelcode voorbereid: {certificate.share_token.slice(0, 8)}... {certificate.share_expires_at ? `tot ${formatDateTime(certificate.share_expires_at)}` : ""}
        </div>
      ) : null}
    </div>
  );
}

export function ParentProgressPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame
      phase="Voortgang"
      snapshot={snapshot}
      kicker="Ouderportaal - voortgang"
      title="Voortgang"
      subtitle="Progressie per stage en module, inclusief stage-overgangsvoorstellen. Abonnement en betaling blijven los van badje/stage."
    >
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionHeader title="Modulevoortgang" count={snapshot.data.stageModuleProgress.length} />
          <div className="grid gap-4">
            {snapshot.data.participants.length === 0 ? <EmptyState>Geen gekoppelde kinderen gevonden.</EmptyState> : null}
            {snapshot.data.participants.map((participant) => (
              <ProgressChildCard key={participant.id} participant={participant} lookups={lookups} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Niveauvoorstellen" count={snapshot.data.stageTransitionProposals.length} />
          <div className="grid gap-3">
            {snapshot.data.stageTransitionProposals.length === 0 ? <EmptyState>Geen stage-overgangsvoorstellen gevonden.</EmptyState> : null}
            {snapshot.data.stageTransitionProposals.map((proposal) => (
              <div key={proposal.id} className="rounded-2xl border border-border bg-muted/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{participantName(lookups, proposal.participant_id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {proposal.from_stage_id ? (lookups.stages.get(proposal.from_stage_id)?.name ?? "Huidige stage") : "Geen stage"} naar {lookups.stages.get(proposal.to_stage_id)?.name ?? "Nieuwe stage"}
                    </p>
                    {proposal.reason ? <p className="mt-2 text-sm text-muted-foreground">{proposal.reason}</p> : null}
                  </div>
                  <StatusPill tone={proposal.status === "approved" || proposal.status === "applied" ? "success" : proposal.status === "rejected" ? "danger" : "warning"}>{proposal.status}</StatusPill>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Voorgesteld op {formatDateTime(proposal.proposed_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Laatste observaties" count={snapshot.data.progress.length} />
        <div className="grid gap-3">
          {snapshot.data.progress.length === 0 ? <EmptyState>Nog geen observaties gevonden.</EmptyState> : null}
          {snapshot.data.progress.map((progress) => (
            <ProgressTimelineRow key={progress.id} progress={progress} lookups={lookups} />
          ))}
        </div>
      </Card>
    </ParentFrame>
  );
}

export function ParentBadgesPage({ snapshot }: ParentPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <ParentFrame
      phase="Prestaties"
      snapshot={snapshot}
      kicker="Ouderportaal - achievements"
      title="Badges en prestatiekaarten"
      subtitle="Verdiende badges, complimentkaarten en mijlpalen voor ouder en kind."
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <Card>
          <SectionHeader title="Achievement cards" count={snapshot.data.achievementCards.length} />
          <div className="grid gap-4 md:grid-cols-2">
            {snapshot.data.achievementCards.length === 0 ? <EmptyState>Nog geen achievement cards gevonden.</EmptyState> : null}
            {snapshot.data.achievementCards.map((card) => (
              <div key={card.id} className="rounded-3xl border border-border bg-gradient-to-br from-card to-muted/50 p-5 shadow-soft">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    {card.card_type === "badge" ? <Award className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
                  </div>
                  <StatusPill tone={card.card_type === "badge" ? "success" : "info"}>{card.card_type}</StatusPill>
                </div>
                <p className="text-lg font-bold">{card.title}</p>
                {card.body ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.body}</p> : null}
                <p className="mt-4 text-xs font-semibold text-muted-foreground">{participantName(lookups, card.participant_id)} - {formatDate(card.published_at)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Verdiende badges" count={snapshot.data.badgeAwards.length} />
          <div className="grid gap-3">
            {snapshot.data.badgeAwards.length === 0 ? <EmptyState>Nog geen badge awards gevonden.</EmptyState> : null}
            {snapshot.data.badgeAwards.map((award) => {
              const badge = lookups.badges.get(award.badge_id);

              return (
                <div key={award.id} className="rounded-2xl border border-border bg-muted/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{badge?.name ?? "Badge"}</p>
                      <p className="text-sm text-muted-foreground">{participantName(lookups, award.participant_id)} - {badge?.description ?? "Achievement"}</p>
                      {award.note ? <p className="mt-2 text-sm text-muted-foreground">{award.note}</p> : null}
                    </div>
                    <StatusPill tone={award.status === "awarded" ? "success" : "neutral"}>{award.status}</StatusPill>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">Toegekend op {formatDateTime(award.awarded_at)}</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </ParentFrame>
  );
}

function ParentFrame({ snapshot, kicker, title, subtitle, children, phase = "Ouderportaal" }: ParentPageProps & { kicker: string; title: string; subtitle: string; children: ReactNode; phase?: string }) {
  return (
    <div className="grid gap-6">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">{phase}</StatusPill>} />
      {snapshot.status === "ready" ? children : <ParentStatusPanel snapshot={snapshot} />}
    </div>
  );
}

function ParentStatusPanel({ snapshot }: ParentPageProps) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Ouderportaal niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft Supabase-configuratie, tenantcontext en parent-child-koppelingen nodig.</p>
      {snapshot.errors.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ChildCards({ data, lookups, expanded = false }: { data: ParentPortalData; lookups: LookupMaps; expanded?: boolean }) {
  if (data.participants.length === 0) {
    return <EmptyState>Er zijn nog geen kinderen gekoppeld aan dit ouderaccount.</EmptyState>;
  }

  return (
    <div className="grid gap-3">
      {data.participants.map((participant) => {
        const enrollments = lookups.enrollmentsByParticipant.get(participant.id) ?? [];
        const primaryEnrollment = enrollments[0] ?? null;
        const stage = primaryEnrollment?.current_stage_id ? lookups.stages.get(primaryEnrollment.current_stage_id) : null;
        const program = primaryEnrollment ? lookups.programs.get(primaryEnrollment.program_id) : null;
        const plan = primaryEnrollment?.subscription_plan_id ? lookups.subscriptionPlans.get(primaryEnrollment.subscription_plan_id) : null;
        const latestProgress = primaryEnrollment ? (lookups.progressByEnrollment.get(primaryEnrollment.id) ?? [])[0] : null;
        const modules = primaryEnrollment?.current_stage_id ? (lookups.stageModulesByStage.get(primaryEnrollment.current_stage_id) ?? []) : [];
        const moduleProgress = primaryEnrollment ? (lookups.moduleProgressByEnrollment.get(primaryEnrollment.id) ?? []) : [];
        const passedModules = moduleProgress.filter((progress) => progress.status === "passed").length;
        const badges = lookups.badgeAwardsByParticipant.get(participant.id) ?? [];
        const transition = primaryEnrollment ? (lookups.transitionProposalsByEnrollment.get(primaryEnrollment.id) ?? [])[0] : null;

        return (
          <div key={participant.id} className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold">{participant.display_name}</p>
                <p className="text-sm text-muted-foreground">{participant.birthdate ? `${ageFromBirthdate(participant.birthdate)} jaar` : "Leeftijd onbekend"}</p>
              </div>
              <StatusPill tone={participant.status === "active" ? "success" : "neutral"}>{participant.status}</StatusPill>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoTile label="Programma" value={program?.name ?? "-"} />
              <InfoTile label="Niveau" value={stage?.name ?? "-"} />
              <InfoTile label="Abonnement" value={plan ? `${plan.name} (${formatMoney(plan.price_cents, plan.currency)})` : "-"} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <InfoTile label="Modules" value={modules.length > 0 ? `${passedModules}/${modules.length} behaald` : "Nog geen modules"} />
              <InfoTile label="Badges" value={badges.length.toString()} />
              <InfoTile label="Doorstroom" value={transition ? `${lookups.stages.get(transition.to_stage_id)?.name ?? "Nieuwe stage"} (${transition.status})` : "Geen voorstel"} />
            </div>
            {expanded ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoTile label="Laatste voortgang" value={latestProgress ? `${latestProgress.status}${latestProgress.score === null ? "" : ` - ${latestProgress.score}%`}` : "Nog geen voortgang"} />
                <InfoTile label="Start deelname" value={primaryEnrollment ? formatDate(primaryEnrollment.started_on) : "-"} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function LessonCard({ lesson, lookups }: { lesson: LessonRow; lookups: LookupMaps }) {
  const catchUps = lookups.catchUpsBySession.get(lesson.session.id) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <LessonSummary lesson={lesson} lookups={lookups} />
      <div className="mt-4 border-t border-border pt-4">
        {catchUps.length > 0 ? (
          <div className="mb-3 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
            Inhaalaanvraag: {catchUps[0]?.status ?? "requested"}
          </div>
        ) : (
          <CatchUpForm lesson={lesson} />
        )}
      </div>
    </div>
  );
}

function LessonSummary({ lesson, lookups }: { lesson: LessonRow; lookups: LookupMaps }) {
  const program = lookups.programs.get(lesson.enrollment.program_id);
  const stage = lesson.enrollment.current_stage_id ? lookups.stages.get(lesson.enrollment.current_stage_id) : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-lg font-bold">{lesson.participant.display_name}</p>
        <p className="text-sm text-muted-foreground">{program?.name ?? "Programma"} - {stage?.name ?? "Niveau"} - {lesson.group.name}</p>
        <p className="mt-2 text-sm font-semibold">{formatDateTime(lesson.session.starts_at)} - {formatTime(lesson.session.ends_at)}</p>
        <p className="text-xs text-muted-foreground">{lesson.resource?.location_name ?? lesson.resource?.name ?? "Locatie volgt"} </p>
      </div>
      <StatusPill tone={lesson.session.status === "scheduled" ? "success" : lesson.session.status === "cancelled" ? "danger" : "neutral"}>{lesson.session.status}</StatusPill>
    </div>
  );
}

function CatchUpForm({ lesson }: { lesson: LessonRow }) {
  return (
    <details className="rounded-2xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Inhaalles aanvragen</summary>
      <form action={requestCatchUpLessonAction} className="mt-4 grid gap-3">
        <input name="participant_id" type="hidden" value={lesson.participant.id} />
        <input name="enrollment_id" type="hidden" value={lesson.enrollment.id} />
        <input name="session_id" type="hidden" value={lesson.session.id} />
        <fieldset className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          {preferredTimes.map((time) => (
            <label key={time.value} className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold">
              <input className="h-4 w-4 accent-primary" name="preferred_time_windows" type="checkbox" value={time.value} />
              {time.label}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
          Reden
          <textarea className="min-h-20 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" name="reason" />
        </label>
        <button className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          Aanvraag versturen
        </button>
      </form>
    </details>
  );
}

function NotificationList({ notifications, title }: { notifications: ParentNotificationRow[]; title: string }) {
  return (
    <Card>
      <SectionHeader title={title} count={notifications.length} />
      <div className="grid gap-3">
        {notifications.length === 0 ? <EmptyState>Geen notificaties gevonden.</EmptyState> : null}
        {notifications.map((notification) => (
          <div key={notification.id} className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{notification.title}</p>
                {notification.body ? <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(notification.created_at)}</p>
              </div>
              <StatusPill tone={notification.status === "unread" ? "warning" : "neutral"}>{notification.status}</StatusPill>
            </div>
            {notification.status === "unread" ? (
              <form action={markNotificationReadAction} className="mt-3">
                <input name="notification_id" type="hidden" value={notification.id} />
                <button className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted" type="submit">
                  Markeer gelezen
                </button>
              </form>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function DocumentList({ documents, lookups, title }: { documents: ParentDocumentRow[]; lookups: LookupMaps; title: string }) {
  return (
    <Card>
      <SectionHeader title={title} count={documents.length} />
      <div className="grid gap-3">
        {documents.length === 0 ? <EmptyState>Geen documenten gevonden.</EmptyState> : null}
        {documents.map((document) => (
          <div key={document.id} className="rounded-2xl border border-border bg-muted/35 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{document.title}</p>
                <p className="text-sm text-muted-foreground">{participantName(lookups, document.participant_id)} - {document.document_type}</p>
                <p className="mt-2 text-xs text-muted-foreground">Beschikbaar: {document.available_on ? formatDate(document.available_on) : formatDate(document.created_at)}</p>
              </div>
              <StatusPill tone={document.status === "available" ? "success" : "neutral"}>{document.status}</StatusPill>
            </div>
            {document.file_path ? (
              <a className="mt-3 inline-flex w-fit rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted" href={`/api/documents/${document.id}/download`}>
                Download document
              </a>
            ) : (
              <div className="mt-3 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">Bestand is nog niet gekoppeld.</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ProgressChildCard({ participant, lookups }: { participant: ParentParticipantRow; lookups: LookupMaps }) {
  const enrollments = lookups.enrollmentsByParticipant.get(participant.id) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{participant.display_name}</p>
          <p className="text-sm text-muted-foreground">{participant.birthdate ? `${ageFromBirthdate(participant.birthdate)} jaar` : "Leeftijd onbekend"}</p>
        </div>
        <StatusPill tone={participant.status === "active" ? "success" : "neutral"}>{participant.status}</StatusPill>
      </div>
      <div className="grid gap-4">
        {enrollments.map((enrollment) => {
          const stage = enrollment.current_stage_id ? lookups.stages.get(enrollment.current_stage_id) : null;
          const modules = stage ? (lookups.stageModulesByStage.get(stage.id) ?? []) : [];
          const moduleProgress = lookups.moduleProgressByEnrollment.get(enrollment.id) ?? [];

          return (
            <div key={enrollment.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{lookups.programs.get(enrollment.program_id)?.name ?? "Programma"}</p>
                  <p className="text-sm text-muted-foreground">{stage?.name ?? "Niveau onbekend"}</p>
                </div>
                <StatusPill tone="info">{moduleProgress.filter((progress) => progress.status === "passed").length}/{modules.length} modules</StatusPill>
              </div>
              <div className="grid gap-2">
                {modules.length === 0 ? <EmptyState>Geen modules voor deze stage gevonden.</EmptyState> : null}
                {modules.map((module) => {
                  const progress = moduleProgress.find((entry) => entry.stage_module_id === module.id) ?? null;

                  return (
                    <div key={module.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-semibold">{module.name}</p>
                        <p className="text-xs text-muted-foreground">{module.description ?? "Module"}</p>
                      </div>
                      <StatusPill tone={progress?.status === "passed" ? "success" : progress?.status === "needs_attention" ? "warning" : "neutral"}>
                        {progress ? `${progress.status}${progress.score === null ? "" : ` ${progress.score}%`}` : "open"}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressTimelineRow({ progress, lookups }: { progress: ParentProgressRow; lookups: LookupMaps }) {
  const enrollment = snapshotEnrollmentByProgress(lookups, progress.enrollment_id);
  const stage = progress.stage_id ? lookups.stages.get(progress.stage_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{enrollment ? participantName(lookups, enrollment.participant_id) : "Leerling"}</p>
          <p className="text-sm text-muted-foreground">{stage?.name ?? "Algemene voortgang"}</p>
          {progress.note ? <p className="mt-2 text-sm text-muted-foreground">{progress.note}</p> : null}
        </div>
        <StatusPill tone={progress.status === "passed" ? "success" : progress.status === "needs_attention" ? "warning" : "info"}>
          {progress.status}
          {progress.score === null ? "" : ` ${progress.score}%`}
        </StatusPill>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{formatDateTime(progress.assessed_at)}</p>
    </div>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function ParentActionCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <StatusPill tone={tone}>{value}</StatusPill>
      </div>
      <p className="mt-3 text-sm font-bold">{label}</p>
    </div>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{children}</div>;
}

function buildLookups(data: ParentPortalData): LookupMaps {
  return {
    participants: byId(data.participants),
    programs: byId(data.programs),
    stages: byId(data.stages),
    stageModules: byId(data.stageModules),
    stageModulesByStage: groupBy(data.stageModules, (module) => module.stage_id),
    subscriptionPlans: byId(data.subscriptionPlans),
    groups: byId(data.groups),
    resources: byId(data.resources),
    enrollments: byId(data.enrollments),
    enrollmentsByParticipant: groupBy(data.enrollments, (enrollment) => enrollment.participant_id),
    membershipsByEnrollment: groupBy(data.groupMemberships, (membership) => membership.enrollment_id),
    sessionsByGroup: groupBy(data.sessions, (session) => session.group_id),
    progressByEnrollment: groupBy(data.progress, (progress) => progress.enrollment_id),
    moduleProgressByEnrollment: groupBy(data.stageModuleProgress, (progress) => progress.enrollment_id),
    badges: byId(data.badges),
    badgeAwardsByParticipant: groupBy(data.badgeAwards, (award) => award.participant_id),
    achievementCardsByParticipant: groupBy(data.achievementCards, (card) => card.participant_id),
    transitionProposalsByEnrollment: groupBy(data.stageTransitionProposals, (proposal) => proposal.enrollment_id),
    milestoneEvents: byId(data.milestoneEvents),
    milestoneEventParticipantsByParticipant: groupBy(data.milestoneEventParticipants, (eventParticipant) => eventParticipant.participant_id),
    milestoneResultsByParticipant: groupBy(data.milestoneResults, (result) => result.participant_id),
    certificatesByParticipant: groupBy(data.certificates, (certificate) => certificate.participant_id),
    documentsByParticipant: groupBy(data.documents, (document) => document.participant_id),
    notificationsByParticipant: groupBy(data.notifications.filter((notification) => notification.participant_id), (notification) => notification.participant_id ?? ""),
    catchUpsBySession: groupBy(data.catchUpRequests, (request) => request.missed_session_id),
    invoicesByParticipant: groupBy(data.invoices, (invoice) => invoice.participant_id),
    paymentRecordsByInvoice: groupBy(data.paymentRecords, (payment) => payment.invoice_id)
  };
}

function buildLessonRows(data: ParentPortalData, lookups: LookupMaps): LessonRow[] {
  const lessons: LessonRow[] = [];

  for (const enrollment of data.enrollments) {
    const participant = lookups.participants.get(enrollment.participant_id);

    if (!participant) {
      continue;
    }

    for (const membership of lookups.membershipsByEnrollment.get(enrollment.id) ?? []) {
      if (!["planned", "active"].includes(membership.status)) {
        continue;
      }

      const group = lookups.groups.get(membership.group_id);

      if (!group) {
        continue;
      }

      for (const session of lookups.sessionsByGroup.get(group.id) ?? []) {
        lessons.push({
          participant,
          enrollment,
          group,
          session,
          resource: session.resource_id ? (lookups.resources.get(session.resource_id) ?? null) : group.resource_id ? (lookups.resources.get(group.resource_id) ?? null) : null
        });
      }
    }
  }

  return lessons.sort((a, b) => a.session.starts_at.localeCompare(b.session.starts_at));
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function groupBy<Row>(rows: Row[], getKey: (row: Row) => string) {
  const grouped = new Map<string, Row[]>();

  for (const row of rows) {
    const key = getKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return grouped;
}

function participantName(lookups: LookupMaps, participantId: string) {
  return lookups.participants.get(participantId)?.display_name ?? "Onbekend kind";
}

function snapshotEnrollmentByProgress(lookups: LookupMaps, enrollmentId: string) {
  for (const enrollments of lookups.enrollmentsByParticipant.values()) {
    const match = enrollments.find((enrollment) => enrollment.id === enrollmentId);

    if (match) {
      return match;
    }
  }

  return null;
}

function ageFromBirthdate(birthdate: string) {
  const birth = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday = today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());

  if (beforeBirthday) {
    age -= 1;
  }

  return Math.max(0, age);
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { timeStyle: "short" }).format(new Date(value));
}

const preferredTimes = [
  { label: "Ochtend", value: "morning" },
  { label: "Middag", value: "afternoon" },
  { label: "Avond", value: "evening" },
  { label: "Weekend", value: "weekend" }
];
