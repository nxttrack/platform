import { FileText, UploadCloud } from "lucide-react";
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
        <AdminSection title="Document registreren" description="MVP registreert metadata en pad; opslagbucket en virus-scan horen bij hardening/productie.">
          <form action={createAdminDocumentAction} className="grid gap-4">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Bestandsnaam" name="fileName" placeholder="voorwaarden.pdf" />
              <Field label="Bestandspad" name="filePath" placeholder="organisaties/aquaswim/docs/voorwaarden.pdf" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="MIME type" name="mimeType" placeholder="application/pdf" />
              <Field label="Grootte bytes" name="sizeBytes" type="number" />
            </div>
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
                        {document.audience} - {document.visibility} - {document.file_name ?? "geen bestand"} - {formatDateTime(document.created_at)}
                      </p>
                    </div>
                    <StatusPill tone={document.visibility === "portal" ? "success" : "neutral"}>{document.visibility}</StatusPill>
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
                  <p className="mt-1 text-xs text-muted-foreground">{document.file_path ?? "geen bestandspad"}</p>
                </div>
                <StatusPill tone="neutral">{document.status}</StatusPill>
              </div>
            ))}
          </DataList>
        )}
      </AdminSection>
    </div>
  );
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
