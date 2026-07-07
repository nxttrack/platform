import { AdminSection, DataList, DataListRow, EmptyState, Field, SelectField, SubmitButton } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createResourceAction } from "@/lib/domain/actions";
import { getTenantCoreData, type ResourceRow } from "@/lib/domain/core";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const resourceKindLabels: Record<string, string> = {
  location: "Locatie",
  pool: "Bad",
  lane: "Baan",
  room: "Ruimte",
  other: "Overig"
};

export const dynamic = "force-dynamic";

export default async function AdminResourcesPage({ searchParams }: PageProps) {
  const data = await getTenantCoreData();
  const params = (await searchParams) ?? {};
  const saved = getParam(params, "saved") === "1";
  const error = getParam(params, "error");
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));

  return (
    <div className="space-y-6">
      <PageHeader kicker="Core domeinmodel" title="Resources" subtitle="Beheer locaties, baden, banen en capaciteit als operationele planningbasis." />
      <Feedback saved={saved} error={error} />

      <AdminSection title="Resource aanmaken" description="Gebruik parent resource om bijvoorbeeld een baan onder een bad of locatie te hangen.">
        <form action={createResourceAction} className="grid gap-4 md:grid-cols-3">
          <SelectField label="Type" name="kind" required>
            <option value="location">Locatie</option>
            <option value="pool">Bad</option>
            <option value="lane">Baan</option>
            <option value="room">Ruimte</option>
            <option value="other">Overig</option>
          </SelectField>
          <Field label="Naam" name="name" required placeholder="Hoofdbad" />
          <Field label="Code" name="code" placeholder="bad-1" />
          <SelectField label="Onderdeel van" name="parentResourceId">
            <option value="">Geen parent</option>
            {data.resources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
              </option>
            ))}
          </SelectField>
          <Field label="Capaciteit" name="capacity" type="number" placeholder="8" />
          <Field label="Volgorde" name="sortOrder" type="number" defaultValue={0} />
          <div className="md:col-span-3">
            <SubmitButton>Resource opslaan</SubmitButton>
          </div>
        </form>
      </AdminSection>

      <AdminSection title="Resource overzicht">
        {data.resources.length === 0 ? (
          <EmptyState>Nog geen resources.</EmptyState>
        ) : (
          <DataList>
            {data.resources.map((resource) => (
              <DataListRow
                key={resource.id}
                title={resource.name}
                meta={<ResourceMeta resource={resource} parent={resource.parent_resource_id ? resourceById.get(resource.parent_resource_id) : null} />}
                aside={<StatusPill tone={resource.status === "active" ? "success" : "neutral"}>{resourceKindLabels[resource.kind] ?? resource.kind}</StatusPill>}
              />
            ))}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
}

function ResourceMeta({ resource, parent }: { resource: ResourceRow; parent?: ResourceRow | null }) {
  return (
    <span>
      {resource.code ?? "zonder code"} · capaciteit {resource.capacity ?? "niet gezet"}
      {parent ? ` · onder ${parent.name}` : ""}
    </span>
  );
}

function Feedback({ saved, error }: { saved: boolean; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen.</p>;
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
