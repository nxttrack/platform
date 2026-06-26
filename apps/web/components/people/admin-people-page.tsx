import { AlertTriangle, CheckCircle2, ClipboardList, Eye, Link2, Mail, ShieldCheck, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import { CreateLearnerModalFrame } from "@/components/people/create-learner-modal";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  EnrollmentRow,
  GroupMembershipRow,
  GroupRow,
  ParticipantGuardianRow,
  ParticipantRow,
  PeopleAuditEventRow,
  ProfileRow,
  TenantAccountInvitationRow
} from "@/lib/domain/admin-domain-read-model";
import {
  createEnrollmentPeopleAction,
  createGroupMembershipPeopleAction,
  createLearnerOperationsFlowAction,
  inviteParticipantGuardianAction,
  updateEnrollmentPeopleAction,
  updateGroupMembershipPeopleAction,
  updateParticipantPeopleAction
} from "@/lib/people/admin-people-actions";

type Props = {
  snapshot: AdminDomainSnapshot;
};

type LookupMaps = {
  participants: Map<string, ParticipantRow>;
  profiles: Map<string, ProfileRow>;
  groups: Map<string, GroupRow>;
  enrollments: Map<string, EnrollmentRow>;
  guardiansByParticipant: Map<string, ParticipantGuardianRow[]>;
  enrollmentsByParticipant: Map<string, EnrollmentRow[]>;
  membershipsByEnrollment: Map<string, GroupMembershipRow[]>;
  invitationsByParticipant: Map<string, TenantAccountInvitationRow[]>;
  auditByParticipant: Map<string, PeopleAuditEventRow[]>;
};

type DuplicateSignal = {
  key: string;
  title: string;
  body: string;
  tone: "warning" | "danger" | "info";
};

export function AdminPeopleOperationsPage({ snapshot }: Props) {
  if (snapshot.status !== "ready") {
    return <StatusPanel snapshot={snapshot} />;
  }

  const lookups = buildLookups(snapshot.data);
  const duplicates = buildDuplicateSignals(snapshot.data);
  const activeParticipants = snapshot.data.participants.filter((participant) => participant.status === "active");
  const activeEnrollments = snapshot.data.enrollments.filter((enrollment) => enrollment.status === "active");
  const linkedParents = snapshot.data.participantGuardians.filter((guardian) => guardian.status === "active").length;
  const pendingInvites = snapshot.data.tenantAccountInvitations.filter((invitation) => ["created", "sent", "email_failed"].includes(invitation.status)).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="success">Productiewaardig beheer</StatusPill>}
        kicker="Backoffice - leerlingen"
        subtitle="Beheer leerlingprofiel, ouder/verzorger-account, inschrijving en actieve groepsplaatsing vanuit een samenhangende flow. Niveau en abonnement blijven bewust gescheiden."
        title="Leerlingen en ouders"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Users className="h-5 w-5" />} label="Actieve leerlingen" value={activeParticipants.length.toString()} detail={`${snapshot.data.participants.length} totaal`} />
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Actieve inschrijvingen" value={activeEnrollments.length.toString()} detail="programma deelname" />
        <MetricCard icon={<Link2 className="h-5 w-5" />} label="Ouderkoppelingen" value={linkedParents.toString()} detail="actieve verzorgers" />
        <MetricCard icon={<Mail className="h-5 w-5" />} label="Uitnodigingen" value={pendingInvites.toString()} detail="open of recent" />
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeader count={snapshot.data.participants.length} icon={<Users className="h-5 w-5" />} title="Leerlingdossiers" />
          <div className="flex flex-wrap items-center gap-2">
            <DuplicateIndicator data={snapshot.data} signals={duplicates} />
            <CreateLearnerModal data={snapshot.data} duplicateCount={duplicates.length} />
            <ExportLink href="/api/admin-exports/participants/download">Leerlingen CSV</ExportLink>
            <ExportLink href="/api/admin-exports/guardians/download">Ouders CSV</ExportLink>
          </div>
        </div>
        <LearnerRowsTable data={snapshot.data} lookups={lookups} />
      </Card>
    </div>
  );
}

function LearnerRowsTable({ data, lookups }: { data: AdminDomainData; lookups: LookupMaps }) {
  if (data.participants.length === 0) {
    return <EmptyState>Geen leerlingen gevonden.</EmptyState>;
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-max min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Leerling</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Ouders</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Accountstatus</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Inschrijving</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Groepsplaatsing</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Audit</th>
            <th className="whitespace-nowrap px-3 py-3 font-semibold">Actie</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.participants.map((participant) => {
            const guardians = lookups.guardiansByParticipant.get(participant.id) ?? [];
            const enrollments = lookups.enrollmentsByParticipant.get(participant.id) ?? [];
            const activeEnrollment = enrollments.find((enrollment) => enrollment.status === "active") ?? enrollments[0] ?? null;
            const memberships = enrollments.flatMap((enrollment) => lookups.membershipsByEnrollment.get(enrollment.id) ?? []);
            const activeMembership = memberships.find((membership) => ["planned", "active"].includes(membership.status)) ?? memberships[0] ?? null;
            const group = activeMembership ? lookups.groups.get(activeMembership.group_id) : null;
            const program = activeEnrollment ? data.programs.find((entry) => entry.id === activeEnrollment.program_id) : null;
            const stage = activeEnrollment?.current_stage_id ? data.stages.find((entry) => entry.id === activeEnrollment.current_stage_id) : null;
            const invitations = lookups.invitationsByParticipant.get(participant.id) ?? [];
            const auditEvents = lookups.auditByParticipant.get(participant.id) ?? [];
            const hasFailedInvite = invitations.some((invite) => invite.status === "email_failed");
            const activeGuardians = guardians.filter((guardian) => guardian.status === "active");

            return (
              <tr key={participant.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-4">
                  <div className="min-w-[220px]">
                    <Link className="font-bold text-primary hover:underline" href={`/admin/leerlingen/${participant.id}`}>
                      {participant.display_name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">{participant.birthdate ? formatDate(participant.birthdate) : "Geboortedatum onbekend"}</p>
                    <p className="text-xs text-muted-foreground">{participant.external_reference ?? "geen referentie"}</p>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <StatusPill tone={activeGuardians.length > 0 ? "success" : "warning"}>{activeGuardians.length} actief</StatusPill>
                  <p className="mt-1 text-xs text-muted-foreground">{guardians.length} koppeling(en)</p>
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <StatusPill tone={hasFailedInvite ? "danger" : invitations.length > 0 ? "warning" : "neutral"}>{hasFailedInvite ? "mailfout" : invitations.length > 0 ? "uitnodiging" : "geen uitnodiging"}</StatusPill>
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <p className="font-semibold">{program?.name ?? "Geen inschrijving"}</p>
                  <p className="text-xs text-muted-foreground">{stage?.name ?? "geen niveau"} - {activeEnrollment?.status ?? "-"}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <p className="font-semibold">{group?.name ?? "Geen groep"}</p>
                  <p className="text-xs text-muted-foreground">{activeMembership?.status ?? "-"}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <StatusPill tone="neutral">{auditEvents.length}</StatusPill>
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <Link className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-soft hover:bg-primary/90" href={`/admin/leerlingen/${participant.id}`}>
                    <Eye className="h-4 w-4" />
                    Details / acties
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CreateLearnerModal({ data, duplicateCount }: { data: AdminDomainData; duplicateCount: number }) {
  return (
    <CreateLearnerModalFrame duplicateCount={duplicateCount}>
      <CreateLearnerFlowForm data={data} />
    </CreateLearnerModalFrame>
  );
}

function DuplicateIndicator({ data, signals }: { data: AdminDomainData; signals: DuplicateSignal[] }) {
  const tone = signals.some((signal) => signal.tone === "danger") ? "danger" : signals.length > 0 ? "warning" : "success";

  return (
    <details className="group relative">
      <summary className={`inline-flex cursor-pointer list-none items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold shadow-soft focus-visible:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden ${tone === "danger" ? "border-red-200 bg-red-50 text-red-700 focus-visible:ring-red-500/30" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800 focus-visible:ring-amber-500/30" : "border-emerald-200 bg-emerald-50 text-emerald-700 focus-visible:ring-emerald-500/30"}`}>
        <AlertTriangle className="h-4 w-4" />
        Duplicaatcheck {signals.length}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-border bg-card p-4 shadow-card">
        <p className="text-sm font-bold">Duplicaatcontrole</p>
        <div className="mt-3 grid gap-2">
          {signals.length === 0 ? <p className="rounded-2xl bg-emerald-500/10 p-3 text-sm text-emerald-800">Geen mogelijke duplicaten gevonden.</p> : null}
          {signals.map((signal) => {
            const match = findDuplicateTarget(data, signal);
            return (
              <Link key={signal.key} className="block rounded-2xl border border-border bg-muted/35 p-3 hover:bg-muted" href={match ? `/admin/leerlingen/${match.id}` : "/admin/leerlingen"}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{signal.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{signal.body}</p>
                  </div>
                  <StatusPill tone={signal.tone}>{signal.tone}</StatusPill>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function findDuplicateTarget(data: AdminDomainData, signal: DuplicateSignal) {
  if (signal.key.startsWith("participant-")) {
    const [, identity] = signal.key.split("participant-");
    return data.participants.find((participant) => `${normalizeText(participant.display_name)}|${participant.birthdate ?? ""}` === identity) ?? null;
  }

  if (signal.key.startsWith("guardian-")) {
    const email = signal.key.replace("guardian-", "");
    const guardian = data.participantGuardians.find((entry) => entry.email?.toLowerCase() === email);
    return guardian ? data.participants.find((participant) => participant.id === guardian.participant_id) ?? null : null;
  }

  return null;
}

function CreateLearnerFlowForm({ data }: { data: AdminDomainData }) {
  return (
    <form action={createLearnerOperationsFlowAction} className="mt-4 grid gap-5">
      <fieldset className={fieldsetClassName}>
        <legend className={legendClassName}>Leerlingprofiel</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Naam leerling" name="participant_display_name" required />
          <TextField label="Geboortedatum" name="participant_birthdate" type="date" />
          <TextField label="Referentie" name="participant_external_reference" />
        </div>
      </fieldset>

      <fieldset className={fieldsetClassName}>
        <legend className={legendClassName}>Ouder/verzorger uitnodigen</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <TextField label="Naam ouder/verzorger" name="guardian_full_name" />
          <TextField label="E-mail ouder/verzorger" name="guardian_email" type="email" />
          <SelectField label="Relatie" name="guardian_relationship" options={guardianRelationshipOptions} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Bij een e-mailadres wordt het ouderaccount aangemaakt of gekoppeld en krijgt de ouder een tijdelijk wachtwoord.</p>
      </fieldset>

      <fieldset className={fieldsetClassName}>
        <legend className={legendClassName}>Inschrijving en plaatsing</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField includeEmpty label="Programma" name="program_id" options={data.programs.map(optionFromName)} />
          <SelectField includeEmpty label="Huidig niveau" name="current_stage_id" options={data.stages.map(optionFromName)} />
          <SelectField includeEmpty label="Abonnement" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
          <TextField defaultValue={todayInput()} label="Start inschrijving" name="started_on" type="date" />
          <SelectField label="Status inschrijving" name="enrollment_status" options={enrollmentStatusOptions} />
          <SelectField includeEmpty label="Groep" name="group_id" options={data.groups.map(optionFromName)} />
          <TextField defaultValue={todayInput()} label="Start plaatsing" name="membership_starts_on" type="date" />
          <SelectField label="Status plaatsing" name="membership_status" options={membershipStatusOptions} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Abonnement bepaalt billing. Huidig niveau bepaalt voortgang. Die twee blijven los.</p>
      </fieldset>

      <button className="inline-flex w-fit items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        <UserPlus className="h-4 w-4" /> Leerlingflow aanmaken
      </button>
    </form>
  );
}

function LearnerDossierCard({ data, lookups, participant }: { data: AdminDomainData; lookups: LookupMaps; participant: ParticipantRow }) {
  const guardians = lookups.guardiansByParticipant.get(participant.id) ?? [];
  const enrollments = lookups.enrollmentsByParticipant.get(participant.id) ?? [];
  const invitations = lookups.invitationsByParticipant.get(participant.id) ?? [];
  const auditEvents = lookups.auditByParticipant.get(participant.id) ?? [];
  const activeGuardianCount = guardians.filter((guardian) => guardian.status === "active").length;

  return (
    <article className="rounded-3xl border border-border bg-muted/35 p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link className="text-lg font-bold text-primary hover:underline" href={`/admin/leerlingen/${participant.id}`}>
            {participant.display_name}
          </Link>
          <p className="text-sm text-muted-foreground">
            {participant.birthdate ? formatDate(participant.birthdate) : "Geboortedatum onbekend"} - {participant.external_reference ?? "geen referentie"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusTone(participant.status)}>{participant.status}</StatusPill>
          <StatusPill tone={activeGuardianCount > 0 ? "success" : "warning"}>{activeGuardianCount > 0 ? "ouder gekoppeld" : "ouder mist"}</StatusPill>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="grid gap-4">
          <SectionBox title="Profiel beheren">
            <ParticipantEditForm participant={participant} />
          </SectionBox>

          <SectionBox title="Ouder/verzorger uitnodigen">
            <InviteGuardianForm participantId={participant.id} />
          </SectionBox>
        </div>

        <div className="grid gap-4">
          <SectionBox title="Ouders en accountstatus">
            <GuardianList guardians={guardians} invitations={invitations} lookups={lookups} />
          </SectionBox>

          <SectionBox title="Inschrijvingen en groepsplaatsingen">
            <EnrollmentManagement data={data} enrollments={enrollments} lookups={lookups} participantId={participant.id} />
          </SectionBox>

          <SectionBox title="Dossier-audit">
            <AuditTrail compact events={auditEvents.slice(0, 5)} lookups={lookups} />
          </SectionBox>
        </div>
      </div>
    </article>
  );
}

function ParticipantEditForm({ participant }: { participant: ParticipantRow }) {
  return (
    <form action={updateParticipantPeopleAction} className="grid gap-3">
      <input name="id" type="hidden" value={participant.id} />
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={participant.display_name} label="Naam" name="display_name" required />
        <TextField defaultValue={participant.birthdate ?? ""} label="Geboortedatum" name="birthdate" type="date" />
        <TextField defaultValue={participant.external_reference} label="Referentie" name="external_reference" />
        <SelectField defaultValue={participant.status} label="Status" name="status" options={participantStatusOptions} />
      </div>
      <SubmitButton>Profiel opslaan</SubmitButton>
    </form>
  );
}

function InviteGuardianForm({ participantId }: { participantId: string }) {
  return (
    <form action={inviteParticipantGuardianAction} className="grid gap-3">
      <input name="participant_id" type="hidden" value={participantId} />
      <div className="grid gap-3 md:grid-cols-3">
        <TextField label="Naam" name="guardian_full_name" />
        <TextField label="E-mail" name="guardian_email" required type="email" />
        <SelectField label="Relatie" name="guardian_relationship" options={guardianRelationshipOptions} />
      </div>
      <SubmitButton>Uitnodigen/koppelen</SubmitButton>
    </form>
  );
}

function GuardianList({ guardians, invitations, lookups }: { guardians: ParticipantGuardianRow[]; invitations: TenantAccountInvitationRow[]; lookups: LookupMaps }) {
  if (guardians.length === 0 && invitations.length === 0) {
    return <EmptyState>Nog geen ouder/verzorger gekoppeld.</EmptyState>;
  }

  return (
    <div className="grid gap-2">
      {guardians.map((guardian) => {
        const profile = lookups.profiles.get(guardian.profile_id);

        return (
          <div key={guardian.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link className="font-semibold text-primary underline-offset-4 hover:underline" href={`/admin/guardians/${guardian.id}`}>
                  {guardian.display_name ?? profile?.full_name ?? guardian.email ?? "Ouder/verzorger"}
                </Link>
                <p className="text-xs text-muted-foreground">{guardian.email ?? "Geen e-mail override"} - {guardian.relationship}</p>
              </div>
              <StatusPill tone={statusTone(guardian.status)}>{guardian.status}</StatusPill>
            </div>
          </div>
        );
      })}
      {invitations.map((invitation) => (
        <div key={invitation.id} className="rounded-2xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">{invitation.full_name ?? invitation.email}</p>
              <p className="text-xs text-muted-foreground">
                {invitation.email} - verloopt {formatDateTime(invitation.expires_at)}
              </p>
              {invitation.error_message ? <p className="mt-1 text-xs text-danger">{invitation.error_message}</p> : null}
            </div>
            <StatusPill tone={invitation.status === "sent" ? "success" : invitation.status === "email_failed" ? "danger" : "warning"}>{invitation.status}</StatusPill>
          </div>
        </div>
      ))}
    </div>
  );
}

function EnrollmentManagement({ data, enrollments, lookups, participantId }: { data: AdminDomainData; enrollments: EnrollmentRow[]; lookups: LookupMaps; participantId: string }) {
  return (
    <div className="grid gap-3">
      <details className="rounded-2xl border border-border bg-card p-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">Nieuwe inschrijving voor deze leerling</summary>
        <div className="mt-3">
          <EnrollmentForm data={data} participantId={participantId} />
        </div>
      </details>

      {enrollments.length === 0 ? <EmptyState>Nog geen inschrijving.</EmptyState> : null}
      {enrollments.map((enrollment) => (
        <EnrollmentCard key={enrollment.id} data={data} enrollment={enrollment} lookups={lookups} />
      ))}
    </div>
  );
}

function EnrollmentCard({ data, enrollment, lookups }: { data: AdminDomainData; enrollment: EnrollmentRow; lookups: LookupMaps }) {
  const memberships = lookups.membershipsByEnrollment.get(enrollment.id) ?? [];
  const program = data.programs.find((entry) => entry.id === enrollment.program_id);
  const stage = data.stages.find((entry) => entry.id === enrollment.current_stage_id);
  const subscriptionPlan = data.subscriptionPlans.find((entry) => entry.id === enrollment.subscription_plan_id);

  return (
    <details className="rounded-2xl border border-border bg-card p-3" open={enrollment.status === "active"}>
      <summary className="cursor-pointer">
        <div className="inline-flex flex-wrap items-center gap-2">
          <span className="font-semibold">{program?.name ?? "Programma"}</span>
          <StatusPill tone={statusTone(enrollment.status)}>{enrollment.status}</StatusPill>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Niveau: {stage?.name ?? "-"} - Abonnement: {subscriptionPlan?.name ?? "-"}
        </p>
      </summary>
      <div className="mt-4 grid gap-4">
        <EnrollmentEditForm data={data} enrollment={enrollment} />

        <div className="rounded-2xl border border-border bg-muted/35 p-3">
          <p className="mb-3 text-sm font-bold">Groepsplaatsingen</p>
          <details className="mb-3 rounded-xl border border-border bg-card p-3">
            <summary className="cursor-pointer text-sm font-semibold text-primary">Nieuwe groepsplaatsing</summary>
            <div className="mt-3">
              <GroupMembershipCreateForm data={data} enrollmentId={enrollment.id} />
            </div>
          </details>
          <div className="grid gap-2">
            {memberships.length === 0 ? <EmptyState>Nog geen groep gekoppeld.</EmptyState> : null}
            {memberships.map((membership) => (
              <GroupMembershipEditForm key={membership.id} data={data} membership={membership} />
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

function EnrollmentForm({ data, participantId }: { data: AdminDomainData; participantId: string }) {
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

function EnrollmentEditForm({ data, enrollment }: { data: AdminDomainData; enrollment: EnrollmentRow }) {
  return (
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
  );
}

function GroupMembershipCreateForm({ data, enrollmentId }: { data: AdminDomainData; enrollmentId: string }) {
  return (
    <form action={createGroupMembershipPeopleAction} className="grid gap-3">
      <input name="enrollment_id" type="hidden" value={enrollmentId} />
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField label="Groep" name="group_id" options={data.groups.map(optionFromName)} required />
        <TextField defaultValue={todayInput()} label="Startdatum" name="starts_on" required type="date" />
        <TextField label="Einddatum" name="ends_on" type="date" />
        <SelectField label="Status" name="status" options={membershipStatusOptions} />
      </div>
      <SubmitButton>Plaatsing opslaan</SubmitButton>
    </form>
  );
}

function GroupMembershipEditForm({ data, membership }: { data: AdminDomainData; membership: GroupMembershipRow }) {
  const group = data.groups.find((entry) => entry.id === membership.group_id);

  return (
    <details className="rounded-xl border border-border bg-card p-3">
      <summary className="cursor-pointer text-sm font-semibold">
        {group?.name ?? "Groep"} - <span className="text-muted-foreground">{membership.status}</span>
      </summary>
      <form action={updateGroupMembershipPeopleAction} className="mt-3 grid gap-3">
        <input name="id" type="hidden" value={membership.id} />
        <input name="enrollment_id" type="hidden" value={membership.enrollment_id} />
        <div className="grid gap-3 md:grid-cols-3">
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

function DuplicateSignals({ signals }: { signals: DuplicateSignal[] }) {
  if (signals.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-800">
        Geen mogelijke duplicaten gevonden op naam/geboortedatum of ouder-e-mail.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {signals.map((signal) => (
        <div key={signal.key} className="rounded-2xl border border-border bg-muted/35 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{signal.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{signal.body}</p>
            </div>
            <StatusPill tone={signal.tone}>{signal.tone}</StatusPill>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditTrail({ compact, events, lookups }: { compact?: boolean; events: PeopleAuditEventRow[]; lookups: LookupMaps }) {
  if (events.length === 0) {
    return <EmptyState>Geen auditregels gevonden.</EmptyState>;
  }

  return (
    <div className="grid gap-2">
      {events.slice(0, compact ? 5 : 30).map((event) => {
        const actor = event.actor_profile_id ? lookups.profiles.get(event.actor_profile_id) : null;
        const participant = event.participant_id ? lookups.participants.get(event.participant_id) : null;

        return (
          <div key={event.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{event.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {participant?.display_name ?? "Algemeen"} - {actor?.full_name ?? "Systeem/admin"} - {formatDateTime(event.created_at)}
                </p>
              </div>
              <StatusPill tone="neutral">{event.event_type}</StatusPill>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPanel({ snapshot }: Props) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Leerlingenbeheer niet beschikbaar</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze pagina heeft Supabase-configuratie en een actieve tenant nodig.</p>
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

function buildLookups(data: AdminDomainData): LookupMaps {
  return {
    participants: byId(data.participants),
    profiles: byId(data.profiles),
    groups: byId(data.groups),
    enrollments: byId(data.enrollments),
    guardiansByParticipant: groupBy(data.participantGuardians, (guardian) => guardian.participant_id),
    enrollmentsByParticipant: groupBy(data.enrollments, (enrollment) => enrollment.participant_id),
    membershipsByEnrollment: groupBy(data.groupMemberships, (membership) => membership.enrollment_id),
    invitationsByParticipant: groupBy(
      data.tenantAccountInvitations.filter((invitation) => invitation.participant_id),
      (invitation) => invitation.participant_id ?? ""
    ),
    auditByParticipant: groupBy(
      data.peopleAuditEvents.filter((event) => event.participant_id),
      (event) => event.participant_id ?? ""
    )
  };
}

function buildDuplicateSignals(data: AdminDomainData): DuplicateSignal[] {
  const signals: DuplicateSignal[] = [];
  const participantsByIdentity = groupBy(data.participants, (participant) => `${normalizeText(participant.display_name)}|${participant.birthdate ?? ""}`);

  for (const [key, participants] of participantsByIdentity.entries()) {
    if (key.endsWith("|") || participants.length < 2) {
      continue;
    }

    signals.push({
      key: `participant-${key}`,
      title: "Mogelijke dubbele leerling",
      body: participants.map((participant) => participant.display_name).join(", "),
      tone: "warning"
    });
  }

  const guardianEmails = [
    ...data.participantGuardians.flatMap((guardian) => (guardian.email ? [{ email: guardian.email, participantId: guardian.participant_id }] : [])),
    ...data.tenantAccountInvitations.flatMap((invitation) => (invitation.participant_id ? [{ email: invitation.email, participantId: invitation.participant_id }] : []))
  ];
  const guardianEmailGroups = groupBy(guardianEmails, (entry) => entry.email.toLowerCase());

  for (const [email, entries] of guardianEmailGroups.entries()) {
    const participantIds = new Set(entries.map((entry) => entry.participantId));

    if (participantIds.size > 1) {
      signals.push({
        key: `guardian-${email}`,
        title: "Ouder-e-mail gekoppeld aan meerdere leerlingen",
        body: `${email} komt voor bij ${participantIds.size} leerlingdossiers. Dit kan kloppen bij broertjes/zusjes, maar verdient controle.`,
        tone: "info"
      });
    }
  }

  const failedInvitations = data.tenantAccountInvitations.filter((invitation) => invitation.status === "email_failed");

  if (failedInvitations.length > 0) {
    signals.push({
      key: "failed-invitations",
      title: "Uitnodigingen met mailfout",
      body: `${failedInvitations.length} ouderuitnodiging(en) konden niet worden gemaild. Controleer SMTP/SendGrid instellingen.`,
      tone: "danger"
    });
  }

  return signals;
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

function SectionHeader({ icon, title, count }: { icon: ReactNode; title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function ExportLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <Link className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground hover:bg-muted" href={href}>
      {children}
    </Link>
  );
}

function SectionBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {children}
    </div>
  );
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

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">{children}</div>;
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

function optionFromName(row: { id: string; name: string }) {
  return {
    label: row.name,
    value: row.id
  };
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "sent", "completed", "planned"].includes(status)) {
    return "success";
  }

  if (["pending", "created", "paused", "invited"].includes(status)) {
    return "warning";
  }

  if (["cancelled", "revoked", "inactive", "archived", "email_failed", "suspended"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const fieldsetClassName = "rounded-2xl border border-border bg-muted/35 p-4";
const legendClassName = "px-1 text-sm font-bold";

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
