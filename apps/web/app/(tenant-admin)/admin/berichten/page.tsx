import { MailWarning, Megaphone, MessageSquare, RotateCcw } from "lucide-react";
import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { AdminListSurface } from "@/components/admin/admin-patterns";
import { AdminSection, DataList, EmptyState } from "@/components/admin/domain-ui";
import { MessageComposer } from "@/components/admin/message-composer";
import { NewThreadForm } from "@/components/communication/communication-forms";
import { ThreadWorkspace } from "@/components/communication/thread-workspace";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { retryEmailDeliveryAttemptAction } from "@/lib/domain/admin-operations-actions";
import { formatDateTime, getAdminOperationsData } from "@/lib/domain/admin-operations";
import { getAdminCommunicationHub } from "@/lib/domain/communication-hub";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage({ searchParams }: PageProps) {
  const [data, hub, params] = await Promise.all([getAdminOperationsData(), getAdminCommunicationHub(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const success = getParam(params, "success");
  const selectedThreadId = getParam(params, "thread");
  const filters = {
    assigned: getParam(params, "assigned") ?? "",
    query: getParam(params, "q") ?? "",
    status: getParam(params, "threadStatus") ?? "",
    type: getParam(params, "threadType") ?? ""
  };
  const filteredThreads = hub.threads.filter((thread) => {
    const assignedIds = [thread.assigned_staff_user_id, thread.assigned_instructor_user_id].filter(Boolean);
    const matchesAssigned =
      !filters.assigned ||
      (filters.assigned === "unassigned" ? assignedIds.length === 0 : assignedIds.includes(filters.assigned));
    const searchable = [
      thread.subject,
      thread.thread_type,
      thread.status,
      thread.guardian_user_id ? hub.people.get(thread.guardian_user_id)?.name : ""
    ].join(" ").toLowerCase();
    return (
      matchesAssigned &&
      (!filters.status || thread.status === filters.status) &&
      (!filters.type || thread.thread_type === filters.type) &&
      (!filters.query || searchable.includes(filters.query.toLowerCase()))
    );
  });

  return (
    <div className="space-y-5">
      <PageHeader
        action={
          <div className="flex flex-wrap gap-2">
            <AdminActionDrawer description="Start een veilig gesprek en koppel direct de juiste ouder, leerling, groep of instructeur." title="Nieuw gesprek" triggerLabel="Gesprek starten" width="wide">
              <NewThreadForm
                graduationEvents={hub.graduationEvents}
                guardians={hub.guardians}
                groups={hub.groups}
                instructors={hub.instructors}
                intakes={hub.intakes}
                next="/admin/berichten"
                participants={hub.participants}
                payments={hub.payments}
                staff={hub.staff}
                waitlistEntries={hub.waitlistEntries}
              />
            </AdminActionDrawer>
            <AdminActionDrawer description="Kies doelgroep, zichtbaarheid en publicatiestatus voordat je het bericht opslaat." icon={<Megaphone className="size-4" />} title="Nieuwe mededeling" triggerLabel="Bericht opstellen" triggerVariant="outline" width="wide">
              <MessageComposer />
            </AdminActionDrawer>
          </div>
        }
        kicker="Communicatiehub"
        title="Berichten"
        subtitle="Beheer oudergesprekken, interne context en tenantbrede mededelingen vanuit één werkplek."
      />
      <Feedback saved={saved} error={error} />
      <RouteFeedback error={error && !["confirmation", "visibility"].includes(error) ? error : null} success={success} />

      <ThreadWorkspace
        baseHref="/admin/berichten"
        instructors={hub.instructors}
        filters={filters}
        filterAssignees={[...hub.staff, ...hub.instructors]}
        messages={hub.messages}
        mode="admin"
        people={hub.people}
        selectedThreadId={selectedThreadId}
        staff={hub.staff}
        threads={filteredThreads}
        unreadThreadIds={hub.unreadThreadIds}
      />

      <AdminListSurface>
        <div className="mb-3"><h2 className="text-base font-bold">Mededelingen</h2><p className="text-[13px] text-muted-foreground">Tenantbrede concepten, publicaties en archief. Deze feed blijft los van privégesprekken.</p></div>
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
      </AdminListSurface>

      <AdminSection title="Maildelivery diagnostics" description="Laatste mailpogingen via SendGrid API of SMTP. Notificatiemails kunnen opnieuw worden geprobeerd.">
        {data.emailDeliveryAttempts.length === 0 ? (
          <EmptyState>Nog geen mailpogingen geregistreerd.</EmptyState>
        ) : (
          <DataList>
            {data.emailDeliveryAttempts.map((attempt) => (
              <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3" key={attempt.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <MailWarning className="h-4 w-4 text-primary" />
                    <p className="font-semibold text-foreground">{attempt.subject}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {attempt.recipient_email} - {attempt.template_key} - {attempt.provider}
                    {attempt.provider_source ? ` (${attempt.provider_source})` : ""} - {formatDateTime(attempt.attempted_at)}
                  </p>
                  {attempt.error_message ? <p className="mt-1 text-xs text-danger">{attempt.error_message}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(attempt.status === "failed" || attempt.status === "skipped") && attempt.related_type === "tenant_notification" ? (
                    <form action={retryEmailDeliveryAttemptAction}>
                      <input name="attemptId" type="hidden" value={attempt.id} />
                      <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground hover:bg-muted" type="submit">
                        <RotateCcw className="h-3.5 w-3.5" />
                        Retry
                      </button>
                    </form>
                  ) : null}
                  <StatusPill tone={attempt.status === "sent" ? "success" : attempt.status === "failed" ? "danger" : "warning"}>{attempt.status}</StatusPill>
                </div>
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
    const message = error === "confirmation"
      ? "Publiceren is gestopt omdat de menselijke bevestiging ontbrak."
      : error === "visibility"
        ? "Een bericht voor ouders moet zichtbaar zijn in het portaal."
      : `Actie is niet gelukt: ${error}.`;
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{message}</p>;
  }

  return null;
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
