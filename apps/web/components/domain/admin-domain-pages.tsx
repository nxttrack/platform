import type { ReactNode } from "react";
import { CalendarDays, CircleDollarSign, Database, MapPin, Users, Waves } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import type {
  AdminDomainData,
  AdminDomainSnapshot,
  BadgeRow,
  EnrollmentRow,
  GroupMembershipRow,
  GroupRow,
  InstructorRow,
  ParticipantRow,
  ProgramRow,
  ResourceRow,
  SessionRow,
  StageRow,
  SubscriptionPlanRow
} from "@/lib/domain/admin-domain-read-model";
import {
  createEnrollmentAction,
  createGroupAction,
  createGroupMembershipAction,
  createInstructorAction,
  createParticipantAction,
  createProgramAction,
  createResourceAction,
  createSessionAction,
  createStageAction,
  createSubscriptionPlanAction,
  updateEnrollmentAction,
  updateGroupAction,
  updateGroupMembershipAction,
  updateInstructorAction,
  updateParticipantAction,
  updateProgramAction,
  updateResourceAction,
  updateSessionAction,
  updateStageAction,
  updateSubscriptionPlanAction
} from "@/lib/domain/admin-domain-actions";

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
      kicker="Tenant admin - Phase 3"
      title="Domein foundation"
      subtitle="Beperkte CRUD op de generieke NXTTRACK kern: aanbod, niveaus, groepen, lessen, resources, inschrijvingen en begeleiding."
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
            <StatusPill tone="info">Limited CRUD</StatusPill>
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
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - aanbod" title="Programs" subtitle="Het aangeboden product of leertraject. Stages en subscription plans blijven los gekoppeld aan de enrollment.">
      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <SectionHeader title="Programs" count={snapshot.data.programs.length} />
          <CreateProgramForm />
          <DomainTable
            columns={[
              { header: "Naam", render: (program) => <StrongText>{program.name}</StrongText> },
              { header: "Code", render: (program) => <CodeText>{program.code}</CodeText> },
              { header: "Stages", render: (program) => countBy(snapshot.data.stages, "program_id", program.id) },
              { header: "Status", render: (program) => <StatusPill tone={statusTone(program.status)}>{program.status}</StatusPill> },
              { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (program) => <ProgramForm mode="update" program={program} /> }
            ]}
            emptyLabel="Nog geen programs gevonden voor deze tenant."
            rows={snapshot.data.programs}
            rowKey={(program) => program.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Subscription plans" count={snapshot.data.subscriptionPlans.length} />
          <CreateSubscriptionPlanForm />
          <DomainTable
            columns={[
              { header: "Plan", render: (plan) => <StrongText>{plan.name}</StrongText> },
              { header: "Billing", render: (plan) => plan.billing_interval },
              { header: "Prijs", render: (plan) => formatMoney(plan.price_cents, plan.currency) },
              { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (plan) => <SubscriptionPlanForm mode="update" plan={plan} /> }
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
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - progressie" title="Stages" subtitle="Stages beschrijven alleen leerprogressie binnen een program. Ze bevatten geen prijs, facturatie of abonnement.">
      <Card>
        <SectionHeader title="Stages" count={snapshot.data.stages.length} />
        <CreateStageForm programs={snapshot.data.programs} />
        <DomainTable
          columns={[
            { header: "Stage", render: (stage) => <StrongText>{stage.name}</StrongText> },
            { header: "Program", render: (stage) => lookups.programs.get(stage.program_id)?.name ?? "Onbekend program" },
            { header: "Code", render: (stage) => <CodeText>{stage.code}</CodeText> },
            { header: "Volgorde", render: (stage) => stage.sort_order },
            { header: "Status", render: (stage) => <StatusPill tone={statusTone(stage.status)}>{stage.status}</StatusPill> },
            { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (stage) => <StageForm mode="update" programs={snapshot.data.programs} stage={stage} /> }
          ]}
          emptyLabel="Nog geen stages gevonden voor deze tenant."
          rows={snapshot.data.stages}
          rowKey={(stage) => stage.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminBadgesPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - achievements" title="Badges" subtitle="Badge definitions per program/stage. Awards en achievement cards worden vanuit de instructor workflow toegekend.">
      <Card>
        <SectionHeader title="Badge definitions" count={snapshot.data.badges.length} />
        <DomainTable<BadgeRow>
          columns={[
            { header: "Badge", render: (badge) => <StrongText>{badge.name}</StrongText> },
            { header: "Code", render: (badge) => <CodeText>{badge.code}</CodeText> },
            { header: "Program", render: (badge) => nullableText(lookups.programs.get(badge.program_id ?? "")?.name) },
            { header: "Stage", render: (badge) => nullableText(lookups.stages.get(badge.stage_id ?? "")?.name) },
            { header: "Beschrijving", className: "min-w-[260px] whitespace-normal", render: (badge) => nullableText(badge.description) },
            { header: "Status", render: (badge) => <StatusPill tone={statusTone(badge.status)}>{badge.status}</StatusPill> }
          ]}
          emptyLabel="Nog geen badge definitions gevonden."
          rows={snapshot.data.badges}
          rowKey={(badge) => badge.id}
        />
      </Card>
    </DomainFrame>
  );
}

export function AdminGroupsPage({ snapshot }: DomainPageProps) {
  const lookups = buildLookups(snapshot.data);

  return (
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - planning" title="Groups" subtitle="Terugkerende lesgroepen met program, stage, resource, instructor, tijdslot en capaciteit.">
      <Card>
        <SectionHeader title="Groups" count={snapshot.data.groups.length} />
        <CreateGroupForm data={snapshot.data} />
        <DomainTable
          columns={[
            { header: "Groep", render: (group) => <StrongText>{group.name}</StrongText> },
            { header: "Program", render: (group) => lookups.programs.get(group.program_id)?.name ?? "Onbekend" },
            { header: "Stage", render: (group) => lookups.stages.get(group.stage_id)?.name ?? "Onbekend" },
            { header: "Moment", render: (group) => `${weekdayLabel(group.weekday)} ${formatTime(group.starts_at)}-${formatTime(group.ends_at)}` },
            { header: "Resource", render: (group) => nullableText(lookups.resources.get(group.resource_id ?? "")?.name) },
            { header: "Instructor", render: (group) => nullableText(lookups.instructors.get(group.instructor_id ?? "")?.display_name) },
            { header: "Cap.", render: (group) => group.capacity },
            { header: "Status", render: (group) => <StatusPill tone={statusTone(group.status)}>{group.status}</StatusPill> },
            { header: "Actie", className: "min-w-[360px] whitespace-normal", render: (group) => <GroupForm data={snapshot.data} group={group} mode="update" /> }
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
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - lessen" title="Sessions" subtitle="Concrete lesmomenten die uit groups voortkomen. De lijst blijft beperkt tot de eerste 25 records.">
      <Card>
        <SectionHeader title="Sessions" count={snapshot.data.sessions.length} />
        <CreateSessionForm data={snapshot.data} />
        <DomainTable
          columns={[
            { header: "Datum", render: (session) => formatDateTime(session.starts_at) },
            { header: "Tijd", render: (session) => `${formatDateTimeTime(session.starts_at)}-${formatDateTimeTime(session.ends_at)}` },
            { header: "Groep", render: (session) => lookups.groups.get(session.group_id)?.name ?? "Onbekende groep" },
            { header: "Resource", render: (session) => nullableText(lookups.resources.get(session.resource_id ?? "")?.name) },
            { header: "Instructor", render: (session) => nullableText(lookups.instructors.get(session.instructor_id ?? "")?.display_name) },
            { header: "Status", render: (session) => <StatusPill tone={statusTone(session.status)}>{session.status}</StatusPill> },
            { header: "Actie", className: "min-w-[360px] whitespace-normal", render: (session) => <SessionForm data={snapshot.data} mode="update" session={session} /> }
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
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - capaciteit" title="Resources" subtitle="Plaatsen, banen, ruimtes of velden waarop groepen en sessions gepland worden.">
      <Card>
        <SectionHeader title="Resources" count={snapshot.data.resources.length} />
        <CreateResourceForm />
        <DomainTable
          columns={[
            { header: "Resource", render: (resource) => <StrongText>{resource.name}</StrongText> },
            { header: "Type", render: (resource) => resource.resource_type },
            { header: "Locatie", render: (resource) => nullableText(resource.location_name) },
            { header: "Capaciteit", render: (resource) => resource.capacity },
            { header: "Code", render: (resource) => <CodeText>{resource.code}</CodeText> },
            { header: "Status", render: (resource) => <StatusPill tone={statusTone(resource.status)}>{resource.status}</StatusPill> },
            { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (resource) => <ResourceForm mode="update" resource={resource} /> }
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
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - deelnemers" title="Enrollments" subtitle="Deelname aan een program met aparte kolommen voor huidige stage en subscription plan.">
      <Card>
        <SectionHeader title="Enrollments" count={snapshot.data.enrollments.length} />
        <CreateEnrollmentForm data={snapshot.data} />
        <DomainTable
          columns={[
            { header: "Leerling", render: (enrollment) => lookups.participants.get(enrollment.participant_id)?.display_name ?? "Onbekende participant" },
            { header: "Program", render: (enrollment) => lookups.programs.get(enrollment.program_id)?.name ?? "Onbekend" },
            { header: "Huidige stage", render: (enrollment) => nullableText(lookups.stages.get(enrollment.current_stage_id ?? "")?.name) },
            { header: "Subscription plan", render: (enrollment) => nullableText(lookups.subscriptionPlans.get(enrollment.subscription_plan_id ?? "")?.name) },
            { header: "Start", render: (enrollment) => formatDate(enrollment.started_on) },
            { header: "Status", render: (enrollment) => <StatusPill tone={statusTone(enrollment.status)}>{enrollment.status}</StatusPill> },
            { header: "Actie", className: "min-w-[360px] whitespace-normal", render: (enrollment) => <EnrollmentForm data={snapshot.data} enrollment={enrollment} mode="update" /> }
          ]}
          emptyLabel="Nog geen enrollments gevonden voor deze tenant."
          rows={snapshot.data.enrollments}
          rowKey={(enrollment) => enrollment.id}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="Participants" count={snapshot.data.participants.length} />
          <CreateParticipantForm />
          <DomainTable
            columns={[
              { header: "Naam", render: (participant) => <StrongText>{participant.display_name}</StrongText> },
              { header: "Geboortedatum", render: (participant) => nullableText(participant.birthdate ? formatDate(participant.birthdate) : null) },
              { header: "Referentie", render: (participant) => nullableText(participant.external_reference) },
              { header: "Status", render: (participant) => <StatusPill tone={statusTone(participant.status)}>{participant.status}</StatusPill> },
              { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (participant) => <ParticipantForm mode="update" participant={participant} /> }
            ]}
            emptyLabel="Nog geen participants gevonden."
            rows={snapshot.data.participants}
            rowKey={(participant) => participant.id}
          />
        </Card>

        <Card>
          <SectionHeader title="Group memberships" count={snapshot.data.groupMemberships.length} />
          <CreateGroupMembershipForm data={snapshot.data} />
          <DomainTable
            columns={[
              { header: "Leerling", render: (membership) => enrollmentParticipantName(lookups, membership.enrollment_id) },
              { header: "Groep", render: (membership) => lookups.groups.get(membership.group_id)?.name ?? "Onbekend" },
              { header: "Vanaf", render: (membership) => formatDate(membership.starts_on) },
              { header: "Status", render: (membership) => <StatusPill tone={statusTone(membership.status)}>{membership.status}</StatusPill> },
              { header: "Actie", className: "min-w-[340px] whitespace-normal", render: (membership) => <GroupMembershipForm data={snapshot.data} membership={membership} mode="update" /> }
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
    <DomainFrame snapshot={snapshot} kicker="Tenant admin - team" title="Instructors" subtitle="Begeleiders die aan groups en sessions gekoppeld kunnen worden.">
      <Card>
        <SectionHeader title="Instructors" count={snapshot.data.instructors.length} />
        <CreateInstructorForm />
        <DomainTable
          columns={[
            { header: "Naam", render: (instructor) => <StrongText>{instructor.display_name}</StrongText> },
            { header: "E-mail", render: (instructor) => nullableText(instructor.email) },
            { header: "Groepen", render: (instructor) => countBy(snapshot.data.groups, "instructor_id", instructor.id) },
            { header: "Sessions", render: (instructor) => countBy(snapshot.data.sessions, "instructor_id", instructor.id) },
            { header: "Status", render: (instructor) => <StatusPill tone={statusTone(instructor.status)}>{instructor.status}</StatusPill> },
            { header: "Actie", className: "min-w-[320px] whitespace-normal", render: (instructor) => <InstructorForm instructor={instructor} mode="update" /> }
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
      <PageHeader kicker={kicker} title={title} subtitle={subtitle} action={<StatusPill tone="info">Limited CRUD</StatusPill>} />
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
          Verbonden met <strong className="text-foreground">{snapshot.tenant?.name ?? "actieve tenant"}</strong>. Create/update/status is actief; harde deletes blijven uit.
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

function CreateProgramForm() {
  return (
    <CreatePanel title="Nieuw program">
      <ProgramForm mode="create" />
    </CreatePanel>
  );
}

function ProgramForm({ mode, program }: { mode: "create"; program?: never } | { mode: "update"; program: ProgramRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createProgramAction : updateProgramAction} submitLabel={mode === "create" ? "Program opslaan" : "Wijzigingen opslaan"}>
      {program ? <input name="id" type="hidden" value={program.id} /> : null}
      <TextField defaultValue={program?.name} label="Naam" name="name" required />
      <TextField defaultValue={program?.code} label="Code" name="code" />
      <TextAreaField defaultValue={program?.description} label="Beschrijving" name="description" />
      <SelectField defaultValue={program?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
      <TextField defaultValue={program?.sort_order ?? 0} label="Volgorde" name="sort_order" type="number" />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateSubscriptionPlanForm() {
  return (
    <CreatePanel title="Nieuw subscription plan">
      <SubscriptionPlanForm mode="create" />
    </CreatePanel>
  );
}

function SubscriptionPlanForm({ mode, plan }: { mode: "create"; plan?: never } | { mode: "update"; plan: SubscriptionPlanRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createSubscriptionPlanAction : updateSubscriptionPlanAction} submitLabel={mode === "create" ? "Plan opslaan" : "Wijzigingen opslaan"}>
      {plan ? <input name="id" type="hidden" value={plan.id} /> : null}
      <TextField defaultValue={plan?.name} label="Naam" name="name" required />
      <TextField defaultValue={plan?.code} label="Code" name="code" />
      <TextAreaField defaultValue={plan?.description} label="Beschrijving" name="description" />
      <SelectField defaultValue={plan?.billing_interval ?? "monthly"} label="Billing" name="billing_interval" options={billingIntervalOptions} />
      <TextField defaultValue={plan ? formatPriceInput(plan.price_cents) : "0"} label="Prijs" name="price" step="0.01" type="number" />
      <TextField defaultValue={plan?.currency ?? "EUR"} label="Valuta" name="currency" required />
      <TextField defaultValue={plan?.lesson_frequency_per_week ?? 1} label="Lessen p/w" name="lesson_frequency_per_week" step="0.25" type="number" />
      <SelectField defaultValue={plan?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateStageForm({ programs }: { programs: ProgramRow[] }) {
  return (
    <CreatePanel title="Nieuwe stage">
      <StageForm mode="create" programs={programs} />
    </CreatePanel>
  );
}

function StageForm({ mode, programs, stage }: { mode: "create"; programs: ProgramRow[]; stage?: never } | { mode: "update"; programs: ProgramRow[]; stage: StageRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createStageAction : updateStageAction} submitLabel={mode === "create" ? "Stage opslaan" : "Wijzigingen opslaan"}>
      {stage ? <input name="id" type="hidden" value={stage.id} /> : null}
      <SelectField defaultValue={stage?.program_id} label="Program" name="program_id" options={programs.map(optionFromName)} required />
      <TextField defaultValue={stage?.name} label="Naam" name="name" required />
      <TextField defaultValue={stage?.code} label="Code" name="code" />
      <TextAreaField defaultValue={stage?.description} label="Beschrijving" name="description" />
      <TextField defaultValue={stage?.sort_order ?? 0} label="Volgorde" name="sort_order" type="number" />
      <SelectField defaultValue={stage?.status ?? "active"} label="Status" name="status" options={programStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateResourceForm() {
  return (
    <CreatePanel title="Nieuwe resource">
      <ResourceForm mode="create" />
    </CreatePanel>
  );
}

function ResourceForm({ mode, resource }: { mode: "create"; resource?: never } | { mode: "update"; resource: ResourceRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createResourceAction : updateResourceAction} submitLabel={mode === "create" ? "Resource opslaan" : "Wijzigingen opslaan"}>
      {resource ? <input name="id" type="hidden" value={resource.id} /> : null}
      <TextField defaultValue={resource?.name} label="Naam" name="name" required />
      <TextField defaultValue={resource?.code} label="Code" name="code" />
      <SelectField defaultValue={resource?.resource_type ?? "space"} label="Type" name="resource_type" options={resourceTypeOptions} />
      <TextField defaultValue={resource?.location_name} label="Locatie" name="location_name" />
      <TextField defaultValue={resource?.capacity ?? 1} label="Capaciteit" min={1} name="capacity" type="number" />
      <SelectField defaultValue={resource?.status ?? "active"} label="Status" name="status" options={resourceStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateInstructorForm() {
  return (
    <CreatePanel title="Nieuwe instructor">
      <InstructorForm mode="create" />
    </CreatePanel>
  );
}

function InstructorForm({ mode, instructor }: { mode: "create"; instructor?: never } | { mode: "update"; instructor: InstructorRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createInstructorAction : updateInstructorAction} submitLabel={mode === "create" ? "Instructor opslaan" : "Wijzigingen opslaan"}>
      {instructor ? <input name="id" type="hidden" value={instructor.id} /> : null}
      <TextField defaultValue={instructor?.display_name} label="Naam" name="display_name" required />
      <TextField defaultValue={instructor?.email} label="E-mail" name="email" type="email" />
      <SelectField defaultValue={instructor?.status ?? "active"} label="Status" name="status" options={activeInactiveOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateGroupForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe group">
      <GroupForm data={data} mode="create" />
    </CreatePanel>
  );
}

function GroupForm({ mode, data, group }: { mode: "create"; data: AdminDomainData; group?: never } | { mode: "update"; data: AdminDomainData; group: GroupRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createGroupAction : updateGroupAction} submitLabel={mode === "create" ? "Group opslaan" : "Wijzigingen opslaan"}>
      {group ? <input name="id" type="hidden" value={group.id} /> : null}
      <TextField defaultValue={group?.name} label="Naam" name="name" required />
      <TextField defaultValue={group?.code} label="Code" name="code" />
      <SelectField defaultValue={group?.program_id} label="Program" name="program_id" options={data.programs.map(optionFromName)} required />
      <SelectField defaultValue={group?.stage_id} label="Stage" name="stage_id" options={data.stages.map(optionFromName)} required />
      <SelectField defaultValue={group?.resource_id ?? ""} includeEmpty label="Resource" name="resource_id" options={data.resources.map(optionFromName)} />
      <SelectField defaultValue={group?.instructor_id ?? ""} includeEmpty label="Instructor" name="instructor_id" options={data.instructors.map((instructor) => ({ label: instructor.display_name, value: instructor.id }))} />
      <SelectField defaultValue={String(group?.weekday ?? 1)} label="Weekdag" name="weekday" options={weekdayOptions} />
      <TextField defaultValue={group?.starts_at ? formatTime(group.starts_at) : ""} label="Start" name="starts_at" required type="time" />
      <TextField defaultValue={group?.ends_at ? formatTime(group.ends_at) : ""} label="Einde" name="ends_at" required type="time" />
      <TextField defaultValue={group?.capacity ?? 1} label="Capaciteit" min={1} name="capacity" type="number" />
      <SelectField defaultValue={group?.status ?? "active"} label="Status" name="status" options={groupStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateSessionForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe session">
      <SessionForm data={data} mode="create" />
    </CreatePanel>
  );
}

function SessionForm({ mode, data, session }: { mode: "create"; data: AdminDomainData; session?: never } | { mode: "update"; data: AdminDomainData; session: SessionRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createSessionAction : updateSessionAction} submitLabel={mode === "create" ? "Session opslaan" : "Wijzigingen opslaan"}>
      {session ? <input name="id" type="hidden" value={session.id} /> : null}
      <SelectField defaultValue={session?.group_id} label="Group" name="group_id" options={data.groups.map(optionFromName)} required />
      <SelectField defaultValue={session?.resource_id ?? ""} includeEmpty label="Resource" name="resource_id" options={data.resources.map(optionFromName)} />
      <SelectField defaultValue={session?.instructor_id ?? ""} includeEmpty label="Instructor" name="instructor_id" options={data.instructors.map((instructor) => ({ label: instructor.display_name, value: instructor.id }))} />
      <TextField defaultValue={session ? formatDateTimeInput(session.starts_at) : ""} label="Start" name="starts_at" required type="datetime-local" />
      <TextField defaultValue={session ? formatDateTimeInput(session.ends_at) : ""} label="Einde" name="ends_at" required type="datetime-local" />
      <SelectField defaultValue={session?.status ?? "scheduled"} label="Status" name="status" options={sessionStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateParticipantForm() {
  return (
    <CreatePanel title="Nieuwe participant">
      <ParticipantForm mode="create" />
    </CreatePanel>
  );
}

function ParticipantForm({ mode, participant }: { mode: "create"; participant?: never } | { mode: "update"; participant: ParticipantRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createParticipantAction : updateParticipantAction} submitLabel={mode === "create" ? "Participant opslaan" : "Wijzigingen opslaan"}>
      {participant ? <input name="id" type="hidden" value={participant.id} /> : null}
      <TextField defaultValue={participant?.display_name} label="Naam" name="display_name" required />
      <TextField defaultValue={participant?.birthdate ?? ""} label="Geboortedatum" name="birthdate" type="date" />
      <TextField defaultValue={participant?.external_reference} label="Referentie" name="external_reference" />
      <SelectField defaultValue={participant?.status ?? "active"} label="Status" name="status" options={participantStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateEnrollmentForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe enrollment">
      <EnrollmentForm data={data} mode="create" />
    </CreatePanel>
  );
}

function EnrollmentForm({ mode, data, enrollment }: { mode: "create"; data: AdminDomainData; enrollment?: never } | { mode: "update"; data: AdminDomainData; enrollment: EnrollmentRow }) {
  const form = (
    <DomainForm action={mode === "create" ? createEnrollmentAction : updateEnrollmentAction} submitLabel={mode === "create" ? "Enrollment opslaan" : "Wijzigingen opslaan"}>
      {enrollment ? <input name="id" type="hidden" value={enrollment.id} /> : null}
      <TextField defaultValue={enrollment?.external_reference} label="Referentie" name="external_reference" />
      <SelectField defaultValue={enrollment?.participant_id} label="Participant" name="participant_id" options={data.participants.map((participant) => ({ label: participant.display_name, value: participant.id }))} required />
      <SelectField defaultValue={enrollment?.program_id} label="Program" name="program_id" options={data.programs.map(optionFromName)} required />
      <SelectField defaultValue={enrollment?.current_stage_id ?? ""} includeEmpty label="Huidige stage" name="current_stage_id" options={data.stages.map(optionFromName)} />
      <SelectField defaultValue={enrollment?.subscription_plan_id ?? ""} includeEmpty label="Subscription plan" name="subscription_plan_id" options={data.subscriptionPlans.map(optionFromName)} />
      <TextField defaultValue={enrollment?.started_on ?? todayInput()} label="Startdatum" name="started_on" required type="date" />
      <TextField defaultValue={enrollment?.ended_on ?? ""} label="Einddatum" name="ended_on" type="date" />
      <SelectField defaultValue={enrollment?.status ?? "active"} label="Status" name="status" options={enrollmentStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreateGroupMembershipForm({ data }: { data: AdminDomainData }) {
  return (
    <CreatePanel title="Nieuwe group membership">
      <GroupMembershipForm data={data} mode="create" />
    </CreatePanel>
  );
}

function GroupMembershipForm({ mode, data, membership }: { mode: "create"; data: AdminDomainData; membership?: never } | { mode: "update"; data: AdminDomainData; membership: GroupMembershipRow }) {
  const lookups = buildLookups(data);
  const enrollmentOptions = data.enrollments.map((enrollment) => ({
    label: enrollmentParticipantName(lookups, enrollment.id),
    value: enrollment.id
  }));
  const form = (
    <DomainForm action={mode === "create" ? createGroupMembershipAction : updateGroupMembershipAction} submitLabel={mode === "create" ? "Membership opslaan" : "Wijzigingen opslaan"}>
      {membership ? <input name="id" type="hidden" value={membership.id} /> : null}
      <SelectField defaultValue={membership?.enrollment_id} label="Enrollment" name="enrollment_id" options={enrollmentOptions} required />
      <SelectField defaultValue={membership?.group_id} label="Group" name="group_id" options={data.groups.map(optionFromName)} required />
      <TextField defaultValue={membership?.starts_on ?? todayInput()} label="Startdatum" name="starts_on" required type="date" />
      <TextField defaultValue={membership?.ends_on ?? ""} label="Einddatum" name="ends_on" type="date" />
      <SelectField defaultValue={membership?.status ?? "active"} label="Status" name="status" options={membershipStatusOptions} />
    </DomainForm>
  );

  return mode === "update" ? <EditPanel>{form}</EditPanel> : form;
}

function CreatePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="mb-4 rounded-2xl border border-border bg-muted/40 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-primary">{title}</summary>
      <div className="mt-4">{children}</div>
    </details>
  );
}

function EditPanel({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-border bg-muted/30 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-primary">Bewerken</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function DomainForm({ action, submitLabel, children }: { action: (formData: FormData) => Promise<void>; submitLabel: string; children: ReactNode }) {
  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
      <div>
        <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90" type="submit">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function TextField({
  defaultValue,
  label,
  min,
  name,
  required,
  step,
  type = "text"
}: {
  defaultValue?: string | number | null;
  label: string;
  min?: number;
  name: string;
  required?: boolean;
  step?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input
        className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
        defaultValue={defaultValue ?? ""}
        min={min}
        name={name}
        required={required}
        step={step}
        type={type}
      />
    </label>
  );
}

function TextAreaField({ defaultValue, label, name }: { defaultValue?: string | null; label: string; name: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground md:col-span-2">
      <span>{label}</span>
      <textarea className="min-h-20 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2" defaultValue={defaultValue ?? ""} name={name} />
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
  defaultValue?: string | number | null;
  includeEmpty?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string | number }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select
        className="min-h-10 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2"
        defaultValue={defaultValue ?? ""}
        name={name}
        required={required}
      >
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

function formatDateTimeInput(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function formatPriceInput(priceCents: number) {
  return (priceCents / 100).toFixed(2);
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayLabel(weekday: number) {
  const labels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

  return labels[weekday - 1] ?? `Dag ${weekday}`;
}

function optionFromName(row: { id: string; name: string }) {
  return {
    label: row.name,
    value: row.id
  };
}

const programStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Archived", value: "archived" }
];

const billingIntervalOptions = [
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
  { label: "Quarterly", value: "quarterly" },
  { label: "Yearly", value: "yearly" },
  { label: "Manual", value: "manual" }
];

const resourceTypeOptions = [
  { label: "Lane", value: "lane" },
  { label: "Pool", value: "pool" },
  { label: "Room", value: "room" },
  { label: "Field", value: "field" },
  { label: "Space", value: "space" }
];

const resourceStatusOptions = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Maintenance", value: "maintenance" }
];

const activeInactiveOptions = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" }
];

const groupStatusOptions = [
  { label: "Draft", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" }
];

const sessionStatusOptions = [
  { label: "Scheduled", value: "scheduled" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" }
];

const participantStatusOptions = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Archived", value: "archived" }
];

const enrollmentStatusOptions = [
  { label: "Pending", value: "pending" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" }
];

const membershipStatusOptions = [
  { label: "Planned", value: "planned" },
  { label: "Active", value: "active" },
  { label: "Ended", value: "ended" },
  { label: "Cancelled", value: "cancelled" }
];

const weekdayOptions = [
  { label: "Maandag", value: 1 },
  { label: "Dinsdag", value: 2 },
  { label: "Woensdag", value: 3 },
  { label: "Donderdag", value: 4 },
  { label: "Vrijdag", value: 5 },
  { label: "Zaterdag", value: 6 },
  { label: "Zondag", value: 7 }
];
