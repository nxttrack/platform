import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, BadgeCheck, Bot, CalendarDays, CircleDollarSign, Clock, FileWarning, Inbox, LifeBuoy, MailWarning, MapPin, Route, TrendingUp, UserCheck, UserRound, Users, Waves } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import type { AdminAfzwemSnapshot } from "@/lib/afzwem/admin-afzwem-read-model";
import type { AdminAutomationSnapshot } from "@/lib/automation/admin-automation-read-model";
import { buildCapacitySnapshots, type CapacitySnapshot } from "@/lib/capacity/capacity-engine";
import { createParticipantGuardianAction, updateParticipantGuardianAction } from "@/lib/domain/admin-domain-actions";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  EnrollmentRow,
  GroupMembershipRow,
  GroupRow,
  ParticipantGuardianRow,
  ParticipantRow,
  ProfileRow
} from "@/lib/domain/admin-domain-read-model";
import type { AdminPhase12Snapshot } from "@/lib/operations/admin-phase12-read-model";
import type { ReportingDashboardData } from "@/lib/operations/reporting";
import type { AdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import type { PlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

type DomainProps = {
  snapshot: AdminDomainSnapshot;
};

type OperationsProps = {
  afzwem?: AdminAfzwemSnapshot;
  automation?: AdminAutomationSnapshot;
  domain: AdminDomainSnapshot;
  phase12?: AdminPhase12Snapshot;
  placement: PlacementWorkflowSnapshot;
  payments: AdminPaymentsSnapshot;
};

type LookupMaps = {
  groups: Map<string, GroupRow>;
  participants: Map<string, ParticipantRow>;
  enrollments: Map<string, EnrollmentRow>;
  profiles: Map<string, ProfileRow>;
  guardiansByParticipant: Map<string, ParticipantGuardianRow[]>;
};

type CapacityRow = {
  group: GroupRow;
  resourceName: string;
  instructorName: string;
  activeMemberships: number;
  capacityLimit: number;
  availableSpots: number;
  utilization: number;
  snapshot: CapacitySnapshot;
};

type AlertItem = {
  title: string;
  body: string;
  href: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
};

type SmartDashboardSignal = AlertItem & {
  key: string;
  value: string;
  icon: ReactNode;
  urgency: "nu" | "vandaag" | "monitor";
};

type TrendRow = {
  label: string;
  value: number;
  detail: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
};

type TrendCardData = {
  title: string;
  value: string;
  detail: string;
  href: string;
  rows: TrendRow[];
};

export function AdminOperationsDashboardPage({ afzwem, automation, domain, phase12, placement, payments }: OperationsProps) {
  if (domain.status !== "ready") {
    return <OperationsStatusPanel snapshot={domain} title="Tenant dashboard niet beschikbaar" />;
  }

  const capacityRows = buildCapacityRows(domain.data);
  const alerts = buildOperationalAlerts(domain, placement, payments, capacityRows);
  const smartSignals = buildSmartDashboardSignals({ afzwem, automation, domain, phase12, placement, payments, capacityRows });
  const trendCards = buildTrendCards({ afzwem, automation, domain, phase12, placement, payments, capacityRows });
  const activeEnrollments = domain.data.enrollments.filter((enrollment) => enrollment.status === "active").length;
  const scheduledSessions = domain.data.sessions.filter((session) => session.status === "scheduled").length;
  const totalCapacity = capacityRows.reduce((sum, row) => sum + row.capacityLimit, 0);
  const totalOccupied = capacityRows.reduce((sum, row) => sum + row.activeMemberships, 0);
  const utilization = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;
  const openInvoices = payments.status === "ready" ? payments.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)).length : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Smart command center</StatusPill>}
        kicker="Backoffice - operatie"
        subtitle="Een operationeel command center dat laat zien wat vandaag aandacht vraagt en direct doorklikt naar de juiste workflow."
        title="Dashboard"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Users className="h-5 w-5" />} label="Actieve leerlingen" value={activeEnrollments.toString()} detail={`${domain.data.participants.length} profielen`} />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Lessen" value={scheduledSessions.toString()} detail="in planning" />
        <MetricCard icon={<TrendingUp className="h-5 w-5" />} label="Bezetting" value={`${utilization}%`} detail={`${totalOccupied}/${totalCapacity} plekken`} />
        <MetricCard icon={<CircleDollarSign className="h-5 w-5" />} label="Open betalingen" value={openInvoices.toString()} detail="handmatige status" />
      </div>

      <Card>
        <SectionHeader title="Actie vandaag" count={smartSignals.filter((signal) => Number(signal.value) > 0).length} />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {smartSignals.map((signal) => (
            <SmartSignalCard key={signal.key} signal={signal} />
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Trends en gezondheid" count={trendCards.length} />
        <div className="grid gap-4 xl:grid-cols-3">
          {trendCards.map((trend) => (
            <TrendCard key={trend.title} trend={trend} />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionHeader title="Vandaag en komende lessen" count={domain.data.sessions.length} />
          <div className="grid gap-3">
            {domain.data.sessions.length === 0 ? <EmptyState>Geen geplande sessies gevonden.</EmptyState> : null}
            {domain.data.sessions.slice(0, 8).map((session) => {
              const group = domain.data.groups.find((entry) => entry.id === session.group_id);
              const resource = domain.data.resources.find((entry) => entry.id === (session.resource_id ?? group?.resource_id ?? ""));
              const instructor = domain.data.instructors.find((entry) => entry.id === (session.instructor_id ?? group?.instructor_id ?? ""));

              return (
                <div key={session.id} className="rounded-2xl border border-border bg-muted/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{group?.name ?? "Onbekende groep"}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDateTime(session.starts_at)} - {resource?.name ?? "Geen locatie"} - {instructor?.display_name ?? "Geen instructeur"}
                      </p>
                    </div>
                    <StatusPill tone={statusTone(session.status)}>{session.status}</StatusPill>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Operationele signalen" count={alerts.length} />
          <AlertList alerts={alerts.slice(0, 8)} />
        </Card>
      </div>

      <Card>
          <SectionHeader title="Snel naar beheer" count={6} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <QuickLink href="/admin/programs" label="Programma's en abonnementen" text="Aanbod, niveaus en abonnementsvormen beheren." />
          <QuickLink href="/admin/groups" label="Groepen" text="Vaste groepen, tijden, locaties en instructeurs." />
          <QuickLink href="/admin/resources" label="Locaties" text="Bad, baan, ruimte, capaciteit en status." />
          <QuickLink href="/admin/leerlingen" label="Leerlingen en ouders" text="Leerlingen, inschrijvingen en ouderkoppelingen." />
          <QuickLink href="/admin/plaatsingsvoorstellen" label="Plaatsing" text="Wachtlijst naar lesplek-aanbod." />
          <QuickLink href="/admin/payments" label="Betalingen" text="Handmatige facturen en betalingen." />
        </div>
      </Card>
    </div>
  );
}

export function AdminPlanningBoardPage({ snapshot }: DomainProps) {
  if (snapshot.status !== "ready") {
    return <OperationsStatusPanel snapshot={snapshot} title="Planning board niet beschikbaar" />;
  }

  const capacityRows = buildCapacityRows(snapshot.data);
  const rowsByDay = groupBy(capacityRows, (row) => String(row.group.weekday));

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Planbord</StatusPill>}
        kicker="Backoffice - planning"
        subtitle="Terugkerende groepen als operationeel planbord met locatie, instructeur en actuele capaciteit."
        title="Planning"
      />

      <div className="grid gap-4 xl:grid-cols-7">
        {weekdayOptions.map((day) => {
          const rows = (rowsByDay.get(String(day.value)) ?? []).sort((a, b) => a.group.starts_at.localeCompare(b.group.starts_at));

          return (
            <Card key={day.value} className="xl:min-h-[420px]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-base font-bold">{day.short}</h2>
                <StatusPill tone="neutral">{rows.length}</StatusPill>
              </div>
              <div className="grid gap-3">
                {rows.length === 0 ? <EmptyState>Geen groepen.</EmptyState> : null}
                {rows.map((row) => (
                  <PlanningGroupCard key={row.group.id} row={row} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function AdminCapacityReportsPage({ domain, placement, payments }: OperationsProps) {
  if (domain.status !== "ready") {
    return <OperationsStatusPanel snapshot={domain} title="Rapportages niet beschikbaar" />;
  }

  const capacityRows = buildCapacityRows(domain.data);
  const totalCapacity = capacityRows.reduce((sum, row) => sum + row.capacityLimit, 0);
  const totalOccupied = capacityRows.reduce((sum, row) => sum + row.activeMemberships, 0);
  const openAmount = payments.status === "ready" ? payments.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), 0) : 0;
  const waiting = placement.status === "ready" ? placement.data.waitlistEntries.filter((entry) => ["queued", "matched"].includes(entry.status)).length : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Rapportage</StatusPill>}
        kicker="Backoffice - rapportages"
        subtitle="Operationele rapportage over bezetting, wachtlijst, voortgang en handmatige betalingen."
        title="Rapportages"
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<MapPin className="h-5 w-5" />} label="Capaciteit" value={`${totalOccupied}/${totalCapacity}`} detail="actieve plekken" />
        <MetricCard icon={<Waves className="h-5 w-5" />} label="Vrije plekken" value={capacityRows.reduce((sum, row) => sum + row.availableSpots, 0).toString()} detail="op groups/resources" />
        <MetricCard icon={<Clock className="h-5 w-5" />} label="Wachtlijst" value={waiting.toString()} detail="wachtend of gematcht" />
        <MetricCard icon={<CircleDollarSign className="h-5 w-5" />} label="Openstaand" value={formatMoney(openAmount, "EUR")} detail="handmatige betalingen" />
      </div>

      <Card>
        <SectionHeader title="Capaciteitsoverzicht" count={capacityRows.length} />
        <DataTable
          columns={[
            { header: "Groep", render: (row) => <StrongText>{row.group.name}</StrongText> },
            { header: "Moment", render: (row) => `${weekdayLabel(row.group.weekday)} ${formatTime(row.group.starts_at)}-${formatTime(row.group.ends_at)}` },
            { header: "Locatie", render: (row) => row.resourceName },
            { header: "Instructeur", render: (row) => row.instructorName },
            { header: "Bezetting", render: (row) => `${row.activeMemberships}/${row.capacityLimit}` },
            { header: "Vrij", render: (row) => row.availableSpots },
            { header: "Status", render: (row) => <StatusPill tone={capacityTone(row.snapshot)}>{Math.round(row.utilization)}%</StatusPill> }
          ]}
          emptyLabel="Geen capaciteitsregels gevonden."
          rows={capacityRows}
          rowKey={(row) => row.group.id}
        />
      </Card>
    </div>
  );
}

export function AdminOperationalTasksPage({ domain, placement, payments }: OperationsProps) {
  if (domain.status !== "ready") {
    return <OperationsStatusPanel snapshot={domain} title="Taken niet beschikbaar" />;
  }

  const alerts = buildOperationalAlerts(domain, placement, payments, buildCapacityRows(domain.data));

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Actielijst</StatusPill>}
        kicker="Backoffice - taken"
        subtitle="Operationele alerts die uit planning, capaciteit, plaatsing, ouderkoppelingen en betalingen worden afgeleid."
        title="Taken"
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <Card>
          <SectionHeader title="Actielijst" count={alerts.length} />
          <AlertList alerts={alerts} />
        </Card>

        <Card>
          <SectionHeader title="Rustige operatie" count={4} />
          <div className="grid gap-3">
            <CheckRow label="Programma's, niveaus, groepen en locaties" ok={domain.data.programs.length > 0 && domain.data.groups.length > 0 && domain.data.resources.length > 0} />
            <CheckRow label="Instructeurs gekoppeld" ok={domain.data.groups.every((group) => Boolean(group.instructor_id))} />
            <CheckRow label="Ouders gekoppeld" ok={domain.data.participants.every((participant) => domain.data.participantGuardians.some((guardian) => guardian.participant_id === participant.id && guardian.status === "active"))} />
            <CheckRow label="Capaciteit binnen limiet" ok={buildCapacityRows(domain.data).every((row) => row.snapshot.blockedSpots === 0)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminStudentsParentsPage({ snapshot }: DomainProps) {
  if (snapshot.status !== "ready") {
    return <OperationsStatusPanel snapshot={snapshot} title="Leerlingen en ouders niet beschikbaar" />;
  }

  const lookups = buildLookups(snapshot.data);
  const activeParticipants = snapshot.data.participants.filter((participant) => participant.status === "active");
  const activeGuardians = snapshot.data.participantGuardians.filter((guardian) => guardian.status === "active");
  const participantsWithoutGuardian = activeParticipants.filter((participant) => (lookups.guardiansByParticipant.get(participant.id) ?? []).filter((guardian) => guardian.status === "active").length === 0);

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Beheer actief</StatusPill>}
        kicker="Backoffice - leerlingen"
        subtitle="Leerlingen, inschrijvingen en ouderkoppelingen. Productdata blijft gescheiden van betalingen en niveauprogressie."
        title="Leerlingen en ouders"
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<UserRound className="h-5 w-5" />} label="Leerlingen" value={activeParticipants.length.toString()} detail="actief" />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Ouderkoppelingen" value={activeGuardians.length.toString()} detail="actief" />
        <MetricCard icon={<AlertTriangle className="h-5 w-5" />} label="Zonder ouder" value={participantsWithoutGuardian.length.toString()} detail="actie nodig" />
      </div>

      <Card>
        <SectionHeader title="Nieuwe ouderkoppeling" count={snapshot.data.tenantMembers.length} />
        <GuardianForm data={snapshot.data} lookups={lookups} mode="create" />
      </Card>

      <Card>
        <SectionHeader title="Leerlingen en ouders" count={snapshot.data.participants.length} />
        <div className="grid gap-4">
          {snapshot.data.participants.length === 0 ? <EmptyState>Geen leerlingen gevonden.</EmptyState> : null}
          {snapshot.data.participants.map((participant) => (
            <StudentParentCard key={participant.id} data={snapshot.data} lookups={lookups} participant={participant} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function StudentParentCard({ data, lookups, participant }: { data: AdminDomainData; lookups: LookupMaps; participant: ParticipantRow }) {
  const enrollments = data.enrollments.filter((enrollment) => enrollment.participant_id === participant.id);
  const guardians = lookups.guardiansByParticipant.get(participant.id) ?? [];

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold">{participant.display_name}</p>
          <p className="text-sm text-muted-foreground">{participant.birthdate ? formatDate(participant.birthdate) : "Geboortedatum onbekend"}</p>
        </div>
        <StatusPill tone={statusTone(participant.status)}>{participant.status}</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <InfoTile label="Inschrijvingen" value={enrollments.length.toString()} />
        <InfoTile label="Ouders" value={guardians.filter((guardian) => guardian.status === "active").length.toString()} />
        <InfoTile label="Referentie" value={participant.external_reference ?? "-"} />
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="mb-3 text-sm font-bold">Inschrijvingen</p>
          <div className="grid gap-2">
            {enrollments.length === 0 ? <EmptyState>Geen inschrijving.</EmptyState> : null}
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{data.programs.find((program) => program.id === enrollment.program_id)?.name ?? "Programma"}</p>
                <p className="text-muted-foreground">
                  {data.stages.find((stage) => stage.id === enrollment.current_stage_id)?.name ?? "Geen stage"} - {enrollment.status}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="mb-3 text-sm font-bold">Ouders/verzorgers</p>
          <div className="grid gap-2">
            {guardians.length === 0 ? <EmptyState>Nog geen ouder gekoppeld.</EmptyState> : null}
            {guardians.map((guardian) => (
              <details key={guardian.id} className="rounded-xl border border-border bg-muted/30 p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  {guardian.display_name ?? lookups.profiles.get(guardian.profile_id)?.full_name ?? guardian.email ?? guardian.profile_id.slice(0, 8)}
                </summary>
                <div className="mt-3">
                  <GuardianForm data={data} guardian={guardian} lookups={lookups} mode="update" />
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GuardianForm({ data, guardian, lookups, mode }: { data: AdminDomainData; guardian?: ParticipantGuardianRow; lookups: LookupMaps; mode: "create" | "update" }) {
  const memberOptions = data.tenantMembers.map((member) => {
    const profile = lookups.profiles.get(member.user_id);

    return {
      value: member.user_id,
      label: `${profile?.full_name ?? member.invited_email ?? member.user_id.slice(0, 8)} - ${member.role}`
    };
  });

  return (
    <form action={mode === "create" ? createParticipantGuardianAction : updateParticipantGuardianAction} className="grid gap-3">
      {guardian ? <input name="id" type="hidden" value={guardian.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue={guardian?.participant_id} label="Leerling" name="participant_id" options={data.participants.map((participant) => ({ label: participant.display_name, value: participant.id }))} required />
        <SelectField defaultValue={guardian?.profile_id} label="Profiel" name="profile_id" options={memberOptions} required />
        <SelectField defaultValue={guardian?.relationship ?? "parent"} label="Relatie" name="relationship" options={guardianRelationshipOptions} />
        <SelectField defaultValue={guardian?.status ?? "active"} label="Status" name="status" options={guardianStatusOptions} />
        <TextField defaultValue={guardian?.display_name} label="Naam override" name="display_name" />
        <TextField defaultValue={guardian?.email} label="E-mail override" name="email" type="email" />
      </div>
      <button className="w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
        {mode === "create" ? "Ouder koppelen" : "Koppeling opslaan"}
      </button>
    </form>
  );
}

function PlanningGroupCard({ row }: { row: CapacityRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{row.group.name}</p>
          <p className="text-xs text-muted-foreground">{formatTime(row.group.starts_at)}-{formatTime(row.group.ends_at)}</p>
        </div>
        <StatusPill tone={capacityTone(row.snapshot)}>{row.activeMemberships}/{row.capacityLimit}</StatusPill>
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">{row.resourceName}</p>
      <p className="truncate text-xs text-muted-foreground">{row.instructorName}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, row.utilization))}%` }} />
      </div>
    </div>
  );
}

function AlertList({ alerts }: { alerts: AlertItem[] }) {
  if (alerts.length === 0) {
    return <EmptyState>Geen operationele alerts. Alles oogt rustig.</EmptyState>;
  }

  return (
    <div className="grid gap-3">
      {alerts.map((alert) => (
        <Link key={`${alert.title}-${alert.href}`} className="rounded-2xl border border-border bg-muted/35 p-4 hover:bg-muted" href={alert.href}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{alert.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{alert.body}</p>
            </div>
            <StatusPill tone={alert.tone}>open</StatusPill>
          </div>
        </Link>
      ))}
    </div>
  );
}

function SmartSignalCard({ signal }: { signal: SmartDashboardSignal }) {
  const hasWork = Number.parseInt(signal.value, 10) > 0;

  return (
    <Link className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-soft ${hasWork ? "border-border bg-card hover:bg-muted" : "border-border/70 bg-muted/30"}`} href={signal.href}>
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${hasWork ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{signal.icon}</div>
        <StatusPill tone={hasWork ? signal.tone : "neutral"}>{signal.urgency}</StatusPill>
      </div>
      <div className="mt-4">
        <p className="text-2xl font-bold tracking-tight">{signal.value}</p>
        <p className="mt-1 font-semibold">{signal.title}</p>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{signal.body}</p>
      </div>
    </Link>
  );
}

function TrendCard({ trend }: { trend: TrendCardData }) {
  const maxValue = Math.max(1, ...trend.rows.map((row) => row.value));

  return (
    <Link className="rounded-2xl border border-border bg-muted/35 p-4 transition hover:-translate-y-0.5 hover:bg-muted hover:shadow-soft" href={trend.href}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{trend.title}</p>
          <p className="text-sm text-muted-foreground">{trend.detail}</p>
        </div>
        <p className="text-xl font-bold">{trend.value}</p>
      </div>
      <div className="grid gap-2">
        {trend.rows.length === 0 ? <EmptyState>Geen trenddata.</EmptyState> : null}
        {trend.rows.map((row) => (
          <div key={`${trend.title}-${row.label}`} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span className="truncate text-muted-foreground">{row.label}</span>
              <span>{row.detail}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div className={`h-full rounded-full ${trendBarClassName(row.tone)}`} style={{ width: `${Math.max(5, Math.round((row.value / maxValue) * 100))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}

function OperationsStatusPanel({ snapshot, title }: DomainProps & { title: string }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze operationspagina heeft Supabase-configuratie en een actieve tenant nodig.</p>
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

function buildOperationalAlerts(domain: AdminDomainSnapshot, placement: PlacementWorkflowSnapshot, payments: AdminPaymentsSnapshot, capacityRows: CapacityRow[]): AlertItem[] {
  if (domain.status !== "ready") {
    return [];
  }

  const alerts: AlertItem[] = [];
  const overCapacity = capacityRows.filter((row) => row.snapshot.blockedSpots > 0);
  const missingInstructor = domain.data.groups.filter((group) => group.status === "active" && !group.instructor_id);
  const missingGuardian = domain.data.participants.filter((participant) => participant.status === "active" && !domain.data.participantGuardians.some((guardian) => guardian.participant_id === participant.id && guardian.status === "active"));
  const maintenanceGroups = domain.data.groups.filter((group) => {
    const resource = domain.data.resources.find((entry) => entry.id === group.resource_id);

    return group.status === "active" && resource?.status === "maintenance";
  });

  if (overCapacity.length > 0) {
    alerts.push({ title: "Groepen over capaciteit", body: `${overCapacity.length} groep(en) hebben meer actieve deelnemers dan plekken.`, href: "/admin/rapportages", tone: "danger" });
  }

  if (missingInstructor.length > 0) {
    alerts.push({ title: "Instructeur mist op groep", body: `${missingInstructor.length} actieve groep(en) hebben nog geen instructeur.`, href: "/admin/groups", tone: "warning" });
  }

  if (missingGuardian.length > 0) {
    alerts.push({ title: "Leerlingen zonder ouder", body: `${missingGuardian.length} actieve leerling(en) missen een ouderkoppeling.`, href: "/admin/leerlingen", tone: "warning" });
  }

  if (maintenanceGroups.length > 0) {
    alerts.push({ title: "Locatie in onderhoud", body: `${maintenanceGroups.length} actieve groep(en) staan op een locatie in onderhoud.`, href: "/admin/resources", tone: "danger" });
  }

  if (placement.status === "ready") {
    const waiting = placement.data.waitlistEntries.filter((entry) => ["queued", "matched"].includes(entry.status)).length;
    const pendingSuggestions = placement.data.placementSuggestions.filter((suggestion) => suggestion.status === "suggested").length;
    const availableSpots = capacityRows.reduce((sum, row) => sum + row.availableSpots, 0);

    if (waiting > 0 && availableSpots > 0) {
      alerts.push({ title: "Wachtlijst matchkans", body: `${waiting} wachtlijstregel(s) en ${availableSpots} vrije plek(ken).`, href: "/admin/wachtlijst", tone: "info" });
    }

    if (pendingSuggestions > 0) {
      alerts.push({ title: "Plaatsingsvoorstellen open", body: `${pendingSuggestions} voorstel(len) wachten op admin approval.`, href: "/admin/plaatsingsvoorstellen", tone: "warning" });
    }
  }

  if (payments.status === "ready") {
    const overdueInvoices = payments.data.invoices.filter((invoice) => invoice.status === "overdue").length;
    const openInvoices = payments.data.invoices.filter((invoice) => ["open", "partially_paid"].includes(invoice.status)).length;

    if (overdueInvoices > 0) {
      alerts.push({ title: "Achterstallige betalingen", body: `${overdueInvoices} factuur/facturen staan op overdue.`, href: "/admin/payments", tone: "danger" });
    } else if (openInvoices > 0) {
      alerts.push({ title: "Open handmatige betalingen", body: `${openInvoices} factuur/facturen vragen opvolging.`, href: "/admin/payments", tone: "info" });
    }
  }

  return alerts;
}

function buildSmartDashboardSignals({
  afzwem,
  automation,
  domain,
  phase12,
  placement,
  payments,
  capacityRows
}: {
  afzwem?: AdminAfzwemSnapshot;
  automation?: AdminAutomationSnapshot;
  domain: AdminDomainSnapshot;
  phase12?: AdminPhase12Snapshot;
  placement: PlacementWorkflowSnapshot;
  payments: AdminPaymentsSnapshot;
  capacityRows: CapacityRow[];
}): SmartDashboardSignal[] {
  const intakesNeedingReview = placement.status === "ready" ? placement.data.intakes.filter((intake) => ["new", "reviewing"].includes(intake.status) || !intake.reviewed_at).length : 0;
  const duplicateRisks =
    placement.status === "ready"
      ? placement.data.intakeDuplicateMatches.filter((match) => match.status === "open").length + placement.data.waitlistEntries.filter((entry) => entry.duplicate_risk && entry.duplicate_risk !== "none").length
      : 0;
  const availableGroups = capacityRows.filter((row) => row.group.status === "active" && row.snapshot.openSpots > 0 && row.snapshot.status !== "blocked").length;
  const blockedGroups = capacityRows.filter((row) => row.snapshot.status === "blocked" || row.snapshot.status === "overbooked" || row.snapshot.blockedSpots > 0).length;
  const placementOpportunities = placement.status === "ready" ? placement.data.placementSuggestions.filter((suggestion) => ["suggested", "approved"].includes(suggestion.status)).length : 0;
  const slotOffersExpiring = placement.status === "ready" ? placement.data.slotOffers.filter((offer) => offer.status === "sent" && daysUntil(offer.expires_at) <= 2).length : 0;
  const failedMessages = phase12?.status === "ready" ? phase12.data.messageOutbox.filter((message) => ["failed", "retrying"].includes(message.status) || message.delivery_status === "failed").length : 0;
  const overduePayments = payments.status === "ready" ? payments.data.invoices.filter((invoice) => invoice.status === "overdue").length : 0;
  const makeupBacklog = domain.data.catchUpRequests.filter((request) => ["requested", "approved"].includes(request.status)).length + domain.data.makeupCredits.filter((credit) => credit.status === "available").length;
  const stageTransitions = domain.data.stageTransitionProposals.filter((proposal) => ["proposed", "approved"].includes(proposal.status)).length + domain.data.flowThroughRecommendations.filter((recommendation) => recommendation.status === "recommended").length;
  const afzwemReady =
    afzwem?.status === "ready"
      ? afzwem.data.readinessRadar.filter((row) => ["ready_for_review", "almost_ready"].includes(row.readiness_status)).length + afzwem.data.candidateSuggestions.filter((suggestion) => suggestion.suggested_status === "candidate").length
      : 0;
  const automationBlocked = automation?.status === "ready" ? automation.data.executionLogs.filter((log) => ["blocked", "failed", "rollback_unavailable"].includes(log.action_status)).length : 0;

  return [
    {
      key: "intake-review",
      title: "Nieuwe intakes",
      body: "Review stageadvies, intakegegevens en vervolgstap.",
      value: intakesNeedingReview.toString(),
      href: "/admin/intake",
      tone: intakesNeedingReview > 0 ? "warning" : "success",
      urgency: intakesNeedingReview > 0 ? "vandaag" : "monitor",
      icon: <Inbox className="h-5 w-5" />
    },
    {
      key: "duplicate-risk",
      title: "Duplicaatrisico's",
      body: "Controleer mogelijke dubbele leerlingen of ouderaccounts.",
      value: duplicateRisks.toString(),
      href: "/admin/intake",
      tone: duplicateRisks > 0 ? "danger" : "success",
      urgency: duplicateRisks > 0 ? "nu" : "monitor",
      icon: <FileWarning className="h-5 w-5" />
    },
    {
      key: "available-spots",
      title: "Groepen met plek",
      body: "Beschikbare capaciteit voor plaatsing of doorstroom.",
      value: availableGroups.toString(),
      href: "/admin/groups",
      tone: availableGroups > 0 ? "success" : "neutral",
      urgency: "monitor",
      icon: <Waves className="h-5 w-5" />
    },
    {
      key: "blocked-capacity",
      title: "Capaciteit geblokkeerd",
      body: "Overboeking, holds of resourceblokkades vragen controle.",
      value: blockedGroups.toString(),
      href: "/admin/agenda",
      tone: blockedGroups > 0 ? "danger" : "success",
      urgency: blockedGroups > 0 ? "nu" : "monitor",
      icon: <AlertTriangle className="h-5 w-5" />
    },
    {
      key: "placement-opportunities",
      title: "Plaatsingskansen",
      body: "Slimme voorstellen die naar lesplek-aanbod kunnen.",
      value: placementOpportunities.toString(),
      href: "/admin/plaatsingsvoorstellen",
      tone: placementOpportunities > 0 ? "info" : "neutral",
      urgency: placementOpportunities > 0 ? "vandaag" : "monitor",
      icon: <Route className="h-5 w-5" />
    },
    {
      key: "slot-offer-expiring",
      title: "Aanbod verloopt",
      body: "Open slot offers die binnen 48 uur aflopen.",
      value: slotOffersExpiring.toString(),
      href: "/admin/slot-offers",
      tone: slotOffersExpiring > 0 ? "warning" : "success",
      urgency: slotOffersExpiring > 0 ? "vandaag" : "monitor",
      icon: <Clock className="h-5 w-5" />
    },
    {
      key: "failed-messages",
      title: "Berichtfouten",
      body: "SMTP/SendGrid outbox retry of foutmelding nodig.",
      value: failedMessages.toString(),
      href: "/admin/berichten",
      tone: failedMessages > 0 ? "danger" : "success",
      urgency: failedMessages > 0 ? "nu" : "monitor",
      icon: <MailWarning className="h-5 w-5" />
    },
    {
      key: "overdue-payments",
      title: "Overdue betalingen",
      body: "Facturen met achterstallige handmatige status.",
      value: overduePayments.toString(),
      href: "/admin/payments",
      tone: overduePayments > 0 ? "danger" : "success",
      urgency: overduePayments > 0 ? "vandaag" : "monitor",
      icon: <CircleDollarSign className="h-5 w-5" />
    },
    {
      key: "makeup-backlog",
      title: "Inhaalachterstand",
      body: "Open inhaalverzoeken of beschikbare makeup credits.",
      value: makeupBacklog.toString(),
      href: "/admin/agenda",
      tone: makeupBacklog > 0 ? "warning" : "success",
      urgency: makeupBacklog > 0 ? "vandaag" : "monitor",
      icon: <LifeBuoy className="h-5 w-5" />
    },
    {
      key: "stage-transitions",
      title: "Doorstroom wacht",
      body: "Stage-overgangen en flow-through adviezen ter goedkeuring.",
      value: stageTransitions.toString(),
      href: "/admin/badges",
      tone: stageTransitions > 0 ? "info" : "success",
      urgency: stageTransitions > 0 ? "vandaag" : "monitor",
      icon: <UserCheck className="h-5 w-5" />
    },
    {
      key: "afzwem-ready",
      title: "Afzwem radar",
      body: "Leerlingen bijna klaar of klaar voor afzwemreview.",
      value: afzwemReady.toString(),
      href: "/admin/afzwemmen",
      tone: afzwemReady > 0 ? "info" : "success",
      urgency: afzwemReady > 0 ? "vandaag" : "monitor",
      icon: <BadgeCheck className="h-5 w-5" />
    },
    {
      key: "automation-safety",
      title: "Automation safety",
      body: "Geblokkeerde of mislukte automation logs vragen review.",
      value: automationBlocked.toString(),
      href: "/admin/automatisering",
      tone: automationBlocked > 0 ? "danger" : "success",
      urgency: automationBlocked > 0 ? "nu" : "monitor",
      icon: <Bot className="h-5 w-5" />
    }
  ];
}

function buildTrendCards({
  afzwem,
  automation,
  domain,
  phase12,
  placement,
  payments,
  capacityRows
}: {
  afzwem?: AdminAfzwemSnapshot;
  automation?: AdminAutomationSnapshot;
  domain: AdminDomainSnapshot;
  phase12?: AdminPhase12Snapshot;
  placement: PlacementWorkflowSnapshot;
  payments: AdminPaymentsSnapshot;
  capacityRows: CapacityRow[];
}): TrendCardData[] {
  const reporting = phase12?.status === "ready" ? phase12.data.reporting : null;

  return [
    buildIntakeFunnelTrend(placement),
    buildWaitlistAgeTrend(reporting, placement),
    buildOccupancyTrend(reporting, capacityRows),
    buildAttendanceTrend(reporting, domain),
    buildProgressReadinessTrend(reporting, domain, afzwem),
    buildRevenuePaymentTrend(reporting, payments),
    buildAutomationTrend(automation)
  ];
}

function buildIntakeFunnelTrend(placement: PlacementWorkflowSnapshot): TrendCardData {
  const intakes = placement.status === "ready" ? placement.data.intakes : [];
  const rows = [
    trendRow("Nieuw", countByStatus(intakes, "new"), "nieuw", "warning"),
    trendRow("Review", countByStatus(intakes, "reviewing"), "review", "info"),
    trendRow("Gematcht", countByStatus(intakes, "matched"), "match", "success"),
    trendRow("Aanbod", countByStatus(intakes, "slot_offered"), "aanbod", "warning"),
    trendRow("Geaccepteerd", countByStatus(intakes, "accepted"), "accept", "success")
  ];

  return {
    title: "Intake funnel",
    value: intakes.length.toString(),
    detail: "van aanvraag naar lesplek",
    href: "/admin/intake",
    rows
  };
}

function buildWaitlistAgeTrend(reporting: ReportingDashboardData | null, placement: PlacementWorkflowSnapshot): TrendCardData {
  const sourceRows = reporting?.waitlist.rows ?? [];
  const ages =
    sourceRows.length > 0
      ? sourceRows.map((row) => (typeof row.age_days === "number" ? row.age_days : 0))
      : placement.status === "ready"
        ? placement.data.waitlistEntries.map((entry) => daysSince(entry.priority_date))
        : [];
  const rows = [
    trendRow("0-7 dagen", ages.filter((age) => age <= 7).length, "kort", "success"),
    trendRow("8-30 dagen", ages.filter((age) => age > 7 && age <= 30).length, "normaal", "info"),
    trendRow("31-60 dagen", ages.filter((age) => age > 30 && age <= 60).length, "lang", "warning"),
    trendRow("60+ dagen", ages.filter((age) => age > 60).length, "kritisch", "danger")
  ];

  return {
    title: "Wachtlijstleeftijd",
    value: ages.length.toString(),
    detail: "leeftijd per kandidaat",
    href: "/admin/wachtlijst",
    rows
  };
}

function buildOccupancyTrend(reporting: ReportingDashboardData | null, capacityRows: CapacityRow[]): TrendCardData {
  const rows =
    reporting?.occupancy.rows.slice(0, 5).map((row) => trendRow(String(row.group ?? row.group_id ?? "Groep"), numberFrom(row.occupancy_rate), `${numberFrom(row.occupied)}/${numberFrom(row.capacity)}`, occupancyTone(numberFrom(row.occupancy_rate)))) ??
    capacityRows.slice(0, 5).map((row) => trendRow(row.group.name, Math.round(row.utilization), `${row.activeMemberships}/${row.capacityLimit}`, occupancyTone(Math.round(row.utilization))));
  const average = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.value, 0) / rows.length) : 0;

  return {
    title: "Bezetting",
    value: `${average}%`,
    detail: "top groepen op capaciteit",
    href: "/admin/rapportages",
    rows
  };
}

function buildAttendanceTrend(reporting: ReportingDashboardData | null, domain: AdminDomainSnapshot): TrendCardData {
  const summary = reporting?.attendance.summary;
  const rows = summary
    ? [
        trendRow("Aanwezig", numberFrom(summary.present), "present", "success"),
        trendRow("Afwezig", numberFrom(summary.absent), "absent", "warning"),
        trendRow("Te laat", numberFrom(summary.late), "late", "info"),
        trendRow("Inhaal", numberFrom(summary.makeup_requests), "requests", "warning")
      ]
    : [
        trendRow("Aanwezig", domain.data.attendance.filter((entry) => entry.status === "present").length, "present", "success"),
        trendRow("Afwezig", domain.data.attendance.filter((entry) => entry.status === "absent").length, "absent", "warning"),
        trendRow("Te laat", domain.data.attendance.filter((entry) => entry.status === "late").length, "late", "info")
      ];

  return {
    title: "Aanwezigheid",
    value: `${numberFrom(summary?.attendance_rate)}%`,
    detail: "lesregistraties en inhaalimpact",
    href: "/admin/rapportages",
    rows
  };
}

function buildProgressReadinessTrend(reporting: ReportingDashboardData | null, domain: AdminDomainSnapshot, afzwem?: AdminAfzwemSnapshot): TrendCardData {
  const summary = reporting?.progress.summary;
  const ready = afzwem?.status === "ready" ? afzwem.data.readinessRadar.filter((row) => row.readiness_status === "ready_for_review").length : 0;
  const almostReady = afzwem?.status === "ready" ? afzwem.data.readinessRadar.filter((row) => row.readiness_status === "almost_ready").length : 0;
  const rows = [
    trendRow("Behaald", numberFrom(summary?.passed) + numberFrom(summary?.completed), "progress", "success"),
    trendRow("Aandacht", numberFrom(summary?.needs_attention), "needs attention", "warning"),
    trendRow("Doorstroom", domain.data.stageTransitionProposals.filter((proposal) => ["proposed", "approved"].includes(proposal.status)).length, "voorstellen", "info"),
    trendRow("Afzwem ready", ready + almostReady, "radar", ready > 0 ? "success" : "info")
  ];

  return {
    title: "Voortgang readiness",
    value: numberFrom(summary?.updates).toString(),
    detail: "progress, badges en afzwemsignaal",
    href: "/admin/badges",
    rows
  };
}

function buildRevenuePaymentTrend(reporting: ReportingDashboardData | null, payments: AdminPaymentsSnapshot): TrendCardData {
  const paymentSummary = reporting?.payments.summary;
  const revenueSummary = reporting?.revenue.summary;
  const openInvoices = payments.status === "ready" ? payments.data.invoices.filter((invoice) => ["open", "partially_paid"].includes(invoice.status)).length : numberFrom(paymentSummary?.open);
  const overdueInvoices = payments.status === "ready" ? payments.data.invoices.filter((invoice) => invoice.status === "overdue").length : numberFrom(paymentSummary?.overdue);
  const paidInvoices = payments.status === "ready" ? payments.data.invoices.filter((invoice) => invoice.status === "paid").length : numberFrom(paymentSummary?.paid);
  const netCents = numberFrom(revenueSummary?.net_cents);

  return {
    title: "Betaling en omzet",
    value: formatMoney(netCents, "EUR"),
    detail: "manual finance status",
    href: "/admin/payments",
    rows: [
      trendRow("Betaald", paidInvoices, "paid", "success"),
      trendRow("Open", openInvoices, "open", "warning"),
      trendRow("Overdue", overdueInvoices, "overdue", overdueInvoices > 0 ? "danger" : "success"),
      trendRow("Geincasseerd", numberFrom(revenueSummary?.collected_cents), formatMoney(numberFrom(revenueSummary?.collected_cents), "EUR"), "info")
    ]
  };
}

function buildAutomationTrend(automation?: AdminAutomationSnapshot): TrendCardData {
  const logs = automation?.status === "ready" ? automation.data.executionLogs : [];
  const engineHealth = automation?.status === "ready" ? automation.data.engineHealth : [];
  const automaticEngines = automation?.status === "ready" ? automation.data.engineSettings.filter((setting) => setting.automation_level === "execute_automatically").length : 0;

  return {
    title: "Automation safety",
    value: automaticEngines.toString(),
    detail: "engine levels en safety logs",
    href: "/admin/automatisering",
    rows: [
      trendRow("Prepared", logs.filter((log) => log.action_status === "prepared").length, "prepared", "info"),
      trendRow("Executed", logs.filter((log) => log.action_status === "executed").length, "executed", "success"),
      trendRow("Blocked", logs.filter((log) => log.action_status === "blocked").length, "blocked", "danger"),
      trendRow("Safe engines", engineHealth.filter((entry) => entry.safeForAutomatic).length, "auto safe", "success")
    ]
  };
}

function buildCapacityRows(data: AdminDomainData): CapacityRow[] {
  const snapshots = new Map(
    buildCapacitySnapshots({
      groups: data.groups,
      resources: data.resources,
      memberships: data.groupMemberships,
      holds: data.capacityHolds
    }).map((snapshot) => [snapshot.groupId, snapshot])
  );

  return data.groups.map((group) => {
    const resource = data.resources.find((entry) => entry.id === group.resource_id);
    const instructor = data.instructors.find((entry) => entry.id === group.instructor_id);
    const snapshot = snapshots.get(group.id) ?? buildCapacitySnapshots({ groups: [group], resources: data.resources, memberships: data.groupMemberships, holds: [] })[0];

    return {
      group,
      resourceName: resource?.name ?? "Geen locatie",
      instructorName: instructor?.display_name ?? "Geen instructeur",
      activeMemberships: snapshot.activeMemberships,
      capacityLimit: snapshot.capacityLimit,
      availableSpots: snapshot.openSpots,
      utilization: snapshot.capacityLimit > 0 ? (snapshot.usedSpots / snapshot.capacityLimit) * 100 : 0,
      snapshot
    };
  });
}

function capacityTone(snapshot: CapacitySnapshot): "success" | "warning" | "danger" | "info" | "neutral" {
  if (snapshot.status === "blocked" || snapshot.blockers.some((blocker) => blocker.severity === "blocking")) {
    return "danger";
  }

  if (snapshot.status === "overbooked" || snapshot.status === "full") {
    return "warning";
  }

  if (snapshot.status === "nearly_full") {
    return "info";
  }

  return "success";
}

function buildLookups(data: AdminDomainData): LookupMaps {
  return {
    groups: byId(data.groups),
    participants: byId(data.participants),
    enrollments: byId(data.enrollments),
    profiles: byId(data.profiles),
    guardiansByParticipant: groupBy(data.participantGuardians, (guardian) => guardian.participant_id)
  };
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

function QuickLink({ href, label, text }: { href: string; label: string; text: string }) {
  return (
    <Link className="rounded-2xl border border-border bg-muted/35 p-4 hover:bg-muted" href={href}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </Link>
  );
}

function CheckRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/35 p-3">
      <span className="text-sm font-semibold">{label}</span>
      <StatusPill tone={ok ? "success" : "warning"}>{ok ? "ok" : "check"}</StatusPill>
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

type Column<Row> = {
  header: string;
  render: (row: Row) => ReactNode;
};

function DataTable<Row>({ columns, rows, rowKey, emptyLabel }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; emptyLabel: string }) {
  if (rows.length === 0) {
    return <EmptyState>{emptyLabel}</EmptyState>;
  }

  return (
    <div className="min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
      <table className="w-max min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
            {columns.map((column) => (
              <th key={column.header} className="whitespace-nowrap px-3 py-3 font-semibold">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-top">
              {columns.map((column) => (
                <td key={column.header} className="whitespace-nowrap px-3 py-3">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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

function TextField({ defaultValue, label, name, type = "text" }: { defaultValue?: string | null; label: string; name: string; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} type={type} />
    </label>
  );
}

function SelectField({ defaultValue, label, name, options, required }: { defaultValue?: string | null; label: string; name: string; options: { label: string; value: string }[]; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required}>
        {required ? <option value="">Selecteer</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StrongText({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
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

function countByStatus<Row extends { status: string }>(rows: Row[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

function trendRow(label: string, value: number, detail: string, tone: TrendRow["tone"] = "neutral"): TrendRow {
  return {
    label,
    value: Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0,
    detail,
    tone
  };
}

function numberFrom(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function occupancyTone(value: number): TrendRow["tone"] {
  if (value >= 100) {
    return "danger";
  }

  if (value >= 90) {
    return "warning";
  }

  if (value >= 70) {
    return "success";
  }

  return "info";
}

function trendBarClassName(tone: TrendRow["tone"]) {
  if (tone === "danger") {
    return "bg-red-500";
  }

  if (tone === "warning") {
    return "bg-amber-500";
  }

  if (tone === "success") {
    return "bg-emerald-500";
  }

  if (tone === "info") {
    return "bg-sky-500";
  }

  return "bg-primary";
}

function daysUntil(value: string) {
  const end = new Date(value).getTime();
  return Number.isFinite(end) ? Math.ceil((end - Date.now()) / 86_400_000) : Number.POSITIVE_INFINITY;
}

function daysSince(value: string) {
  const start = new Date(value).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 86_400_000)) : 0;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "scheduled", "issued", "passed", "completed", "paid", "recorded"].includes(status)) {
    return "success";
  }

  if (["draft", "pending", "planned", "paused", "maintenance", "suggested", "open", "partially_paid"].includes(status)) {
    return "warning";
  }

  if (["cancelled", "revoked", "inactive", "suspended", "overdue", "failed"].includes(status)) {
    return "danger";
  }

  return "neutral";
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
  return value.slice(0, 5);
}

function weekdayLabel(weekday: number) {
  return weekdayOptions.find((day) => day.value === weekday)?.short ?? `Dag ${weekday}`;
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";

const weekdayOptions = [
  { label: "Maandag", short: "Ma", value: 1 },
  { label: "Dinsdag", short: "Di", value: 2 },
  { label: "Woensdag", short: "Wo", value: 3 },
  { label: "Donderdag", short: "Do", value: 4 },
  { label: "Vrijdag", short: "Vr", value: 5 },
  { label: "Zaterdag", short: "Za", value: 6 },
  { label: "Zondag", short: "Zo", value: 7 }
];

const guardianRelationshipOptions = [
  { label: "Ouder", value: "parent" },
  { label: "Verzorger", value: "guardian" },
  { label: "Leerling zelf", value: "athlete_self" }
];

const guardianStatusOptions = [
  { label: "Actief", value: "active" },
  { label: "Inactief", value: "inactive" },
  { label: "Ingetrokken", value: "revoked" }
];
