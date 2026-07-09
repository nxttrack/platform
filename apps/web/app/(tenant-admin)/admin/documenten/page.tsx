import Link from "next/link";
import { Download, FileText, UploadCloud } from "lucide-react";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
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
  const activeDocuments = data.documents.filter((document) => document.status === "active");
  const archivedDocuments = data.documents.filter((document) => document.status === "archived");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Documenten" subtitle="Documentregister voor backoffice, instructeurs en ouderportaal." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <AdminSection title="Document uploaden" description="Bestanden worden opgeslagen in een private Supabase Storage bucket en alleen via rolchecks gedownload.">
          <form action={createAdminDocumentAction} className="grid gap-4" encType="multipart/form-data">
            <Field label="Titel" name="title" required placeholder="Lesvoorwaarden seizoen 2026" />
            <TextAreaField label="Omschrijving" name="description" />
            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>
            <label className="space-y-2 text-sm font-semibold text-foreground">
              <span>Bestand</span>
              <input className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-normal file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-primary-foreground" name="file" type="file" />
            </label>
            <SubmitButton>
              <span className="inline-flex items-center gap-2">
                <UploadCloud className="h-4 w-4" />
                Document opslaan
              </span>
            </SubmitButton>
          </form>
        </AdminSection>

        <AdminSection title="Actieve documenten">
          {activeDocuments.length === 0 ? (
            <EmptyState>Nog geen actieve documenten.</EmptyState>
          ) : (
            <DataList>
              {activeDocuments.map((document) => (
                <div className="px-3 py-3" key={document.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <p className="font-semibold text-foreground">{document.title}</p>
                      </div>
                      {document.description ? <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{document.description}</p> : null}
                      <p className="mt-2 text-xs text-muted-foreground">
                        {document.audience} - {document.visibility} - {document.file_name ?? "geen bestand"} - {formatBytes(document.size_bytes)} - {formatDateTime(document.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {document.file_path ? (
                        <Link className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted" href={`/api/files/tenant-document/${document.id}`}>
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Link>
                      ) : null}
                      <StatusPill tone={document.storage_status === "stored" ? "success" : document.storage_status === "missing" ? "danger" : "neutral"}>{document.storage_status}</StatusPill>
                      <StatusPill tone={document.visibility === "portal" ? "success" : "neutral"}>{document.visibility}</StatusPill>
                    </div>
                  </div>
                </div>
              ))}
            </DataList>
          )}
        </AdminSection>
      </div>

      <AdminSection title="Archief">
        {archivedDocuments.length === 0 ? (
          <EmptyState>Nog geen gearchiveerde documenten.</EmptyState>
        ) : (
          <DataList>
            {archivedDocuments.map((document) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={document.id}>
                <div>
                  <p className="text-sm font-semibold text-foreground">{document.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{document.file_name ?? document.file_path ?? "geen bestand"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {document.file_path ? (
                    <Link className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted" href={`/api/files/tenant-document/${document.id}`}>
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Link>
                  ) : null}
                  <StatusPill tone="neutral">{document.status}</StatusPill>
                </div>
              </div>
            ))}
          </DataList>
        )}
      </AdminSection>
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

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved) {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-medium text-success">Opgeslagen: {saved}.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
