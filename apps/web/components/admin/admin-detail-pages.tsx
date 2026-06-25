import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, CalendarDays, CircleDollarSign, ClipboardList, FileText, ShieldCheck, UserRound, Users } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  createEnrollmentPeopleAction,
  createGroupMembershipPeopleAction,
  inviteParticipantGuardianAction,
  updateEnrollmentPeopleAction,
  updateGroupMembershipPeopleAction,
  updateParticipantPeopleAction
} from "@/lib/people/admin-people-actions";
import type { AdminDomainData, AdminDomainSnapshot, EnrollmentRow, GroupMembershipRow, ParticipantGuardianRow, ParticipantRow, TenantAccountInvitationRow } from "@/lib/domain/admin-domain-read-model";
import type { AdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import type { PlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";
import { refreshIntakeDuplicateMatchesAction } from "@/lib/placement/admin-placement-actions";

type DetailProps = {
  id: string;
  domain: AdminDomainSnapshot;
  tab?: string;
};

export function LearnerDetailPage({ domain, id, tab }: DetailProps) {
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
  const invitations = data.tenantAccountInvitations.filter((entry) => entry.participant_id === participant.id);
  const activeTab = learnerTabValue(tab);

  return (
    <DetailFrame backHref="/admin/leerlingen" kicker="Leerlingdossier" title={participant.display_name} status={participant.status}>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Users className="h-5 w-5" />} label="Inschrijvingen" value={enrollments.length.toString()} />
        <Metric icon={<UserRound className="h-5 w-5" />} label="Ouders/verzorgers" value={guardians.length.toString()} />
        <Metric icon={<CalendarDays className="h-5 w-5" />} label="Groepsplaatsingen" value={memberships.length.toString()} />
      </div>
      <LearnerTabs activeTab={activeTab} participantId={participant.id} />
      {activeTab === "profiel" ? <LearnerProfileTab participant={participant} /> : null}
      {activeTab === "ouders" ? <LearnerGuardianTab domain={domain} guardians={guardians} invitations={invitations} participant={participant} /> : null}
      {activeTab === "account" ? <LearnerAccountTab domain={domain} guardians={guardians} invitations={invitations} participant={participant} /> : null}
      {activeTab === "inschrijvingen" ? <LearnerEnrollmentTab data={data} enrollments={enrollments} participant={participant} /> : null}
      {activeTab === "audit" ? <AuditList rows={audit.map((event) => ({ id: event.id, label: event.event_type, detail: event.summary, date: event.created_at }))} /> : null}
    </DetailFrame>
  );
}

type LearnerTab = "profiel" | "ouders" | "account" | "inschrijvingen" | "audit";

function learnerTabValue(value: string | undefined): LearnerTab {
  return ["profiel", "ouders", "account", "inschrijvingen", "audit"].includes(value ?? "") ? (value as LearnerTab) : "profiel";
}

function LearnerTabs({ activeTab, participantId }: { activeTab: LearnerTab; participantId: string }) {
  const tabs: Array<{ value: LearnerTab; label: string; icon: ReactNode }> = [
    { value: "profiel", label: "Profiel beheren", icon: <UserRound className="h-4 w-4" /> },
    { value: "ouders", label: "Ouders", icon: <Users className="h-4 w-4" /> },
    { value: "account", label: "Accountstatus", icon: <ShieldCheck className="h-4 w-4" /> },
    { value: "inschrijvingen", label: "Inschrijvingen & groepsplaatsingen", icon: <ClipboardList className="h-4 w-4" /> },
    { value: "audit", label: "Audit", icon: <FileText className="h-4 w-4" /> }
  ];

  return (
    <Card className="p-2">
      <nav className="flex flex-wrap gap-2" aria-label="Leerlingdossier tabs">
        {tabs.map((item) => (
          <Link
            key={item.value}
            className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition ${activeTab === item.value ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            href={`/admin/leerlingen/${participantId}?tab=${item.value}`}
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
    </Card>
  );
}

function LearnerProfileTab({ participant }: { participant: ParticipantRow }) {
  return (
    <Card>
      <SectionTitle title="Profiel beheren" />
      <form action={updateParticipantPeopleAction} className="grid gap-4">
        <input name="id" type="hidden" value={participant.id} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextField defaultValue={participant.display_name} label="Naam" name="display_name" required />
          <TextField defaultValue={participant.birthdate ?? ""} label="Geboortedatum" name="birthdate" type="date" />
          <TextField defaultValue={participant.external_reference} label="Referentie" name="external_reference" />
          <SelectField defaultValue={participant.status} label="Status" name="status" options={participantStatusOptions} />
        </div>
        <SubmitButton>Profiel opslaan</SubmitButton>
      </form>
    </Card>
  );
}

function LearnerGuardianTab({ domain, guardians, invitations, participant }: { domain: AdminDomainSnapshot; guardians: ParticipantGuardianRow[]; invitations: TenantAccountInvitationRow[]; participant: ParticipantRow }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <SectionTitle title="Ouder/verzorger uitnodigen" />
        <form action={inviteParticipantGuardianAction} className="grid gap-3">
          <input name="participant_id" type="hidden" value={participant.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="Naam" name="guardian_full_name" />
            <TextField label="E-mail" name="guardian_email" required type="email" />
            <SelectField label="Relatie" name="guardian_relationship" options={guardianRelationshipOptions} />
          </div>
          <p className="text-xs text-muted-foreground">Maakt of koppelt het ouderaccount, zet tijdelijke wachtwoordwissel aan en probeert de uitnodiging te mailen.</p>
          <SubmitButton>Uitnodigen/koppelen</SubmitButton>
        </form>
      </Card>
      <Card>
        <SectionTitle title="Gekoppelde ouders" />
        <div className="grid gap-3">
          {guardians.length === 0 && invitations.length === 0 ? <EmptyState>Geen ouder/verzorger gekoppeld.</EmptyState> : null}
          {guardians.map((guardian) => <GuardianAccountLine domain={domain} guardian={guardian} key={guardian.id} />)}
          {invitations.map((invite) => <InvitationLine invite={invite} key={invite.id} />)}
        </div>
      </Card>
    </div>
  );
}

function LearnerAccountTab({ domain, guardians, invitations, participant }: { domain: AdminDomainSnapshot; guardians: ParticipantGuardianRow[]; invitations: TenantAccountInvitationRow[]; participant: ParticipantRow }) {
  const activeGuardians = guardians.filter((guardian) => guardian.status === "active");
  const failedInvitations = invitations.filter((invite) => invite.status === "email_failed");

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Metric icon={<UserRound className="h-5 w-5" />} label="Actieve accounts" value={activeGuardians.length.toString()} />
      <Metric icon={<MailIcon />} label="Uitnodigingen" value={invitations.length.toString()} />
      <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Mailfouten" value={failedInvitations.length.toString()} />
      <Card className="md:col-span-3">
        <SectionTitle title="Accountstatus" />
        <div className="grid gap-3">
          {guardians.length === 0 && invitations.length === 0 ? <EmptyState>Geen accountkoppeling voor {participant.display_name}.</EmptyState> : null}
          {guardians.map((guardian) => <GuardianAccountLine domain={domain} guardian={guardian} key={guardian.id} />)}
          {invitations.map((invite) => <InvitationLine invite={invite} key={invite.id} />)}
        </div>
      </Card>
    </div>
  );
}

function MailIcon() {
  return <FileText className="h-5 w-5" />;
}

function LearnerEnrollmentTab({ data, enrollments, participant }: { data: AdminDomainData; enrollments: EnrollmentRow[]; participant: ParticipantRow }) {
  return (
    <div className="grid gap-4">
      <Card>
        <SectionTitle title="Nieuwe inschrijving" />
        <EnrollmentCreateForm data={data} participantId={participant.id} />
      </Card>
      {enrollments.length === 0 ? <Card><EmptyState>Nog geen inschrijving.</EmptyState></Card> : null}
      {enrollments.map((enrollment) => <EnrollmentManagementCard data={data} enrollment={enrollment} key={enrollment.id} />)}
    </div>
  );
}

function EnrollmentCreateForm({ data, participantId }: { data: AdminDomainData; participantId: string }) {
  return (
    <form action={createEnrollmentPeopleAction} className="grid gap-3">
      <input name="participant_id" type="hidden" value={participantId} />
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Referentie" name="external_reference" />
        <SelectField label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
        <SelectField includeEmpty label="Huidig niveau" name="current_stage_id" options={data.stages.map(optionFromName)} />
        <SelectField includeEmpty label="Abonnement" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
        <TextField defaultValue={todayInput()} label="Startdatum" name="started_on" required type="date" />
        <TextField label="Einddatum" name="ended_on" type="date" />
        <SelectField label="Status" name="status" options={enrollmentStatusOptions} />
      </div>
      <SubmitButton>Inschrijving opslaan</SubmitButton>
    </form>
  );
}

function EnrollmentManagementCard({ data, enrollment }: { data: AdminDomainData; enrollment: EnrollmentRow }) {
  const memberships = data.groupMemberships.filter((membership) => membership.enrollment_id === enrollment.id);
  const program = data.programs.find((entry) => entry.id === enrollment.program_id);
  const stage = data.stages.find((entry) => entry.id === enrollment.current_stage_id);
  const subscriptionPlan = data.subscriptionPlans.find((entry) => entry.id === enrollment.subscription_plan_id);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{program?.name ?? "Inschrijving"}</h2>
          <p className="text-sm text-muted-foreground">Niveau: {stage?.name ?? "-"} | Abonnement: {subscriptionPlan?.name ?? "-"}</p>
        </div>
        <StatusPill tone={statusTone(enrollment.status)}>{enrollment.status}</StatusPill>
      </div>
      <form action={updateEnrollmentPeopleAction} className="grid gap-3">
        <input name="id" type="hidden" value={enrollment.id} />
        <input name="participant_id" type="hidden" value={enrollment.participant_id} />
        <div className="grid gap-3 md:grid-cols-3">
          <TextField defaultValue={enrollment.external_reference} label="Referentie" name="external_reference" />
          <SelectField defaultValue={enrollment.program_id} label="Programma" name="program_id" options={data.programs.map(optionFromName)} required />
          <SelectField defaultValue={enrollment.current_stage_id ?? ""} includeEmpty label="Huidig niveau" name="current_stage_id" options={data.stages.map(optionFromName)} />
          <SelectField defaultValue={enrollment.subscription_plan_id ?? ""} includeEmpty label="Abonnement" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
          <TextField defaultValue={enrollment.started_on} label="Startdatum" name="started_on" required type="date" />
          <TextField defaultValue={enrollment.ended_on ?? ""} label="Einddatum" name="ended_on" type="date" />
          <SelectField defaultValue={enrollment.status} label="Status" name="status" options={enrollmentStatusOptions} />
        </div>
        <SubmitButton>Inschrijving bijwerken</SubmitButton>
      </form>
      <div className="mt-5 rounded-2xl border border-border bg-muted/35 p-4">
        <SectionTitle title="Groepsplaatsingen" />
        <GroupMembershipCreateForm data={data} enrollmentId={enrollment.id} />
        <div className="mt-4 grid gap-3">
          {memberships.length === 0 ? <EmptyState>Nog geen groepsplaatsing.</EmptyState> : null}
          {memberships.map((membership) => <GroupMembershipEditForm data={data} membership={membership} key={membership.id} />)}
        </div>
      </div>
    </Card>
  );
}

function GroupMembershipCreateForm({ data, enrollmentId }: { data: AdminDomainData; enrollmentId: string }) {
  return (
    <form action={createGroupMembershipPeopleAction} className="grid gap-3">
      <input name="enrollment_id" type="hidden" value={enrollmentId} />
      <div className="grid gap-3 md:grid-cols-4">
        <SelectField label="Groep" name="group_id" options={data.groups.map(optionFromName)} required />
        <TextField defaultValue={todayInput()} label="Startdatum" name="starts_on" required type="date" />
        <TextField label="Einddatum" name="ends_on" type="date" />
        <SelectField label="Status" name="status" options={membershipStatusOptions} />
      </div>
      <SubmitButton>Nieuwe groepsplaatsing</SubmitButton>
    </form>
  );
}

function GroupMembershipEditForm({ data, membership }: { data: AdminDomainData; membership: GroupMembershipRow }) {
  const group = data.groups.find((entry) => entry.id === membership.group_id);

  return (
    <details className="rounded-2xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-bold">{group?.name ?? "Groep"} - {membership.status}</summary>
      <form action={updateGroupMembershipPeopleAction} className="mt-3 grid gap-3">
        <input name="id" type="hidden" value={membership.id} />
        <input name="enrollment_id" type="hidden" value={membership.enrollment_id} />
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField defaultValue={membership.group_id} label="Groep" name="group_id" options={data.groups.map(optionFromName)} required />
          <TextField defaultValue={membership.starts_on} label="Startdatum" name="starts_on" required type="date" />
          <TextField defaultValue={membership.ends_on ?? ""} label="Einddatum" name="ends_on" type="date" />
          <SelectField defaultValue={membership.status} label="Status" name="status" options={membershipStatusOptions} />
        </div>
        <SubmitButton>Plaatsing bijwerken</SubmitButton>
      </form>
    </details>
  );
}

function GuardianAccountLine({ domain, guardian }: { domain: AdminDomainSnapshot; guardian: ParticipantGuardianRow }) {
  const profile = domain.data.profiles.find((entry) => entry.id === guardian.profile_id);

  return (
    <Link className="block rounded-2xl border border-border bg-muted/35 p-4 hover:bg-muted" href={`/admin/guardians/${guardian.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{guardian.display_name ?? profile?.full_name ?? guardian.email ?? "Ouder/verzorger"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{guardian.email ?? "Geen e-mail override"} | {guardian.relationship}</p>
        </div>
        <StatusPill tone={statusTone(guardian.status)}>{guardian.status}</StatusPill>
      </div>
    </Link>
  );
}

function InvitationLine({ invite }: { invite: TenantAccountInvitationRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{invite.full_name ?? invite.email}</p>
          <p className="mt-1 text-sm text-muted-foreground">{invite.email} | verloopt {formatDateTime(invite.expires_at)}</p>
          {invite.error_message ? <p className="mt-1 text-sm text-red-700">{invite.error_message}</p> : null}
        </div>
        <StatusPill tone={invite.status === "email_failed" ? "danger" : invite.status === "sent" ? "success" : "warning"}>{invite.status}</StatusPill>
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="mb-4 text-lg font-bold">{title}</h2>;
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
  const duplicateMatches = placement.data.intakeDuplicateMatches.filter((entry) => entry.intake_submission_id === intake.id);
  const events = placement.data.intakeEvents.filter((entry) => entry.submission_id === intake.id);
  const decision = placement.data.smartDecisions.find((entry) => entry.engine_key === "intake_recommendation" && entry.subject_id === intake.id);
  const recommendedStage = typeof intake.recommendation_snapshot.recommended_stage_label === "string" ? intake.recommendation_snapshot.recommended_stage_label : "-";
  const recommendationScore = typeof intake.recommendation_snapshot.score === "number" ? `${intake.recommendation_snapshot.score}/100` : "-";

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
      <RelationshipCard title="Smart intake advies">
        <div className="rounded-2xl border border-border bg-muted/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">Aanbevolen niveau: {recommendedStage}</p>
              <p className="mt-1 text-sm text-muted-foreground">Score: {recommendationScore} | Confidence: {decision?.confidence ?? "-"}</p>
              {intake.missing_information.length > 0 ? <p className="mt-2 text-sm font-semibold text-amber-700">Ontbrekend: {intake.missing_information.join(" ")}</p> : null}
            </div>
            <StatusPill tone={decision?.confidence === "high" ? "success" : decision?.confidence === "medium" ? "info" : "warning"}>{decision?.decision_status ?? "geen decision"}</StatusPill>
          </div>
          {decision?.reasons_json.length ? (
            <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
              {decision.reasons_json.slice(0, 4).map((reason) => (
                <p key={`${reason.code ?? reason.label}`}>
                  <span className="font-semibold text-foreground">{reason.label ?? reason.code}</span>
                  {reason.detail ? ` - ${reason.detail}` : ""}
                </p>
              ))}
            </div>
          ) : null}
          {decision?.override_reason ? <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800">Override: {decision.override_reason}</p> : null}
        </div>
      </RelationshipCard>
      <RelationshipCard title="Duplicaatcontrole">
        <div className="grid gap-3">
          <form action={refreshIntakeDuplicateMatchesAction}>
            <input name="intake_submission_id" type="hidden" value={intake.id} />
            <button className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted" type="submit">
              Duplicaten opnieuw checken
            </button>
          </form>
          {duplicateMatches.length === 0 ? <EmptyState>Geen open duplicaatwaarschuwingen.</EmptyState> : null}
          {duplicateMatches.map((match) => (
            <PlainLine detail={`${match.severity} - ${match.score}/100${match.detail ? ` - ${match.detail}` : ""}`} key={match.id} label={match.label} />
          ))}
        </div>
      </RelationshipCard>
      <RelationshipCard title="Wachtlijst">{waitlist ? <PlainLine detail={waitlist.status} label="Wachtlijstregel" /> : null}</RelationshipCard>
      <RelationshipCard title="Slot offers">{offers.map((offer) => <PlainLine detail={offer.status} href={`/admin/slot-offers/${offer.id}`} key={offer.id} label={offer.offer_token.slice(0, 8)} />)}</RelationshipCard>
      <RelationshipCard title="Intake timeline">
        {events.map((event) => <PlainLine detail={`${event.status} - ${formatDateTime(event.created_at)}`} key={event.id} label={event.note ?? "Statuswijziging"} />)}
      </RelationshipCard>
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

function TextField({ defaultValue, label, name, required, type = "text" }: { defaultValue?: string | null; label: string; name: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required} type={type} />
    </label>
  );
}

function SelectField({
  defaultValue,
  includeEmpty,
  label,
  name,
  options,
  required
}: {
  defaultValue?: string | null;
  includeEmpty?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required}>
        {includeEmpty || required ? <option value="">{required ? "Selecteer" : "-"}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubmitButton({ children }: { children: ReactNode }) {
  return (
    <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
      {children}
    </button>
  );
}

function optionFromName(row: { id: string; name: string }) {
  return {
    label: row.name,
    value: row.id
  };
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
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

const fieldClassName = "min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";

const guardianRelationshipOptions = [
  { label: "Ouder", value: "parent" },
  { label: "Verzorger", value: "guardian" },
  { label: "Leerling zelf", value: "athlete_self" }
];

const participantStatusOptions = [
  { label: "Actief", value: "active" },
  { label: "Inactief", value: "inactive" },
  { label: "Gearchiveerd", value: "archived" }
];

const enrollmentStatusOptions = [
  { label: "In afwachting", value: "pending" },
  { label: "Actief", value: "active" },
  { label: "Gepauzeerd", value: "paused" },
  { label: "Afgerond", value: "completed" },
  { label: "Geannuleerd", value: "cancelled" }
];

const membershipStatusOptions = [
  { label: "Gepland", value: "planned" },
  { label: "Actief", value: "active" },
  { label: "Beeindigd", value: "ended" },
  { label: "Geannuleerd", value: "cancelled" }
];
