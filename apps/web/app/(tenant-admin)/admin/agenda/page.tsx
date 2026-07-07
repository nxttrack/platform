import { AdminSection, DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createSessionAction } from "@/lib/domain/actions";
import { getTenantCoreData } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminAgendaPage({ searchParams }: PageProps) {
  const data = await getTenantCoreData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Planboard" title="Lessen" subtitle="Plan concrete sessies op basis van lesgroepen, resources en optionele capaciteitsoverrides." />
      <Feedback saved={saved} error={error} />

      <AdminSection title="Les plannen" description="Een sessie is een concrete lesdatum en tijd. De capaciteit komt standaard van de groep.">
        <form action={createSessionAction} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField label="Lesgroep" name="groupId" required>
            <option value="">Kies groep</option>
            {data.groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Resource" name="resourceId">
            <option value="">Gebruik groepsresource</option>
            {data.resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </SelectField>
          <Field label="Start" name="startsAt" type="datetime-local" required />
          <Field label="Einde" name="endsAt" type="datetime-local" required />
          <SelectField label="Status" name="status">
            <option value="scheduled">Gepland</option>
            <option value="draft">Concept</option>
            <option value="completed">Afgerond</option>
            <option value="cancelled">Geannuleerd</option>
          </SelectField>
          <Field label="Capaciteit override" name="capacityOverride" type="number" />
          <div className="md:col-span-2 xl:col-span-4">
            <TextAreaField label="Notitie" name="notes" />
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <SubmitButton>Les opslaan</SubmitButton>
          </div>
        </form>
      </AdminSection>

      <AdminSection title="Geplande lessen">
        {data.sessions.length === 0 ? (
          <EmptyState>Nog geen lessen gepland.</EmptyState>
        ) : (
          <DataList>
            {data.sessions.map((session) => {
              const group = groupById.get(session.group_id);
              const resource = session.resource_id ? resourceById.get(session.resource_id) : group?.default_resource_id ? resourceById.get(group.default_resource_id) : null;
              const capacity = session.capacity_override ?? group?.capacity ?? 0;

              return (
                <DataListRow
                  key={session.id}
                  title={`${formatDateTime(session.starts_at)} - ${group?.name ?? "Onbekende groep"}`}
                  meta={
                    <span>
                      {resource?.name ?? "geen resource"} · capaciteit {capacity}
                    </span>
                  }
                  aside={<StatusPill tone={session.status === "scheduled" ? "success" : session.status === "draft" ? "warning" : "neutral"}>{session.status}</StatusPill>}
                />
              );
            })}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function Feedback({ saved, error }: { saved: boolean; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
  }

  if (error === "time") {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">De eindtijd moet na de starttijd liggen.</p>;
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
