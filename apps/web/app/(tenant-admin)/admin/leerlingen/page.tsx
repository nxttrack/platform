import { AdminSection, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { StudentsTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createGroupMembershipAction, createParticipantEnrollmentAction } from "@/lib/domain/actions";
import { getTenantCoreData } from "@/lib/domain/core";
import Link from "next/link";

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
  const testFilter = getParam(params, "testdata") ?? "all";
  const enrollments = data.enrollments.filter((enrollment) => testFilter === "only" ? enrollment.is_test : testFilter === "hide" ? !enrollment.is_test : true);
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const guardianById = new Map(data.guardians.map((guardian) => [guardian.userId, guardian]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Core domeinmodel" title="Leerlingen en inschrijvingen" subtitle="Maak een parent-mediated leerling aan, schrijf die in op een programma en plaats die in een groep." />
      <RouteFeedback success={saved ? "Leerlinggegevens zijn opgeslagen." : null} error={error === "capacity" ? "Deze groep heeft geen vrije capaciteit." : error ? "Opslaan is niet gelukt." : null} />
      <TestDataFilter current={testFilter} />

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Leerling + inschrijving" description="Nog geen intake/wachtlijst: dit is handmatig beheer voor het operationele model.">
          <DirtyForm action={createParticipantEnrollmentAction} className="grid gap-4 md:grid-cols-2">
            <Field label="Leerlingnaam" name="displayName" required placeholder="Sam de Jong" />
            <Field label="Geboortedatum" name="birthDate" type="date" />
            <SelectField label="Ouder/guardian" name="guardianUserId">
              <option value="">Nog niet gekoppeld</option>
              {data.guardians.map((guardian) => (
                <option key={guardian.userId} value={guardian.userId}>
                  {guardian.label}
                </option>
              ))}
            </SelectField>
            <Field label="Startdatum" name="startsOn" type="date" />
            <SelectField label="Programma" name="programId" required>
              <option value="">Kies programma</option>
              {data.programs.map((program) => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Huidig badje/stage" name="stageId">
              <option value="">Nog niet gezet</option>
              {data.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </SelectField>
            <div className="md:col-span-2">
              <SubmitButton>Leerling inschrijven</SubmitButton>
            </div>
          </DirtyForm>
        </AdminSection>

        <AdminSection title="Plaatsing in lesgroep" description="Groepsplaatsing telt mee in de capaciteit van de lesgroep.">
          <DirtyForm action={createGroupMembershipAction} className="grid gap-4 md:grid-cols-2">
            <SelectField label="Inschrijving" name="enrollmentId" required>
              <option value="">Kies inschrijving</option>
              {data.enrollments.map((enrollment) => {
                const participant = participantById.get(enrollment.participant_id);
                const program = programById.get(enrollment.program_id);

                return (
                  <option key={enrollment.id} value={enrollment.id}>
                    {participant?.display_name ?? "Leerling"} · {program?.name ?? "Programma"}
                  </option>
                );
              })}
            </SelectField>
            <SelectField label="Lesgroep" name="groupId" required>
              <option value="">Kies groep</option>
              {data.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Status" name="status">
              <option value="active">Actief</option>
              <option value="trial">Proefles</option>
              <option value="paused">Gepauzeerd</option>
            </SelectField>
            <Field label="Capaciteitsgewicht" name="capacityWeight" type="number" defaultValue={1} />
            <Field label="Startdatum" name="startsOn" type="date" />
            <div className="md:col-span-2">
              <SubmitButton>In groep plaatsen</SubmitButton>
            </div>
          </DirtyForm>
        </AdminSection>
      </div>

      <AdminSection title="Inschrijvingen en plaatsingen">
        <StudentsTable
          initialSearch={query}
          rows={enrollments.map((enrollment) => {
            const participant = participantById.get(enrollment.participant_id);
            const memberships = data.groupMemberships.filter((membership) => membership.enrollment_id === enrollment.id && (membership.status === "active" || membership.status === "trial"));
            return {
              groups: memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Onbekende groep").join(", ") || "Nog niet geplaatst",
              guardian: participant?.guardian_user_id ? guardianById.get(participant.guardian_user_id)?.label ?? "Onbekende ouder/verzorger" : "Niet gekoppeld",
              id: enrollment.id,
              isTest: enrollment.is_test,
              name: participant?.display_name ?? "Onbekende leerling",
              program: programById.get(enrollment.program_id)?.name ?? "Programma onbekend",
              stage: enrollment.current_stage_id ? stageById.get(enrollment.current_stage_id)?.name ?? "Niveau onbekend" : "Nog geen niveau",
              startsOn: enrollment.starts_on,
              status: enrollment.status
            };
          })}
        />
      </AdminSection>
    </div>
  );
}

function TestDataFilter({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {[["all", "Alle"], ["hide", "Verberg testdata"], ["only", "Alleen testdata"]].map(([value, label]) => (
        <Link className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${current === value ? "bg-primary text-primary-foreground ring-primary" : "bg-white text-muted-foreground ring-border"}`} href={`/admin/leerlingen?testdata=${value}`} key={value}>{label}</Link>
      ))}
    </div>
  );
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
