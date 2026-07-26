import Link from "next/link";
import { AdminSection, DataList, DataListRow, EmptyState } from "@/components/admin/domain-ui";
import { CapacityChart, StatusDonutChart } from "@/components/admin/operational-charts";
import { NextBestActionsWidget } from "@/components/admin/next-best-actions-widget";
import { PageHeader, StatusPill } from "@/components/shell/ui";
import { buildAdminChartData } from "@/lib/domain/admin-chart-data";
import { formatMoney, getAdminOperationsData, isTaskOverdue } from "@/lib/domain/admin-operations";
import { generateCrmFollowUpItems } from "@/lib/domain/crm-follow-up";
import { getTenantNextBestActions } from "@/lib/domain/next-best-actions";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const data = await getAdminOperationsData();
  const [nextBestActions, followUps] = await Promise.all([
    getTenantNextBestActions({
      tenantId: data.tenant.id,
      statuses: ["open"],
      limit: 6
    }),
    generateCrmFollowUpItems(data.tenant.id)
  ]);
  const activeGroups = data.groups.filter((group) => group.status === "active").length;
  const urgentTasks = data.tasks.filter((task) => task.priority === "urgent" && task.status !== "done" && task.status !== "cancelled");
  const recentEvents = [...data.tenantEvents, ...data.billingEvents.map((event) => ({ id: event.id, event_type: event.type, subject_type: "billing", subject_id: event.id, status: event.status, created_at: event.occurred_at }))].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8);
  const charts = buildAdminChartData(data);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Backoffice" title="Operations dashboard" subtitle={`Dagelijkse backoffice voor ${data.tenant.name}.`} />

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Actieve inschrijvingen" value={data.kpis.activeEnrollments.toString()} />
        <Metric label="Geplande lessen" value={data.kpis.scheduledSessions.toString()} />
        <Metric label="Nieuwe intake" tone={data.kpis.receivedIntake > 0 ? "warning" : "neutral"} value={data.kpis.receivedIntake.toString()} />
        <Metric label="Overdue" tone={data.kpis.overdueAmountCents > 0 ? "danger" : "success"} value={formatMoney(data.kpis.overdueAmountCents)} />
      </div>

      <NextBestActionsWidget actions={nextBestActions} />

      <AdminSection title="Opvolgen" description="Uitlegbare CRM-signalen. Concepten worden nooit automatisch verzonden.">
        {followUps.length === 0 ? (
          <EmptyState>Geen open opvolgsignalen voor live intakes.</EmptyState>
        ) : (
          <div className="space-y-3">
            <DataList>
              {followUps.slice(0, 4).map((item) => (
                <DataListRow
                  aside={<StatusPill tone={item.leadScoreBand === "high" ? "warning" : "info"}>{leadScoreLabel(item.leadScoreBand)}</StatusPill>}
                  key={item.id}
                  meta={`${item.reason} · ${item.suggested_action}`}
                  title={`${item.parentName} · ${item.participantName}`}
                />
              ))}
            </DataList>
            <Link className="inline-flex min-h-11 items-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-foreground hover:bg-muted" href="/admin/opvolging">
              Bekijk alle opvolging
            </Link>
          </div>
        )}
      </AdminSection>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft"><CapacityChart data={charts.capacity} /></section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-soft"><StatusDonutChart data={charts.intake} title="Intakestatus" description="Actuele verdeling van alle intake-aanvragen." /></section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Backoffice pulse" description="Kernsignalen uit intake, wachtlijst, taken, documenten en berichten.">
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Actieve groepen" value={activeGroups.toString()} />
            <MiniMetric label="Vrije capaciteit" value={data.kpis.openCapacity.toString()} />
            <MiniMetric label="Open wachtlijst" value={data.kpis.openWaitlist.toString()} />
            <MiniMetric label="Pending slot offers" value={data.kpis.pendingSlotOffers.toString()} />
            <MiniMetric label="Open taken" value={data.kpis.openTasks.toString()} tone={data.kpis.openTasks > 0 ? "warning" : "neutral"} />
            <MiniMetric label="Ongelezen notificaties" value={data.kpis.unreadNotifications.toString()} />
            <MiniMetric label="Gepubliceerde berichten" value={data.kpis.publishedMessages.toString()} />
            <MiniMetric label="Actieve documenten" value={data.kpis.activeDocuments.toString()} />
          </div>
        </AdminSection>

        <AdminSection title="Urgente taken">
          {urgentTasks.length === 0 ? (
            <EmptyState>Geen urgente open taken.</EmptyState>
          ) : (
            <DataList>
              {urgentTasks.slice(0, 6).map((task) => (
                <DataListRow
                  aside={<StatusPill tone={isTaskOverdue(task) ? "danger" : "warning"}>{task.due_on ? `voor ${formatDate(task.due_on)}` : "urgent"}</StatusPill>}
                  key={task.id}
                  meta={task.description ?? "Geen toelichting"}
                  title={task.title}
                />
              ))}
            </DataList>
          )}
        </AdminSection>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <AdminSection title="Capaciteit per lesgroep">
          {data.groupCapacity.length === 0 ? (
            <EmptyState>Nog geen lesgroepen om capaciteit te tonen.</EmptyState>
          ) : (
            <DataList>
              {data.groupCapacity.map((capacity) => {
                const group = data.groups.find((item) => item.id === capacity.groupId);

                return (
                  <DataListRow
                    aside={<StatusPill tone={capacity.status === "available" ? "success" : capacity.status === "full" ? "warning" : "danger"}>{`${capacity.used}/${capacity.capacity}`}</StatusPill>}
                    key={capacity.groupId}
                    meta={`${capacity.available} vrije plek(ken)`}
                    title={group?.name ?? "Onbekende groep"}
                  />
                );
              })}
            </DataList>
          )}
        </AdminSection>

        <AdminSection title="Recente events">
          {recentEvents.length === 0 ? (
            <EmptyState>Nog geen events geregistreerd.</EmptyState>
          ) : (
            <DataList>
              {recentEvents.map((event) => (
                <DataListRow key={`${event.subject_type}-${event.id}`} meta={formatDateTime(event.created_at)} title={`${event.event_type} - ${event.status}`} />
              ))}
            </DataList>
          )}
        </AdminSection>
      </div>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }) {
  const toneClass = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning-foreground" : tone === "success" ? "text-success" : "text-foreground";

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${toneClass}`}>{value}</p>
    </section>
  );
}

function MiniMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "warning" | "neutral" }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "warning" ? "text-warning-foreground" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function leadScoreLabel(value: string) {
  return value === "high" ? "Hoge leadscore" : value === "average" ? "Gemiddeld" : value === "low" ? "Laag" : "Informatie nodig";
}
