import { UploadCloud } from "lucide-react";
import { AdminSection, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { DocumentsTable } from "@/components/admin/resource-tables";
import { PageHeader } from "@/components/shell/ui";
import { DirtyForm } from "@/components/ui/dirty-form";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { createAdminDocumentAction } from "@/lib/domain/admin-operations-actions";
import { formatDateTime, getAdminOperationsData } from "@/lib/domain/admin-operations";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getAdminOperationsData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const query = getParam(params, "q");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Documenten" subtitle="Documentregister voor backoffice, instructeurs en ouderportaal." />
      <RouteFeedback success={saved ? `Documentactie opgeslagen: ${saved}.` : null} error={error ? `Documentactie is niet gelukt: ${error}.` : null} />

      <div className="grid gap-5 2xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.8fr)]">
        <AdminSection title="Document uploaden" description="Bestanden worden opgeslagen in een private Supabase Storage bucket en alleen via rolchecks gedownload.">
          <DirtyForm action={createAdminDocumentAction} className="grid gap-4" encType="multipart/form-data">
            <Field label="Titel" name="title" required placeholder="Lesvoorwaarden seizoen 2026" />
            <TextAreaField label="Omschrijving" name="description" />
            <div className="grid gap-3 sm:grid-cols-4">
              <SelectField label="Doelgroep" name="audience">
                <option value="tenant_staff">Team</option>
                <option value="instructors">Instructeurs</option>
                <option value="parents">Ouders</option>
                <option value="all_tenant">Iedereen</option>
              </SelectField>
              <SelectField label="Zichtbaarheid" name="visibility">
                <option value="internal">Intern</option>
                <option value="portal">Portaal</option>
              </SelectField>
              <SelectField label="Status" name="status">
                <option value="active">Actief</option>
                <option value="archived">Archief</option>
              </SelectField>
              <SelectField label="Dataclassificatie" name="contentClassification">
                <option value="personal">Persoonsgegevens</option>
                <option value="sensitive">Gevoelig</option>
                <option value="restricted">Strikt beperkt</option>
                <option value="operational">Operationeel</option>
              </SelectField>
            </div>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Bestand</span>
              <input accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground" name="file" type="file" />
              <span className="block text-xs font-normal text-muted-foreground">PDF, PNG, JPG, DOCX of XLSX. Publicatie volgt alleen na een schone malwarecontrole.</span>
            </label>
            <SubmitButton>
              <span className="inline-flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                Document opslaan
              </span>
            </SubmitButton>
          </DirtyForm>
        </AdminSection>

        <AdminSection title="Documentregister" description="Filter actieve en gearchiveerde documenten, pas kolommen aan en open details zonder de lijst te verlaten.">
          <DocumentsTable initialSearch={query} rows={data.documents.map((document) => ({
            audience: document.audience,
            classification: document.content_classification,
            createdAt: document.created_at,
            description: document.description ?? "",
            fileName: document.file_name ?? "Geen bestand",
            id: document.id,
            malwareStatus: document.malware_scan_status,
            sizeLabel: formatBytes(document.size_bytes),
            status: document.status,
            storageStatus: document.storage_status,
            title: document.title,
            visibility: document.visibility
          }))} />
        </AdminSection>
      </div>
    </div>
  );
}

function formatBytes(value: number | null) {
  if (!value) {
    return "geen grootte";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
