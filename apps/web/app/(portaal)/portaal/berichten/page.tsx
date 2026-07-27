import { Bell, Check, MailOpen, MessageSquare } from "lucide-react";
import type { ReactNode } from "react";
import { AdminActionDrawer } from "@/components/admin/action-drawer";
import { NewThreadForm } from "@/components/communication/communication-forms";
import { ThreadWorkspace } from "@/components/communication/thread-workspace";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { RouteFeedback } from "@/components/ui/route-feedback";
import { markNotificationReadAction } from "@/lib/domain/communication-actions";
import { getParentCommunicationHub } from "@/lib/domain/communication-hub";
import { formatCommunicationDate, getParentMessages, messageAudienceLabel } from "@/lib/domain/communications";
import { getParentPortalData } from "@/lib/domain/parent-portal";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ParentMessagesPage({ searchParams }: PageProps) {
  const [data, messages, hub, params] = await Promise.all([getParentPortalData(), getParentMessages(), getParentCommunicationHub(), searchParams ?? Promise.resolve({})]);
  const saved = getParam(params, "saved");
  const error = getParam(params, "error");
  const success = getParam(params, "success");
  const selectedThreadId = getParam(params, "thread");
  const unreadNotifications = data.notifications.filter((notification) => notification.status === "unread");

  return (
    <div className="space-y-6">
      <PageHeader
        action={
          <AdminActionDrawer description="Kies een kind en schrijf je vraag. De zwemschool ziet alleen de context die bij dit gesprek hoort." title="Nieuw bericht" triggerLabel="Bericht sturen" width="wide">
            <NewThreadForm next="/portaal/berichten" parentMode participants={hub.participants} />
          </AdminActionDrawer>
        }
        kicker="Communicatie"
        title="Berichten en updates"
        subtitle="Persoonlijke gesprekken, meldingen en belangrijke updates van de zwemschool."
      />
      <Feedback saved={saved} error={error} />
      <RouteFeedback error={error} success={success} />

      <div className="grid gap-4 md:grid-cols-3">
        <Metric icon={<MessageSquare className="h-5 w-5" />} label="Berichten" value={messages.length} />
        <Metric icon={<Bell className="h-5 w-5" />} label="Updates" value={data.notifications.length} />
        <Metric icon={<MailOpen className="h-5 w-5" />} label="Ongelezen" value={unreadNotifications.length} />
      </div>

      <ThreadWorkspace baseHref="/portaal/berichten" messages={hub.messages} mode="parent" people={hub.people} selectedThreadId={selectedThreadId} threads={hub.threads} unreadThreadIds={hub.unreadThreadIds} />

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Ouderberichten</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gepubliceerde portalberichten voor ouders.</p>
          </div>
          <StatusPill tone={messages.length > 0 ? "info" : "neutral"}>{messages.length} zichtbaar</StatusPill>
        </div>
        {messages.length === 0 ? (
          <EmptyState>Er zijn nog geen ouderberichten gepubliceerd.</EmptyState>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <article className="rounded-lg border border-border bg-white p-4" key={message.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{messageAudienceLabel(message.audience)}</p>
                    <h3 className="mt-1 text-lg font-bold text-foreground">{message.title}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatCommunicationDate(message.published_at ?? message.created_at)}</span>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">{message.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Meldingen</h2>
            <p className="mt-1 text-sm text-muted-foreground">Voortgang, badges, documenten, betalingen en afzwemupdates.</p>
          </div>
          <StatusPill tone={unreadNotifications.length > 0 ? "warning" : "success"}>{unreadNotifications.length} ongelezen</StatusPill>
        </div>
        {data.notifications.length === 0 ? (
          <EmptyState>Je hebt nog geen meldingen.</EmptyState>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.notifications.map((notification) => (
              <article className="rounded-lg border border-border bg-white p-4" key={notification.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <StatusPill tone={notification.status === "unread" ? "info" : "neutral"}>{notificationLabel(notification.type)}</StatusPill>
                    <h3 className="mt-2 font-bold text-foreground">{notification.title}</h3>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatCommunicationDate(notification.created_at)}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{notification.message}</p>
                {notification.status === "unread" ? (
                  <form action={markNotificationReadAction} className="mt-3">
                    <input name="notificationId" type="hidden" value={notification.id} />
                    <input name="next" type="hidden" value="/portaal/berichten" />
                    <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-semibold hover:bg-muted" type="submit">
                      <Check className="h-4 w-4" />
                      Gelezen
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="text-primary">{icon}</span>
      </div>
      <p className="mt-2 text-3xl font-bold text-foreground">{value}</p>
    </section>
  );
}

function Feedback({ saved, error }: { saved?: string; error?: string }) {
  if (saved === "read") {
    return <p className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-sm font-semibold text-success">Melding gemarkeerd als gelezen.</p>;
  }

  if (error) {
    return <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm font-semibold text-danger">Actie is niet gelukt: {error}.</p>;
  }

  return null;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-4 text-sm text-muted-foreground">{children}</p>;
}

function notificationLabel(type: string) {
  if (type === "admin_message") {
    return "bericht";
  }

  if (type === "document_published") {
    return "document";
  }

  if (type === "payment_due" || type === "payment_overdue" || type === "payment_received") {
    return "betaling";
  }

  if (type === "graduation_invite" || type === "certificate_issued") {
    return "afzwemmen";
  }

  if (type === "badge_award") {
    return "badge";
  }

  if (type === "progress_score") {
    return "voortgang";
  }

  return "update";
}

function getParam(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];

  return Array.isArray(value) ? value[0] : value;
}
