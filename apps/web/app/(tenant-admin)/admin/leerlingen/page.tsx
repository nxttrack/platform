import { Clock3, UserPlus, UsersRound } from "lucide-react";

import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminFilterPills, AdminListSurface, AdminMetricCard } from "@/components/admin/admin-patterns";
import { Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { StudentsTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createGroupMembershipAction, createParticipantEnrollmentAction } from "@/lib/domain/actions";
import { getTenantCoreData } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminStudentsPage({ searchParams }: PageProps) {
  const data = await getTenantCoreData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const query = getParam(params, "q");
  const view = getParam(params, "view") ?? (getParam(params, "testdata") === "only" ? "test" : "all");
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const guardianById = new Map(data.guardians.map((guardian) => [guardian.userId, guardian]));
  const instructorById = new Map(data.instructors.map((instructor) => [instructor.userId, instructor]));
  const visibleEnrollments = data.enrollments.filter((enrollment) => {
    if (view === "active") return enrollment.status === "active";
    if (view === "test") return enrollment.is_test;
    if (view === "archive") return ["completed", "cancelled"].includes(enrollment.status);
    if (getParam(params, "testdata") === "hide") return !enrollment.is_test;
    return true;
  });

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <>
            <AdminActionDrawer description="Leg het leerlingprofiel en de eerste programma-inschrijving in één keer vast." title="Leerling toevoegen" triggerLabel="Leerling toevoegen">
              <EnrollmentForm data={data} />
            </AdminActionDrawer>
            <AdminActionDrawer description="Plaats een bestaande inschrijving in een lesgroep. De capaciteit wordt direct gecontroleerd." title="Plaatsen of verplaatsen" triggerLabel="Plaatsen" triggerVariant="outline">
              <PlacementForm data={data} participantById={participantById} programById={programById} />
            </AdminActionDrawer>
          </>
        }
        kicker="Leerlingen"
        subtitle="Beheer profielen, inschrijvingen en lesgroepplaatsingen vanuit één rustig dossieroverzicht."
        title="Leerlingdossiers"
      />
      <RouteFeedback success={saved ? "Leerlinggegevens zijn opgeslagen." : null} error={error === "capacity" ? "Deze groep heeft geen vrije capaciteit." : error ? "Opslaan is niet gelukt." : null} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard icon={UsersRound} label="Alle leerlingen" value={data.enrollments.length} />
        <AdminMetricCard icon={UserPlus} label="Actief" tone="success" value={data.enrollments.filter((enrollment) => enrollment.status === "active").length} />
        <AdminMetricCard icon={Clock3} label="Nog niet geplaatst" tone="warning" value={data.enrollments.filter((enrollment) => !data.groupMemberships.some((membership) => membership.enrollment_id === enrollment.id && ["active", "trial"].includes(membership.status))).length} />
        <AdminMetricCard label="Journey Bot" tone="info" value={data.enrollments.filter((enrollment) => enrollment.is_test).length} />
      </div>

      <AdminFilterPills
        current={view}
        href={(value) => `/admin/leerlingen?view=${value}`}
        items={[
          { count: data.enrollments.length, label: "Alle leerlingen", value: "all" },
          { count: data.enrollments.filter((item) => item.status === "active").length, label: "Actief", value: "active" },
          { href: "/admin/wachtlijst", label: "Wachtlijst", value: "waitlist" },
          { count: data.enrollments.filter((item) => item.is_test).length, label: "Testdata", value: "test" },
          { count: data.enrollments.filter((item) => ["completed", "cancelled"].includes(item.status)).length, label: "Uitgeschreven / archief", value: "archive" }
        ]}
      />

      <AdminListSurface>
        <StudentsTable
          initialSearch={query}
          rows={visibleEnrollments.map((enrollment) => {
            const participant = participantById.get(enrollment.participant_id);
            const memberships = data.groupMemberships.filter((membership) => membership.enrollment_id === enrollment.id && ["active", "trial"].includes(membership.status));
            const groups = memberships.flatMap((membership) => groupById.get(membership.group_id) ?? []);
            const instructorNames = groups.flatMap((group) =>
              data.groupInstructorAssignments
                .filter((assignment) => assignment.group_id === group.id && assignment.status === "active")
                .map((assignment) => instructorById.get(assignment.instructor_user_id)?.label ?? "Onbekende instructeur")
            );
            return {
              groups: groups.map((group) => group.name).join(", ") || "Nog niet geplaatst",
              guardian: participant?.guardian_user_id ? guardianById.get(participant.guardian_user_id)?.label ?? "Onbekende ouder/verzorger" : "Niet gekoppeld",
              id: enrollment.id,
              instructors: [...new Set(instructorNames)].join(", ") || "Nog niet toegewezen",
              isTest: enrollment.is_test,
              lesson: groups.map(formatGroupTime).join(", ") || "Nog niet gepland",
              name: participant?.display_name ?? "Onbekende leerling",
              program: programById.get(enrollment.program_id)?.name ?? "Programma onbekend",
              stage: enrollment.current_stage_id ? stageById.get(enrollment.current_stage_id)?.name ?? "Niveau onbekend" : "Nog geen niveau",
              startsOn: enrollment.starts_on,
              status: enrollment.status
            };
          })}
        />
      </AdminListSurface>
    </div>
  );
}

function EnrollmentForm({ data }: { data: Awaited<ReturnType<typeof getTenantCoreData>> }) {
  return (
    <DirtyForm action={createParticipantEnrollmentAction} className="grid gap-4 sm:grid-cols-2">
      <Field label="Leerlingnaam" name="displayName" required placeholder="Sam de Jong" />
      <Field label="Geboortedatum" name="birthDate" type="date" />
      <SelectField label="Ouder/verzorger" name="guardianUserId">
        <option value="">Nog niet gekoppeld</option>
        {data.guardians.map((guardian) => <option key={guardian.userId} value={guardian.userId}>{guardian.label}</option>)}
      </SelectField>
      <Field label="Startdatum" name="startsOn" type="date" />
      <SelectField label="Programma" name="programId" required>
        <option value="">Kies programma</option>
        {data.programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
      </SelectField>
      <SelectField label="Huidig niveau" name="stageId">
        <option value="">Nog niet gezet</option>
        {data.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
      </SelectField>
      <div className="sm:col-span-2"><SubmitButton>Leerling inschrijven</SubmitButton></div>
    </DirtyForm>
  );
}

function PlacementForm({
  data,
  participantById,
  programById
}: {
  data: Awaited<ReturnType<typeof getTenantCoreData>>;
  participantById: Map<string, Awaited<ReturnType<typeof getTenantCoreData>>["participants"][number]>;
  programById: Map<string, Awaited<ReturnType<typeof getTenantCoreData>>["programs"][number]>;
}) {
  return (
    <DirtyForm action={createGroupMembershipAction} className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Inschrijving" name="enrollmentId" required>
        <option value="">Kies inschrijving</option>
        {data.enrollments.map((enrollment) => <option key={enrollment.id} value={enrollment.id}>{participantById.get(enrollment.participant_id)?.display_name ?? "Leerling"} · {programById.get(enrollment.program_id)?.name ?? "Programma"}</option>)}
      </SelectField>
      <SelectField label="Lesgroep" name="groupId" required>
        <option value="">Kies groep</option>
        {data.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
      </SelectField>
      <SelectField label="Status" name="status">
        <option value="active">Actief</option>
        <option value="trial">Proefles</option>
        <option value="paused">Gepauzeerd</option>
      </SelectField>
      <Field label="Capaciteitsgewicht" name="capacityWeight" type="number" defaultValue={1} />
      <Field label="Startdatum" name="startsOn" type="date" />
      <div className="sm:col-span-2"><SubmitButton>In groep plaatsen</SubmitButton></div>
    </DirtyForm>
  );
}

function formatGroupTime(group: Awaited<ReturnType<typeof getTenantCoreData>>["groups"][number]) {
  const weekdays = ["", "Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
  if (!group.default_weekday || !group.default_start_time) return "Nog niet gepland";
  return `${weekdays[group.default_weekday]} ${group.default_start_time.slice(0, 5)}${group.default_end_time ? `–${group.default_end_time.slice(0, 5)}` : ""}`;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
