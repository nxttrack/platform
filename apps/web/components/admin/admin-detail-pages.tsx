import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CalendarDays, CircleDollarSign, FileText, UserRound, Users } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import type { AdminDomainSnapshot, EnrollmentRow, GroupMembershipRow, ParticipantGuardianRow } from "@/lib/domain/admin-domain-read-model";
import type { AdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import type { PlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

type DetailProps = {
  id: string;
  domain: AdminDomainSnapshot;
};

export function LearnerDetailPage({ domain, id }: DetailProps) {
  if (domain.status !== "ready") {
    return <Unavailable title="Leerlingdossier niet beschikbaar" />;
  }

  const data = domain.data;
  const participant = data.participants.find((entry) => entry.id === id);

  if (!participant) {
    return <NotFound title="Leerling niet gevonden" backHref="/admin/leerlingen" />;
  }

  const enrollments = data.enrollments.filter((entry) => entry.participant_id === participant.id);
  const guardians = data.participantGuardians.filter((entry) => entry.participant_id === participant.id);
  const memberships = data.groupMemberships.filter((entry) => enrollments.some((enrollment) => enrollment.id === entry.enrollment_id));
  const audit = data.peopleAuditEvents.filter((event) => event.participant_id === participant.id);

  return (
    <DetailFrame backHref="/admin/leerlingen" kicker="Leerlingdossier" title={participant.display_name} status={participant.status}>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Users className="h-5 w-5" />} label="Inschrijvingen" value={enrollments.length.toString()} />
        <Metric icon={<UserRound className="h-5 w-5" />} label="Ouders/verzorgers" value={guardians.length.toString()} />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Groepsplaatsingen" value={memberships.length.toString()} />
      </div>
      <RelationshipCard title="Ouders/verzorgers">{guardians.map((guardian) => <GuardianLine guardian={guardian} key={guardian.id} />)}</RelationshipCard>
      <RelationshipCard title="Inschrijvingen">{enrollments.map((enrollment) => <EnrollmentLine domain={domain} enrollment={enrollment} key={enrollment.id} />)}</RelationshipCard>
      <RelationshipCard title="Groepsplaatsingen">{memberships.map((membership) => <MembershipLine domain={domain} membership={membership} key={membership.id} />)}</RelationshipCard>
      <AuditList rows={audit.map((event) => ({ id: event.id, label: event.event_type, detail: event.summary, date: event.created_at }))} />
    </DetailFrame>
  );
}

export function GuardianDetailPage({ domain, id }: DetailProps) {
  if (domain.status !== "ready") {
    return <Unavailable title="Ouderdossier niet beschikbaar" />;
  }

  const guardian = domain.data.participantGuardians.find((entry) => entry.id === id);

  if (!guardian) {
    return <NotFound title="Ouder/verzorger niet gevonden" backHref="/admin/leerlingen" />;
  }

  const participant = domain.data.participants.find((entry) => entry.id === guardian.participant_id);
  const profile = domain.data.profiles.find((entry) => entry.id === guardian.profile_id);

  return (
    <DetailFrame backHref="/admin/leerlingen" kicker="Ouder/verzorger" title={guardian.display_name ?? profile?.full_name ?? guardian.email ?? "Ouder/verzorger"} status={guardian.status}>
      <InfoGrid
        items={[
          ["Leerling", participant?.display_name ?? "-"],
          ["Relatie", guardian.relationship],
          ["E-mail", guardian.email ?? "-"],
          ["Profiel", profile?.full_name ?? guardian.profile_id]
        ]}
      />
    </DetailFrame>
  );
}

export function InstructorDetailPage({ domain, id }: DetailProps) {
  if (domain.status !== "ready") {
    return <Unavailable title="Instructeur niet beschikbaar" />;
  }

  const instructor = domain.data.instructors.find((entry) => entry.id === id);

  if (!instructor) {
    return <NotFound title="Instructeur niet gevonden" backHref="/admin/instructors" />;
  }

  const groups = domain.data.groups.filter((group) => group.instructor_id === instructor.id);
  const sessions = domain.data.sessions.filter((session) => session.instructor_id === instructor.id || groups.some((group) => group.id === session.group_id));

  return (
    <DetailFrame backHref="/admin/instructors" kicker="Instructeur" title={instructor.display_name} status={instructor.status}>
      <div className="grid gap-4 md:grid-cols-2">
        <Metric icon={<Users className="h-5 w-5" />} label="Groepen" value={groups.length.toString()} />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Sessies" value={sessions.length.toString()} />
      </div>
      <RelationshipCard title="Groepen">{groups.map((group) => <PlainLine detail={group.status} href={`/admin/groups/${group.id}`} key={group.id} label={group.name} />)}</RelationshipCard>
      <RelationshipCard title="Sessies">{sessions.map((session) => <PlainLine detail={formatDateTime(session.starts_at)} href={`/admin/sessions/${session.id}`} key={session.id} label={domain.data.groups.find((group) => group.id === session.group_id)?.name ?? "Sessie"} />)}</RelationshipCard>
    </DetailFrame>
  );
}

export function GroupDetailPage({ domain, id }: DetailProps) {
  if (domain.status !== "ready") {
    return <Unavailable title="Groep niet beschikbaar" />;
  }

  const group = domain.data.groups.find((entry) => entry.id === id);

  if (!group) {
    return <NotFound title="Groep niet gevonden" backHref="/admin/groups" />;
  }

  const memberships = domain.data.groupMemberships.filter((entry) => entry.group_id === group.id);
  const sessions = domain.data.sessions.filter((entry) => entry.group_id === group.id);
  const program = domain.data.programs.find((entry) => entry.id === group.program_id);
  const stage = domain.data.stages.find((entry) => entry.id === group.stage_id);

  return (
    <DetailFrame backHref="/admin/groups" kicker="Groep" title={group.name} status={group.status}>
      <InfoGrid
        items={[
          ["Programma", program?.name ?? "-"],
          ["Niveau", stage?.name ?? "-"],
          ["Capaciteit", group.capacity.toString()],
          ["Moment", `${weekdayLabel(group.weekday)} ${group.starts_at.slice(0, 5)}-${group.ends_at.slice(0, 5)}`]
        ]}
      />
      <RelationshipCard title="Leerlingen">{memberships.map((membership) => <MembershipLine domain={domain} membership={membership} key={membership.id} />)}</RelationshipCard>
      <RelationshipCard title="Sessies">{sessions.map((session) => <PlainLine detail={session.status} href={`/admin/sessions/${session.id}`} key={session.id} label={formatDateTime(session.starts_at)} />)}</RelationshipCard>
    </DetailFrame>
  );
}

export function SessionDetailPage({ domain, id }: DetailProps) {
  if (domain.status !== "ready") {
    return <Unavailable title="Sessie niet beschikbaar" />;
  }

  const session = domain.data.sessions.find((entry) => entry.id === id);

  if (!session) {
    return <NotFound title="Sessie niet gevonden" backHref="/admin/sessions" />;
  }

  const group = domain.data.groups.find((entry) => entry.id === session.group_id);
  const attendance = domain.data.attendance.filter((entry) => entry.session_id === session.id);

  return (
    <DetailFrame backHref="/admin/sessions" kicker="Sessie" title={group?.name ?? "Sessie"} status={session.status}>
      <InfoGrid
        items={[
          ["Start", formatDateTime(session.starts_at)],
          ["Einde", formatDateTime(session.ends_at)],
          ["Groep", group?.name ?? "-"],
          ["Aanwezigheid", attendance.length.toString()]
        ]}
      />
      <RelationshipCard title="Aanwezigheid">
        {attendance.map((row) => {
          const participant = domain.data.participants.find((entry) => entry.id === row.participant_id);
          return <PlainLine detail={row.status} key={row.id} label={participant?.display_name ?? row.participant_id} />;
        })}
      </RelationshipCard>
    </DetailFrame>
  );
}

export function InvoiceDetailPage({ payments, id }: { id: string; payments: AdminPaymentsSnapshot }) {
  if (payments.status !== "ready") {
    return <Unavailable title="Factuur niet beschikbaar" />;
  }

  const invoice = payments.data.invoices.find((entry) => entry.id === id);

  if (!invoice) {
    return <NotFound title="Factuur niet gevonden" backHref="/admin/payments" />;
  }

  const records = payments.data.paymentRecords.filter((entry) => entry.invoice_id === invoice.id);
  const refunds = payments.data.paymentRefunds.filter((entry) => entry.invoice_id === invoice.id);

  return (
    <DetailFrame backHref="/admin/payments" kicker="Factuur" title={invoice.invoice_number} status={invoice.status}>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<CircleDollarSign className="h-5 w-5" />} label="Factuurbedrag" value={formatMoney(invoice.amount_due_cents, invoice.currency)} />
        <Metric icon={<CircleDollarSign className="h-5 w-5" />} label="Betaald" value={formatMoney(invoice.amount_paid_cents, invoice.currency)} />
        <Metric icon={<CircleDollarSign className="h-5 w-5" />} label="Open" value={formatMoney(Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), invoice.currency)} />
      </div>
      <RelationshipCard title="Betalingen">{records.map((record) => <PlainLine detail={`${record.status} - ${formatMoney(record.amount_cents, record.currency)}`} key={record.id} label={record.payment_method} />)}</RelationshipCard>
      <RelationshipCard title="Correcties/refunds">{refunds.map((refund) => <PlainLine detail={`${refund.status} - ${formatMoney(refund.amount_cents, refund.currency)}`} key={refund.id} label={refund.reason ?? "Refund"} />)}</RelationshipCard>
    </DetailFrame>
  );
}

export function IntakeDetailPage({ id, placement }: { id: string; placement: PlacementWorkflowSnapshot }) {
  if (placement.status !== "ready") {
    return <Unavailable title="Intake niet beschikbaar" />;
  }

  const intake = placement.data.intakes.find((entry) => entry.id === id);

  if (!intake) {
    return <NotFound title="Intake niet gevonden" backHref="/admin/intake" />;
  }

  const waitlist = placement.data.waitlistEntries.find((entry) => entry.intake_submission_id === intake.id);
  const offers = placement.data.slotOffers.filter((entry) => entry.intake_submission_id === intake.id);

  return (
    <DetailFrame backHref="/admin/intake" kicker="Intake" title={intake.participant_name} status={intake.status}>
      <InfoGrid
        items={[
          ["Ouder", intake.parent_name],
          ["E-mail", intake.parent_email],
          ["Type", intake.intake_type],
          ["Voorkeuren", [...intake.preferred_days, ...intake.preferred_time_windows].join(", ") || "-"]
        ]}
      />
      <RelationshipCard title="Wachtlijst">{waitlist ? <PlainLine detail={waitlist.status} label="Wachtlijstregel" /> : null}</RelationshipCard>
      <RelationshipCard title="Slot offers">{offers.map((offer) => <PlainLine detail={offer.status} href={`/admin/slot-offers/${offer.id}`} key={offer.id} label={offer.offer_token.slice(0, 8)} />)}</RelationshipCard>
    </DetailFrame>
  );
}

function DetailFrame({ backHref, children, kicker, status, title }: { backHref: string; children: ReactNode; kicker: string; status: string; title: string }) {
  return (
    <div className="grid gap-6">
      <Link className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground" href={backHref}>
        <ArrowLeft className="h-4 w-4" />
        Terug
      </Link>
      <PageHeader action={<StatusPill tone={statusTone(status)}>{status}</StatusPill>} kicker={kicker} subtitle="Detailoverzicht met relaties, lifecycle-status en auditcontext." title={title} />
      {children}
    </div>
  );
}

function RelationshipCard({ children, title }: { children: ReactNode; title: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <StatusPill tone="neutral">{items.length}</StatusPill>
      </div>
      <div className="grid gap-3">{items.length > 0 ? items : <EmptyState>Geen records.</EmptyState>}</div>
    </Card>
  );
}

function EnrollmentLine({ domain, enrollment }: { domain: AdminDomainSnapshot; enrollment: EnrollmentRow }) {
  const program = domain.data.programs.find((entry) => entry.id === enrollment.program_id);
  const stage = domain.data.stages.find((entry) => entry.id === enrollment.current_stage_id);

  return <PlainLine detail={`${stage?.name ?? "Geen niveau"} - ${enrollment.status}`} label={program?.name ?? "Inschrijving"} />;
}

function MembershipLine({ domain, membership }: { domain: AdminDomainSnapshot; membership: GroupMembershipRow }) {
  const group = domain.data.groups.find((entry) => entry.id === membership.group_id);
  const enrollment = domain.data.enrollments.find((entry) => entry.id === membership.enrollment_id);
  const participant = enrollment ? domain.data.participants.find((entry) => entry.id === enrollment.participant_id) : null;

  return <PlainLine detail={`${participant?.display_name ?? "Leerling"} - ${membership.status}`} href={`/admin/groups/${membership.group_id}`} label={group?.name ?? "Groepsplaatsing"} />;
}

function GuardianLine({ guardian }: { guardian: ParticipantGuardianRow }) {
  return <PlainLine detail={`${guardian.relationship} - ${guardian.status}`} href={`/admin/guardians/${guardian.id}`} label={guardian.display_name ?? guardian.email ?? guardian.profile_id} />;
}

function PlainLine({ detail, href, label }: { detail: string; href?: string; label: string }) {
  const content = (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );

  return href ? (
    <Link className="block hover:opacity-85" href={href}>
      {content}
    </Link>
  ) : (
    content
  );
}

function InfoGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, value]) => (
          <div className="rounded-2xl border border-border bg-muted/35 p-4" key={label}>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
            <p className="mt-1 font-bold">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function AuditList({ rows }: { rows: Array<{ id: string; label: string; detail: string; date: string }> }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Audit</h2>
        <StatusPill tone="neutral">{rows.length}</StatusPill>
      </div>
      <div className="grid gap-3">
        {rows.length === 0 ? <EmptyState>Geen auditregels.</EmptyState> : null}
        {rows.map((row) => (
          <PlainLine detail={`${row.detail} - ${formatDateTime(row.date)}`} key={row.id} label={row.label} />
        ))}
      </div>
    </Card>
  );
}

function NotFound({ backHref, title }: { backHref: string; title: string }) {
  return (
    <Card>
      <h1 className="text-xl font-bold">{title}</h1>
      <Link className="mt-4 inline-flex text-sm font-semibold text-primary" href={backHref}>
        Terug naar overzicht
      </Link>
    </Card>
  );
}

function Unavailable({ title }: { title: string }) {
  return (
    <Card>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">De tenantdata is niet beschikbaar voor deze detailpagina.</p>
    </Card>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">{children}</div>;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "scheduled", "issued", "passed", "completed", "paid", "recorded", "sent"].includes(status)) {
    return "success";
  }

  if (["draft", "pending", "planned", "paused", "maintenance", "suggested", "open", "partially_paid", "queued"].includes(status)) {
    return "warning";
  }

  if (["cancelled", "revoked", "inactive", "suspended", "overdue", "failed", "email_failed"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function weekdayLabel(weekday: number) {
  return ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"][weekday - 1] ?? `Dag ${weekday}`;
}
