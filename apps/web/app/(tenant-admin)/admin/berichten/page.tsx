import { MessageSquare, Send } from "lucide-react";
import { AdminSection, DataList, EmptyState, Field, SelectField, SubmitButton, TextAreaField } from "@/components/admin/domain-ui";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { createAdminMessageAction } from "@/lib/domain/admin-operations-actions";
import { formatDateTime, getAdminOperationsData } from "@/lib/domain/admin-operations";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const [data, params] = await Promise.all([getAdminOperationsData(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");

  return (
    <div className="space-y-6">
      <PageHeader kicker="Operations" title="Berichten" subtitle="Publiceer interne en portal-zichtbare berichten met tenant-scoped notificaties." />
      <Feedback saved={saved} error={error} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <AdminSection title="Bericht opstellen" description="Kies doelgroep en zichtbaarheid. Alleen gepubliceerde portal-berichten worden naar ouders gestuurd.">
          <form action={createAdminMessageAction} className="grid gap-4">
            <Field label="Titel" name="title" required placeholder="Nieuwe lesserie start maandag" />
            <TextAreaField label="Bericht" name="body" placeholder="Schrijf een kort en duidelijk bericht voor de gekozen doelgroep." />
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
                <option value="draft">Concept</option>
                <option value="published">Publiceren</option>
                <option value="archived">Archief</option>
              </SelectField>
            </div>
            <SubmitButton>
              <span className="inline-flex items-center gap-2">
                <Send className="h-4 w-4" />
                Bericht opslaan
              </span>
            </SubmitButton>
          </form>
        </AdminSection>

        <AdminSection title="Berichtenoverzicht">
          {data.messages.length === 0 ? (
            <EmptyState>Nog geen berichten.</EmptyState>
          ) : (
            <DataList>
              {data.messages.map((message) => (
                <div className="px-3 py-3" key={message.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <p className="font-semibold text-foreground">{message.title}</p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm leading-6 text-muted-foreground">{message.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {message.audience} - {message.visibility} - {message.published_at ? formatDateTime(message.published_at) : formatDateTime(message.created_at)}
                      </p>
                    </div>
                    <StatusPill tone={message.status === "published" ? "success" : message.status === "draft" ? "warning" : "neutral"}>{message.status}</StatusPill>
                  </div>
                </div>
              ))}
            </DataList>
          )}
        </AdminSection>
      </div>
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
