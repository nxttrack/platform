import { AdminSection, DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
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
  const participantById = new Map(data.participants.map((participant) => [participant.id, participant]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const groupById = new Map(data.groups.map((group) => [group.id, group]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Core domeinmodel" title="Leerlingen en inschrijvingen" subtitle="Maak een parent-mediated leerling aan, schrijf die in op een programma en plaats die in een groep." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Leerling + inschrijving" description="Nog geen intake/wachtlijst: dit is handmatig beheer voor het operationele model.">
          <form action={createParticipantEnrollmentAction} className="grid gap-4 md:grid-cols-2">
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
          </form>
        </AdminSection>

        <AdminSection title="Plaatsing in lesgroep" description="Groepsplaatsing telt mee in de capaciteit van de lesgroep.">
          <form action={createGroupMembershipAction} className="grid gap-4 md:grid-cols-2">
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
          </form>
        </AdminSection>
      </div>

      <AdminSection title="Inschrijvingen en plaatsingen">
        {data.enrollments.length === 0 ? (
          <EmptyState>Nog geen inschrijvingen.</EmptyState>
        ) : (
          <DataList>
            {data.enrollments.map((enrollment) => {
              const participant = participantById.get(enrollment.participant_id);
              const memberships = data.groupMemberships.filter((membership) => membership.enrollment_id === enrollment.id && (membership.status === "active" || membership.status === "trial"));
              const groupNames = memberships.map((membership) => groupById.get(membership.group_id)?.name ?? "Onbekende groep");

              return (
                <DataListRow
                  key={enrollment.id}
                  title={participant?.display_name ?? "Onbekende leerling"}
                  meta={
                    <span>
                      {programById.get(enrollment.program_id)?.name ?? "programma onbekend"} · {enrollment.current_stage_id ? stageById.get(enrollment.current_stage_id)?.name ?? "stage onbekend" : "geen stage"} ·{" "}
                      {groupNames.length > 0 ? groupNames.join(", ") : "nog niet geplaatst"}
                    </span>
                  }
                  aside={<StatusPill tone={enrollment.status === "active" ? "success" : "neutral"}>{enrollment.status}</StatusPill>}
                />
              );
            })}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function Feedback({ saved, error }: { saved: boolean; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
  }

  if (error === "capacity") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Deze groep heeft geen vrije capaciteit.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Opslaan is niet gelukt.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
