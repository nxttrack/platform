import type { ReactNode } from "react";
import { CalendarDays, CircleDollarSign, Database, MapPin, Users, Waves } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  EnrollmentRow,
  GroupRow,
  InstructorRow,
  ParticipantRow,
  ProgramRow,
  ResourceRow,
  StageRow,
  SubscriptionPlanRow
} from "@/lib/domain/admin-domain-read-model";

type DomainPageProps = {
  snapshot: AdminDomainSnapshot;
};

type LookupMaps = {
  programs: Map<string, ProgramRow>;
  stages: Map<string, StageRow>;
  subscriptionPlans: Map<string, SubscriptionPlanRow>;
  resources: Map<string, ResourceRow>;
  instructors: Map<string, InstructorRow>;
  groups: Map<string, GroupRow>;
  participants: Map<string, ParticipantRow>;
  enrollments: Map<string, EnrollmentRow>;
};

type Column<Row> = {
  header: string;
  render: (row: Row) => ReactNode;
  className?: string;
};

export function AdminDomainHome({ snapshot }: DomainPageProps) {
  const { data } = snapshot;
  const activeEnrollments = data.enrollments.filter((enrollment) => enrollment.status === "active").length;
  const scheduledSessions = data.sessions.filter((session) => session.status === "scheduled").length;

  return (
    <DomainFrame
      snapshot={snapshot}
      kicker="Tenant admin · Phase 3"
      title="Domein foundation"
      subtitle="Read-only overzicht van de generieke NXTTRACK kern: aanbod, niveaus, groepen, lessen, resources, inschrijvingen en begeleiding."
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<Waves className="h-5 w-5" />} label="Programma's" value={data.programs.length.toString()} detail={`${data.stages.length} stages`} />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Groepen" value={data.groups.length.toString()} detail={`${activeEnrollments} actieve enrollments`} />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Sessies" value={scheduledSessions.toString()} detail="ingepland in snapshot" />
        <MetricCard icon={<MapPin className="h-5 w-5" />} label="Resources" value={data.resources.length.toString()} detail={`${data.instructors.length} instructeurs`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Core model</h2>
              <p className="text-sm text-muted-foreground">Deze pagina bevestigt de Phase 3 scheiding tussen leerprogressie en billing.</p>
            </div>
            <StatusPill tone="info">Read-only</StatusPill>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["Program", "Het aangeboden product of leertraject."],
              ["Stage", "Het actuele niveau binnen een program, zoals Badje 1."],
              ["Group", "De terugkerende lesgroep met tijd/resource/instructor."],
              ["Session", "Een concrete lesdatum op basis van een group."],
              ["Enrollment", "De deelname van een participant aan een program."],
              ["SubscriptionPlan", "Billing/frequentie; staat los van stage/badje."]
            ].map(([term, description]) => (
              <div key={term} className="rounded-2xl border border-border bg-muted/40 p-4">
                <p className="text-sm font-bold">{term}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <CircleDollarSign className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Abonnement blijft los</h2>
              <p className="text-sm text-muted-foreground">Een leerling kan van badje wisselen zonder billingwijziging.</p>
            </div>
          </div>
          <DomainTable
            columns={[
              { header: "Plan", render: (plan) => <StrongText>{plan.name}</StrongText> },
              { header: "Frequentie", render: (plan) => `${formatNumber(plan.lesson_frequency_per_week)}x p/w` },
              { header: "Prijs", render: (plan) => formatMoney(plan.price_cents, plan.currency) }
            ]}
            emptyLabel="Nog geen subscription plans gevonden."
            rows={data.subscriptionPlans}
            rowKey={(plan) => plan.id}
          />
        </Card>
      </div>
    </DomainFrame>
  );
}

export function AdminProgramsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · aanbod" title="Programs" subtitle="Het aangeboden product of leertraject. Stages en subscription plans blijven los gekoppeld aan de enrollment.">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <SectionHeader title="Programs" count={snapshot.data.programs.length} />
          <DomainTable
            columns={[
              { header: "Naam", render: (program) => <StrongText>{program.name}</StrongText> },
              { header: "Code", render: (program) => <CodeText>{program.code}</CodeText> },
              { header: "Stages", render: (program) => countBy(snapshot.data.stages, "program_id", program.id) },
              { header: "Status", render: (program) => <StatusPill tone={statusTone(program.status)}>{program.status}</StatusPill> }
            ]}
            emptyLabel="Nog geen programs gevonden voor deze tenant."
            rows={snapshot.data.programs}
            rowKey={(program) => program.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Subscription plans" count={snapshot.data.subscriptionPlans.length} />
          <DomainTable
            columns={[
              { header: "Plan", render: (plan) => <StrongText>{plan.name}</StrongText> },
              { header: "Billing", render: (plan) => plan.billing_interval },
              { header: "Prijs", render: (plan) => formatMoney(plan.price_cents, plan.currency) }
            ]}
            emptyLabel="Nog geen subscription plans gevonden."
            rows={snapshot.data.subscriptionPlans}
            rowKey={(plan) => plan.id}
          />
        </Card>
      </div>

      <Card>
        <SectionHeader title="Stage mapping per program" count={snapshot.data.stages.length} />
        <DomainTable
          columns={[
            { header: "Stage", render: (stage) => <StrongText>{stage.name}</StrongText> },
            { header: "Program", render: (stage) => lookups.programs.get(stage.program_id)?.name ?? "Onbekend program" },
            { header: "Code", render: (stage) => <CodeText>{stage.code}</CodeText> },
            { header: "Status", render: (stage) => <StatusPill tone={statusTone(stage.status)}>{stage.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen stages gevonden."
          rows={snapshot.data.stages}
          rowKey={(stage) => stage.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminStagesPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · progressie" title="Stages" subtitle="Stages beschrijven alleen leerprogressie binnen een program. Ze bevatten geen prijs, facturatie of abonnement.">
      <Card>
        <SectionHeader title="Stages" count={snapshot.data.stages.length} />
        <DomainTable
          columns={[
            { header: "Stage", render: (stage) => <StrongText>{stage.name}</StrongText> },
            { header: "Program", render: (stage) => lookups.programs.get(stage.program_id)?.name ?? "Onbekend program" },
            { header: "Code", render: (stage) => <CodeText>{stage.code}</CodeText> },
            { header: "Volgorde", render: (stage) => stage.sort_order },
            { header: "Status", render: (stage) => <StatusPill tone={statusTone(stage.status)}>{stage.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen stages gevonden voor deze tenant."
          rows={snapshot.data.stages}
          rowKey={(stage) => stage.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminGroupsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · planning" title="Groups" subtitle="Terugkerende lesgroepen met program, stage, resource, instructor, tijdslot en capaciteit.">
      <Card>
        <SectionHeader title="Groups" count={snapshot.data.groups.length} />
        <DomainTable
          columns={[
            { header: "Groep", render: (group) => <StrongText>{group.name}</StrongText> },
            { header: "Program", render: (group) => lookups.programs.get(group.program_id)?.name ?? "Onbekend" },
            { header: "Stage", render: (group) => lookups.stages.get(group.stage_id)?.name ?? "Onbekend" },
            { header: "Moment", render: (group) => `${weekdayLabel(group.weekday)} ${formatTime(group.starts_at)}-${formatTime(group.ends_at)}` },
            { header: "Resource", render: (group) => nullableText(lookups.resources.get(group.resource_id ?? "")?.name) },
            { header: "Instructor", render: (group) => nullableText(lookups.instructors.get(group.instructor_id ?? "")?.display_name) },
            { header: "Cap.", render: (group) => group.capacity },
            { header: "Status", render: (group) => <StatusPill tone={statusTone(group.status)}>{group.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen groups gevonden voor deze tenant."
          rows={snapshot.data.groups}
          rowKey={(group) => group.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminSessionsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · lessen" title="Sessions" subtitle="Concrete lesmomenten die uit groups voortkomen. Dit is nog read-only en beperkt tot de eerste 25 records.">
      <Card>
        <SectionHeader title="Sessions" count={snapshot.data.sessions.length} />
        <DomainTable
          columns={[
            { header: "Datum", render: (session) => formatDateTime(session.starts_at) },
            { header: "Tijd", render: (session) => `${formatDateTimeTime(session.starts_at)}-${formatDateTimeTime(session.ends_at)}` },
            { header: "Groep", render: (session) => lookups.groups.get(session.group_id)?.name ?? "Onbekende groep" },
            { header: "Resource", render: (session) => nullableText(lookups.resources.get(session.resource_id ?? "")?.name) },
            { header: "Instructor", render: (session) => nullableText(lookups.instructors.get(session.instructor_id ?? "")?.display_name) },
            { header: "Status", render: (session) => <StatusPill tone={statusTone(session.status)}>{session.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen sessions gevonden voor deze tenant."
          rows={snapshot.data.sessions}
          rowKey={(session) => session.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminResourcesPage({ snapshot }: DomainPageProps) {
  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · capaciteit" title="Resources" subtitle="Plaatsen, banen, ruimtes of velden waarop groepen en sessions gepland worden.">
      <Card>
        <SectionHeader title="Resources" count={snapshot.data.resources.length} />
        <DomainTable
          columns={[
            { header: "Resource", render: (resource) => <StrongText>{resource.name}</StrongText> },
            { header: "Type", render: (resource) => resource.resource_type },
            { header: "Locatie", render: (resource) => nullableText(resource.location_name) },
            { header: "Capaciteit", render: (resource) => resource.capacity },
            { header: "Code", render: (resource) => <CodeText>{resource.code}</CodeText> },
            { header: "Status", render: (resource) => <StatusPill tone={statusTone(resource.status)}>{resource.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen resources gevonden voor deze tenant."
          rows={snapshot.data.resources}
          rowKey={(resource) => resource.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminEnrollmentsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · deelnemers" title="Enrollments" subtitle="Deelname aan een program met aparte kolommen voor huidige stage en subscription plan.">
      <Card>
        <SectionHeader title="Enrollments" count={snapshot.data.enrollments.length} />
        <DomainTable
          columns={[
            { header: "Leerling", render: (enrollment) => lookups.participants.get(enrollment.participant_id)?.display_name ?? "Onbekende participant" },
            { header: "Program", render: (enrollment) => lookups.programs.get(enrollment.program_id)?.name ?? "Onbekend" },
            { header: "Huidige stage", render: (enrollment) => nullableText(lookups.stages.get(enrollment.current_stage_id ?? "")?.name) },
            { header: "Subscription plan", render: (enrollment) => nullableText(lookups.subscriptionPlans.get(enrollment.subscription_plan_id ?? "")?.name) },
            { header: "Start", render: (enrollment) => formatDate(enrollment.started_on) },
            { header: "Status", render: (enrollment) => <StatusPill tone={statusTone(enrollment.status)}>{enrollment.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen enrollments gevonden voor deze tenant."
          rows={snapshot.data.enrollments}
          rowKey={(enrollment) => enrollment.id}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Participants" count={snapshot.data.participants.length} />
          <DomainTable
            columns={[
              { header: "Naam", render: (participant) => <StrongText>{participant.display_name}</StrongText> },
              { header: "Geboortedatum", render: (participant) => nullableText(participant.birthdate ? formatDate(participant.birthdate) : null) },
              { header: "Referentie", render: (participant) => nullableText(participant.external_reference) },
              { header: "Status", render: (participant) => <StatusPill tone={statusTone(participant.status)}>{participant.status}</StatusPill> }
            ]}
            emptyLabel="Nog geen participants gevonden."
            rows={snapshot.data.participants}
            rowKey={(participant) => participant.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Group memberships" count={snapshot.data.groupMemberships.length} />
          <DomainTable
            columns={[
              { header: "Leerling", render: (membership) => enrollmentParticipantName(lookups, membership.enrollment_id) },
              { header: "Groep", render: (membership) => lookups.groups.get(membership.group_id)?.name ?? "Onbekend" },
              { header: "Vanaf", render: (membership) => formatDate(membership.starts_on) },
              { header: "Status", render: (membership) => <StatusPill tone={statusTone(membership.status)}>{membership.status}</StatusPill> }
            ]}
            emptyLabel="Nog geen group memberships gevonden."
            rows={snapshot.data.groupMemberships}
            rowKey={(membership) => membership.id}
          />
        </Card>
      </div>
    </DomainFrame>
  );
}

export function AdminInstructorsPage({ snapshot }: DomainPageProps) {
  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin · team" title="Instructors" subtitle="Begeleiders die aan groups en sessions gekoppeld kunnen worden.">
      <Card>
        <SectionHeader title="Instructors" count={snapshot.data.instructors.length} />
        <DomainTable
          columns={[
            { header: "Naam", render: (instructor) => <StrongText>{instructor.display_name}</StrongText> },
            { header: "E-mail", render: (instructor) => nullableText(instructor.email) },
            { header: "Groepen", render: (instructor) => countBy(snapshot.data.groups, "instructor_id", instructor.id) },
            { header: "Sessions", render: (instructor) => countBy(snapshot.data.sessions, "instructor_id", instructor.id) },
            { header: "Status", render: (instructor) => <StatusPill tone={statusTone(instructor.status)}>{instructor.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen instructors gevonden voor deze tenant."
          rows={snapshot.data.instructors}
          rowKey={(instructor) => instructor.id}
        />
      </Card>
    </DomainFrame>
  );
}

function DomainFrame({ snapshot, kicker, title, subtitle, children }: DomainPageProps & { kicker: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="space-y-6">
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">Read-only data</StatusPill>} />
      <SnapshotStatus snapshot={snapshot} />
      {children}
    </div>
  );
}

function SnapshotStatus({ snapshot }: DomainPageProps) {
  if (snapshot.status === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-soft">
        <Database className="h-4 w-4 text-primary" />
        <span>
          Verbonden met <strong className="text-foreground">{snapshot.tenant?.name ?? "actieve tenant"}</strong>. CRUD blijft bewust uit tot na deze read-only foundation.
        </span>
      </div>
    );
  }

  return (
    <Card className="border-amber-200 bg-amber-50 text-amber-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{snapshot.status === "query_error" ? "Domeinquery nog niet groen" : "Domeindata nog niet beschikbaar"}</h2>
          <p className="mt-1 text-sm text-amber-800">Controleer Supabase env, migrations en tenantmembership voordat CRUD wordt toegevoegd.</p>
        </div>
        <StatusPill tone="warning">{snapshot.status}</StatusPill>
      </div>
      {snapshot.errors.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm">
          {snapshot.errors.map((error) => (
            <li key={error} className="rounded-xl bg-white/70 px-3 py-2">
              {error}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
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

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function DomainTable<Row>({ columns, rows, rowKey, emptyLabel }: { columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row) => string; emptyLabel: string }) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-sm text-muted-foreground">{emptyLabel}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase text-muted-foreground">
            {columns.map((column) => (
              <th key={column.header} className={`whitespace-nowrap px-3 py-3 font-semibold ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="align-top">
              {columns.map((column) => (
                <td key={column.header} className={`whitespace-nowrap px-3 py-3 ${column.className ?? ""}`}>
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

function StrongText({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-foreground">{children}</span>;
}

function CodeText({ children }: { children: ReactNode }) {
  return <span className="rounded-lg bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">{children}</span>;
}

function buildLookups(data: AdminDomainData): LookupMaps {
  return {
    programs: byId(data.programs),
    stages: byId(data.stages),
    subscriptionPlans: byId(data.subscriptionPlans),
    resources: byId(data.resources),
    instructors: byId(data.instructors),
    groups: byId(data.groups),
    participants: byId(data.participants),
    enrollments: byId(data.enrollments)
  };
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function enrollmentParticipantName(lookups: LookupMaps, enrollmentId: string) {
  const enrollment = lookups.enrollments.get(enrollmentId);

  return enrollment ? (lookups.participants.get(enrollment.participant_id)?.display_name ?? "Onbekende participant") : "Onbekende enrollment";
}

function countBy<Row>(rows: Row[], key: keyof Row, value: string) {
  return rows.filter((row) => row[key] === value).length;
}

function nullableText(value: string | null | undefined) {
  return value && value.trim() !== "" ? value : <span className="text-muted-foreground">-</span>;
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "scheduled", "issued", "passed", "completed"].includes(status)) {
    return "success";
  }

  if (["draft", "pending", "planned", "paused", "maintenance", "in_progress", "needs_attention"].includes(status)) {
    return "warning";
  }

  if (["cancelled", "revoked", "inactive", "suspended"].includes(status)) {
    return "danger";
  }

  if (["observed"].includes(status)) {
    return "info";
  }

  return "neutral";
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatNumber(value: number | string) {
  const numericValue = Number(value);

  return Number.isInteger(numericValue) ? numericValue.toString() : numericValue.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatTime(value: string) {
  return value.slice(0, 5);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTimeTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function weekdayLabel(weekday: number) {
  const labels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return labels[weekday - 1] ?? `Dag ${weekday}`;
}
