import Link from "next/link";
import { Download, FileText, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { formatDocumentDate, formatDocumentSize, getInstructorDocuments } from "@/lib/domain/documents";

export const dynamic = "force-dynamic";

export default async function InstructorDocumentsPage() {
  const documents = await getInstructorDocuments();

  return (
    <div className="space-y-6">
      <PageHeader kicker="Instructor" title="Documenten" subtitle="Teamdocumenten, protocollen en handleidingen voor de zwemzaal." />

      <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{documents.length} document(en)</p>
              <p className="text-sm text-muted-foreground">Interne instructeursdocumenten blijven gescheiden van ouderdocumenten.</p>
            </div>
          </div>
          <StatusPill tone="warning">
            <Lock className="h-3.5 w-3.5" />
            team zichtbaar
          </StatusPill>
        </div>
      </section>

      {documents.length === 0 ? (
        <EmptyState>Er zijn nog geen instructeursdocumenten beschikbaar.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {documents.map((document) => (
            <article className="rounded-xl border border-border bg-card p-5 shadow-soft" key={document.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h2 className="font-bold text-foreground">{document.title}</h2>
                  </div>
                  {document.description ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{document.description}</p> : null}
                </div>
                <StatusPill tone={document.visibility === "internal" ? "warning" : "success"}>{document.visibility === "internal" ? "intern" : "portal"}</StatusPill>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {document.file_name ?? "Geen bestand"} - {formatDocumentSize(document.size_bytes)} - {formatDocumentDate(document.created_at)}
              </p>
              {document.file_path ? (
                <Link className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/api/files/tenant-document/${document.id}`}>
                  <Download className="h-4 w-4" />
                  Downloaden
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}
