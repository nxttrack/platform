import type { ReactNode } from "react";
import { BarChart3, CalendarDays, ClipboardList, Download, FileText, Filter, Inbox, Mail, Megaphone, Newspaper, Send, Settings, ShieldCheck, Users } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  cancelMessageAction,
  createMessageTemplateAction,
  createOperationalTaskAction,
  createReportExportRequestAction,
  createTenantDocumentRecordAction,
  generateReportExportAction,
  previewMessageTemplateAction,
  queueMessageAction,
  retryMessageAction,
  runMessageDispatchWorkerAction,
  updateCommunicationProviderConfigAction,
  updateMessageTemplateAction,
  updateOperationalTaskAction,
  updateReportExportRequestAction,
  upsertReportPermissionGrantAction,
  updateTenantDocumentRecordAction,
  uploadTenantDocumentAction
} from "@/lib/operations/admin-phase12-actions";
import type {
  AdminPhase12Data,
  AdminPhase12Snapshot,
  CommunicationProviderConfigRow,
  MessageOutboxRow,
  MessageTemplateRow,
  OperationalTaskRow,
  OperationsEnrollmentRow,
  OperationsGroupRow,
  OperationsInstructorRow,
  OperationsParticipantRow,
  OperationsProfileRow,
  ReportExportRequestRow,
  TenantDocumentRecordRow
} from "@/lib/operations/admin-phase12-read-model";
import type { ReportPermissionGrantRow, ReportingDashboardData, ReportSection } from "@/lib/operations/reporting";
import type { AdminDomainData, AdminDomainSnapshot, GroupRow } from "@/lib/domain/admin-domain-read-model";
import type { AdminPaymentsSnapshot } from "@/lib/payments/admin-payments-read-model";
import type { PlacementWorkflowSnapshot } from "@/lib/placement/admin-placement-read-model";

type Phase12PageProps = {
  snapshot: AdminPhase12Snapshot;
};

type Phase12ReportsPageProps = {
  phase12: AdminPhase12Snapshot;
  domain: AdminDomainSnapshot;
  placement: PlacementWorkflowSnapshot;
  payments: AdminPaymentsSnapshot;
};

type Phase12Lookups = {
  participants: Map<string, OperationsParticipantRow>;
  enrollments: Map<string, OperationsEnrollmentRow>;
  profiles: Map<string, OperationsProfileRow>;
  templates: Map<string, MessageTemplateRow>;
};

export function AdminMessagesPage({ snapshot }: Phase12PageProps) {
  if (snapshot.status !== "ready") {
    return <Phase12StatusPanel snapshot={snapshot} title="Berichten niet beschikbaar" />;
  }

  const data = snapshot.data;
  const lookups = buildLookups(data);
  const queuedMessages = data.messageOutbox.filter((message) => message.status === "queued").length;
  const failedMessages = data.messageOutbox.filter((message) => ["failed", "retrying"].includes(message.status));
  const sentMessages = data.messageOutbox.filter((message) => message.status === "sent" || message.delivery_status === "sent").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Communicatie</StatusPill>}
        kicker="Backoffice - berichten"
        subtitle="Stuur interne berichten en/of mail naar ouders, groepen, instructeurs of losse ontvangers. Templates, instellingen en nieuwsbrieven staan op eigen beheerpagina's."
        title="Berichten versturen"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Users className="h-5 w-5" />} label="Ouders" value={data.guardians.length.toString()} detail="bereikbaar vanuit profielen" />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Instructeurs" value={data.instructors.length.toString()} detail="actief en gepland" />
        <MetricCard icon={<Send className="h-5 w-5" />} label="In wachtrij" value={queuedMessages.toString()} detail="klaar voor verzending" />
        <MetricCard icon={<Inbox className="h-5 w-5" />} label="Fouten" value={failedMessages.length.toString()} detail={`${sentMessages} verzonden`} />
      </div>

      <Card>
        <SectionHeader title="Nieuw bericht" count={data.participants.length + data.instructors.length} />
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <QueueMessageForm data={data} />
          <div className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Kanaalkeuze</p>
            <p>Kies e-mail voor externe verzending via SMTP of SendGrid. Kies intern bericht voor een portaalnotificatie zonder externe mailprovider.</p>
            <p>Voor groepen worden actieve groepsplaatsingen uitgeklapt naar gekoppelde ouders/verzorgers. Stage of abonnement wordt hierbij niet aangepast.</p>
            <div className="grid gap-2">
              <a className={secondaryButtonClassName} href="/admin/mailtemplates">
                Mailtemplates beheren
              </a>
              <a className={secondaryButtonClassName} href="/admin/mail-instellingen">
                Mailinstellingen
              </a>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Dispatch worker</h2>
            <p className="text-sm text-muted-foreground">Verzend maximaal 10 geplande of opnieuw te proberen berichten via SMTP/SendGrid-ready mailconfiguratie.</p>
          </div>
          <form action={runMessageDispatchWorkerAction} className="flex items-center gap-2">
            <input name="limit" type="hidden" value="10" />
            <button className={primaryButtonClassName} type="submit">
              Worker starten
            </button>
          </form>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Retry dashboard" count={failedMessages.length} />
        <div className="grid gap-3">
          {failedMessages.length === 0 ? <EmptyState>Geen gefaalde berichten. De outbox is schoon.</EmptyState> : null}
          {failedMessages.map((message) => (
            <MessageOutboxCard key={message.id} lookups={lookups} message={message} showResetRetry />
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Outbox" count={data.messageOutbox.length} />
        <div className="grid gap-3">
          {data.messageOutbox.length === 0 ? <EmptyState>Nog geen berichten in de outbox.</EmptyState> : null}
          {data.messageOutbox.map((message) => (
            <MessageOutboxCard key={message.id} lookups={lookups} message={message} />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function AdminMailSettingsPage({ snapshot }: Phase12PageProps) {
  if (snapshot.status !== "ready") {
    return <Phase12StatusPanel snapshot={snapshot} title="Mailinstellingen niet beschikbaar" />;
  }

  const smtpProvider = snapshot.data.providerConfigs.find((provider) => provider.provider === "smtp");
  const sendgridProvider = snapshot.data.providerConfigs.find((provider) => provider.provider === "sendgrid");

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">SMTP first</StatusPill>}
        kicker="Backoffice - mailinstellingen"
        subtitle="Beheer SMTP als primaire route en houd SendGrid API live-ready naast dezelfde outbox."
        title="Mailinstellingen"
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionHeader title="SMTP" count={smtpProvider ? 1 : 0} />
          <div className="mt-4">
            <ProviderConfigCard provider={smtpProvider} title="SMTP provider" />
          </div>
        </Card>
        <Card>
          <SectionHeader title="SendGrid" count={sendgridProvider ? 1 : 0} />
          <div className="mt-4">
            <ProviderConfigCard provider={sendgridProvider} title="SendGrid API provider" />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminMailTemplatesPage({ snapshot }: Phase12PageProps) {
  return <TemplateManagementPage audience="mail" snapshot={snapshot} subtitle="Bouw e-mailtemplates met shortcodechips, previewvalidatie en een TipTap-ready block builder." title="Mailtemplates" />;
}

export function AdminNotificationTemplatesPage({ snapshot }: Phase12PageProps) {
  return <TemplateManagementPage audience="notification" snapshot={snapshot} subtitle="Beheer in-app notificatietemplates voor portaalmeldingen en automatische events." title="Notificatietemplates" />;
}

export function AdminNewsletterPage({ snapshot }: Phase12PageProps) {
  if (snapshot.status !== "ready") {
    return <Phase12StatusPanel snapshot={snapshot} title="Nieuwsbrief niet beschikbaar" />;
  }

  const newsletterTemplates = snapshot.data.messageTemplates.filter((template) => template.tags.includes("newsletter") || template.code.includes("newsletter"));
  const scheduledNewsletters = snapshot.data.messageOutbox.filter((message) => message.event_key === "newsletter" || message.source_table === "newsletter").length;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="warning">Concept en planning</StatusPill>}
        kicker="Backoffice - nieuwsbrief"
        subtitle="Maak nieuwsbriefconcepten, plan verzending en stuur naar alle ouders via dezelfde outbox en mailproviders."
        title="Nieuwsbrief"
      />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<Megaphone className="h-5 w-5" />} label="Templates" value={newsletterTemplates.length.toString()} detail="tag newsletter" />
        <MetricCard icon={<Users className="h-5 w-5" />} label="Ontvangers" value={snapshot.data.guardians.length.toString()} detail="actieve ouders/verzorgers" />
        <MetricCard icon={<CalendarDays className="h-5 w-5" />} label="Gepland" value={scheduledNewsletters.toString()} detail="outbox basis" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <SectionHeader title="Nieuwsbrief opstellen" count={snapshot.data.guardians.length} />
          <div className="mt-4">
            <QueueMessageForm data={snapshot.data} newsletter />
          </div>
        </Card>
        <Card>
          <SectionHeader title="Block builder" count={newsletterTemplates.length} />
          <TipTapBlockBuilder defaultBody="Beste {{parent_name}},\n\nDit is de nieuwsbrief van {{tenant_name}}.\n\n{{cta_url}}" />
        </Card>
      </div>
      <Card>
        <SectionHeader title="Nieuwsbrief templates" count={newsletterTemplates.length} />
        <div className="grid gap-3">
          {newsletterTemplates.length === 0 ? <EmptyState>Nog geen nieuwsbrief template. Maak een mailtemplate met tag newsletter.</EmptyState> : null}
          {newsletterTemplates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </Card>
    </div>
  );
}

export function AdminTasksTodoPage({ snapshot }: Phase12PageProps) {
  if (snapshot.status !== "ready") {
    return <Phase12StatusPanel snapshot={snapshot} title="Taken niet beschikbaar" />;
  }

  const data = snapshot.data;
  const lookups = buildLookups(data);
  const openTasks = data.operationalTasks.filter((task) => ["open", "in_progress"].includes(task.status));
  const urgentTasks = openTasks.filter((task) => ["high", "urgent"].includes(task.priority));
  const doneTasks = data.operationalTasks.filter((task) => task.status === "done");

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Takenlijst</StatusPill>}
        kicker="Backoffice - taken"
        subtitle="Persistente todo's naast de operationele signalen uit dashboard en planning."
        title="Taken"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Open" value={openTasks.length.toString()} detail="todo's" />
        <MetricCard icon={<Inbox className="h-5 w-5" />} label="Urgent/hoog" value={urgentTasks.length.toString()} detail="prioriteit" />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Documenttaken" value={data.operationalTasks.filter((task) => task.task_type === "document").length.toString()} detail="documenten/opslag" />
        <MetricCard icon={<Send className="h-5 w-5" />} label="Afgerond" value={doneTasks.length.toString()} detail="operationeel" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <SectionHeader title="Nieuwe taak" count={data.profiles.length} />
          <OperationalTaskForm data={data} mode="create" />
        </Card>

        <Card>
          <SectionHeader title="Taaklijst" count={data.operationalTasks.length} />
          <div className="grid gap-3">
            {data.operationalTasks.length === 0 ? <EmptyState>Nog geen taken.</EmptyState> : null}
            {data.operationalTasks.map((task) => (
              <TaskCard key={task.id} data={data} lookups={lookups} task={task} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminDocumentsPage({ snapshot }: Phase12PageProps) {
  if (snapshot.status !== "ready") {
    return <Phase12StatusPanel snapshot={snapshot} title="Documenten niet beschikbaar" />;
  }

  const data = snapshot.data;
  const lookups = buildLookups(data);
  const availableDocuments = data.documentRecords.filter((document) => document.status === "available").length;
  const parentVisible = data.documentRecords.filter((document) => ["parent", "all"].includes(document.visibility)).length;
  const storage = data.documentStorage;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Documenten</StatusPill>}
        kicker="Backoffice - documenten"
        subtitle="Private documentopslag met versiebeheer, ouderzichtbaarheid, signed downloads en retentievoorbereiding."
        title="Documenten"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Documenten" value={data.documentRecords.length.toString()} detail="tenantdocumenten" />
        <MetricCard icon={<Download className="h-5 w-5" />} label="Beschikbaar" value={availableDocuments.toString()} detail="zichtbaar volgens rechten" />
        <MetricCard icon={<Inbox className="h-5 w-5" />} label="Ouderzichtbaar" value={parentVisible.toString()} detail="ouder/iedereen" />
        <MetricCard icon={<Settings className="h-5 w-5" />} label="Opslag" value={storage.status} detail={storage.bucket} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <SectionHeader title="Nieuw documentrecord" count={data.participants.length} />
          <DocumentRecordForm data={data} mode="create" />
        </Card>

        <Card>
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-muted/35 p-4">
            <div>
              <p className="font-semibold">Supabase Storage bucket</p>
              <p className="text-sm text-muted-foreground">
                {storage.bucket} - {storage.isPrivate ? "private" : "public"} - limiet {storage.fileSizeLimit ? formatBytes(storage.fileSizeLimit) : "onbekend"}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Toegestaan: {storage.allowedMimeTypes.length > 0 ? storage.allowedMimeTypes.join(", ") : "nog niet uit bucket gelezen"}
              </p>
              {storage.message ? <p className="mt-2 rounded-xl bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive">{storage.message}</p> : null}
            </div>
            <StatusPill tone={storage.status === "ready" ? "success" : storage.status === "missing" ? "warning" : "danger"}>{storage.status}</StatusPill>
          </div>
          <SectionHeader title="Documentenlijst" count={data.documentRecords.length} />
          <div className="grid gap-3">
            {data.documentRecords.length === 0 ? <EmptyState>Nog geen documenten.</EmptyState> : null}
            {data.documentRecords.map((document) => (
              <DocumentRecordCard key={document.id} data={data} document={document} lookups={lookups} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AdminReportsExportsPage({ phase12, domain, placement, payments }: Phase12ReportsPageProps) {
  if (phase12.status !== "ready") {
    return <Phase12StatusPanel snapshot={phase12} title="Rapportages niet beschikbaar" />;
  }

  const reporting = phase12.data.reporting;
  const occupancy = reporting.occupancy.summary;
  const waitlist = reporting.waitlist.summary;
  const attendance = reporting.attendance.summary;
  const revenue = reporting.revenue.summary;
  const dataState = [domain.status, placement.status, payments.status].filter((status) => status !== "ready");

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Rapportage</StatusPill>}
        kicker="Backoffice - rapportages"
        subtitle="Query-backed dashboards voor bezetting, wachtlijst, voortgang, aanwezigheid, betalingen en omzet met filters, exports, rechten en audit."
        title="Rapportages"
      />

      {dataState.length > 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">Enkele ondersteunende snapshots zijn beperkt beschikbaar: {dataState.join(", ")}. De rapportagequeries blijven leidend.</p>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<BarChart3 className="h-5 w-5" />} label="Bezetting" value={`${numberValue(occupancy.occupied)}/${numberValue(occupancy.capacity)}`} detail={`${numberValue(occupancy.occupancy_rate)}% bezet`} />
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Wachtlijst" value={numberValue(waitlist.total).toString()} detail={`${numberValue(waitlist.matched)} gematcht`} />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Aanwezigheid" value={`${numberValue(attendance.attendance_rate)}%`} detail={`${numberValue(attendance.records)} registraties`} />
        <MetricCard icon={<Download className="h-5 w-5" />} label="Omzet netto" value={formatMoney(numberValue(revenue.net_cents), "EUR")} detail="query-backed" />
      </div>

      <Card>
        <SectionHeader title="Filters" count={activeFilterCount(reporting.filters)} />
        <ReportFilterForm reporting={reporting} />
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer">
            <SectionHeader title="Export en rechten" count={phase12.data.reportExports.length + reporting.permissions.length} />
          </summary>
          <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <h3 className="font-bold">Export aanvragen</h3>
              <div className="mt-3">
                <ReportExportForm mode="create" reporting={reporting} />
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-muted/35 p-4">
              <h3 className="font-bold">Rapportrechten</h3>
              <div className="mt-3 grid gap-3">
                <ReportPermissionForm />
                {reporting.permissions.length === 0 ? <EmptyState>Nog geen expliciete rapportrechten. Tenant owners/admins houden standaard beheerrechten.</EmptyState> : null}
                {reporting.permissions.map((grant) => (
                  <ReportPermissionCard key={grant.id} grant={grant} />
                ))}
              </div>
            </div>
          </div>
        </details>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <ReportDashboardCard section={reporting.occupancy} title="Bezetting" value={`${numberValue(reporting.occupancy.summary.occupied)}/${numberValue(reporting.occupancy.summary.capacity)}`} />
        <ReportDashboardCard section={reporting.waitlist} title="Wachtlijst" value={numberValue(reporting.waitlist.summary.total).toString()} />
        <ReportDashboardCard section={reporting.progress} title="Voortgang" value={numberValue(reporting.progress.summary.updates).toString()} />
        <ReportDashboardCard section={reporting.attendance} title="Aanwezigheid" value={`${numberValue(reporting.attendance.summary.attendance_rate)}%`} />
        <ReportDashboardCard section={reporting.payments} title="Betalingen" value={formatMoney(numberValue(reporting.payments.summary.open_amount_cents), "EUR")} />
        <ReportDashboardCard section={reporting.revenue} title="Omzet" value={formatMoney(numberValue(reporting.revenue.summary.net_cents), "EUR")} />
      </div>

      <Card>
        <details>
          <summary className="cursor-pointer">
            <SectionHeader title="Exportaanvragen" count={phase12.data.reportExports.length} />
          </summary>
          <div className="mt-4 grid gap-3">
            {phase12.data.reportExports.length === 0 ? <EmptyState>Nog geen export requests.</EmptyState> : null}
            {phase12.data.reportExports.map((request) => (
              <ReportExportCard key={request.id} reporting={reporting} request={request} />
            ))}
          </div>
        </details>
      </Card>

      <Card>
        <SectionHeader title="Rapportage audit" count={reporting.auditEvents.length} />
        <div className="grid gap-3">
          {reporting.auditEvents.length === 0 ? <EmptyState>Nog geen rapportage-auditregels.</EmptyState> : null}
          {reporting.auditEvents.map((event) => (
            <ReportSnapshotRow key={event.id} detail={`${event.source_table} - ${event.risk_level} - ${formatDateTime(event.created_at)}`} label={event.action} value={event.source_record_id?.slice(0, 8) ?? "-"} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function ProviderConfigCard({ provider, title }: { provider: CommunicationProviderConfigRow | undefined; title: string }) {
  if (!provider) {
    return <EmptyState>{title} mist nog in de tenantconfiguratie.</EmptyState>;
  }

  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4" open={provider.provider === "smtp"}>
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{provider.display_name}</p>
            <p className="text-sm text-muted-foreground">
              {provider.provider} - {provider.mode} - {provider.host ?? "geen host"}
            </p>
          </div>
          <StatusPill tone={provider.status === "active" ? "success" : provider.status === "configured" ? "warning" : "neutral"}>{provider.status}</StatusPill>
        </div>
      </summary>
      <form action={updateCommunicationProviderConfigAction} className="mt-4 grid gap-3">
        <input name="id" type="hidden" value={provider.id} />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField defaultValue={provider.display_name} label="Naam" name="display_name" required />
          <SelectField defaultValue={provider.status} label="Status" name="status" options={providerStatusOptions} />
          <TextField defaultValue={provider.host} label="Host" name="host" />
          <TextField defaultValue={provider.port} label="Poort" name="port" type="number" />
          <TextField defaultValue={provider.from_email} label="Afzender e-mail" name="from_email" type="email" />
          <TextField defaultValue={provider.from_name} label="Afzender naam" name="from_name" />
          <TextField defaultValue={provider.username_secret_reference} label="Gebruikersnaam secret" name="username_secret_reference" />
          <TextField defaultValue={provider.password_secret_reference} label="Wachtwoord secret" name="password_secret_reference" />
          <TextField defaultValue={provider.api_key_secret_reference} label="API-key secret" name="api_key_secret_reference" />
        </div>
        <button className={primaryButtonClassName} type="submit">
          Provider opslaan
        </button>
      </form>
    </details>
  );
}

function MessageTemplateForm({ mode, template }: { mode: "create" | "update"; template?: MessageTemplateRow }) {
  return (
    <form action={mode === "create" ? createMessageTemplateAction : updateMessageTemplateAction} className="grid gap-3">
      {template ? <input name="id" type="hidden" value={template.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={template?.name} label="Naam" name="name" required />
        <TextField defaultValue={template?.code} label="Code" name="code" />
        <SelectField defaultValue={template?.channel ?? "email"} label="Kanaal" name="channel" options={channelOptions} />
        <SelectField defaultValue={template?.audience ?? "parent"} label="Doelgroep" name="audience" options={audienceOptions} />
        <SelectField defaultValue={template?.status ?? "draft"} label="Status" name="status" options={templateStatusOptions} />
        <TextField defaultValue={template?.sort_order ?? 0} label="Sortering" name="sort_order" type="number" />
      </div>
      <TextField defaultValue={template?.subject_template} label="Onderwerp template" name="subject_template" />
      <TipTapBlockBuilder defaultBody={template?.body_template} fieldName="body_template" />
      <TextField defaultValue={template?.required_variables.join(", ")} label="Verplichte variabelen" name="required_variables" />
      <TextField defaultValue={template?.tags.join(", ")} label="Tags" name="tags" />
      <button className={primaryButtonClassName} type="submit">
        {mode === "create" ? "Template maken" : "Template opslaan"}
      </button>
    </form>
  );
}

function TemplateManagementPage({ audience, snapshot, subtitle, title }: Phase12PageProps & { audience: "mail" | "notification"; subtitle: string; title: string }) {
  if (snapshot.status !== "ready") {
    return <Phase12StatusPanel snapshot={snapshot} title={`${title} niet beschikbaar`} />;
  }

  const templates =
    audience === "mail"
      ? snapshot.data.messageTemplates.filter((template) => template.channel === "email")
      : snapshot.data.messageTemplates.filter((template) => template.channel === "in_app" || template.tags.includes("notification") || template.tags.includes("portal"));

  return (
    <div className="grid gap-6">
      <PageHeader action={<StatusPill tone="info">Templates</StatusPill>} kicker={`Backoffice - ${title.toLowerCase()}`} subtitle={subtitle} title={title} />
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Templates" value={templates.length.toString()} detail={`${snapshot.data.messageTemplates.length} totaal`} />
        <MetricCard icon={<ShieldCheck className="h-5 w-5" />} label="Variabelen" value={templateVariableCount(templates).toString()} detail="shortcodes gevalideerd" />
        <MetricCard icon={<Mail className="h-5 w-5" />} label="Actief" value={templates.filter((template) => template.status === "active").length.toString()} detail="beschikbaar voor outbox" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <SectionHeader title="Nieuw template" count={templates.length} />
          <div className="mt-4">
            <MessageTemplateForm mode="create" />
          </div>
        </Card>
        <Card>
          <SectionHeader title="Shortcodes" count={templateShortcodes.length} />
          <ShortcodePalette />
        </Card>
      </div>
      <Card>
        <SectionHeader title={title} count={templates.length} />
        <div className="grid gap-3">
          {templates.length === 0 ? <EmptyState>Nog geen templates voor deze categorie.</EmptyState> : null}
          {templates.map((template) => (
            <TemplateCard key={template.id} template={template} />
          ))}
        </div>
      </Card>
    </div>
  );
}

function TemplateCard({ template }: { template: MessageTemplateRow }) {
  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{template.name}</p>
            <p className="text-sm text-muted-foreground">
              {template.code} - {template.channel} - {template.audience}
            </p>
          </div>
          <StatusPill tone={statusTone(template.status)}>{template.status}</StatusPill>
        </div>
      </summary>
      <div className="mt-4">
        <MessageTemplateForm mode="update" template={template} />
        <form action={previewMessageTemplateAction} className="mt-4 grid gap-3 border-t border-border pt-4">
          <input name="id" type="hidden" value={template.id} />
          <TextAreaField defaultValue={formatJson(defaultPreviewContext(template))} label="Preview context JSON" name="preview_context" />
          <button className={secondaryButtonClassName} type="submit">
            Preview valideren
          </button>
          <div className="grid gap-3 md:grid-cols-2">
            <InfoTile label="Variabelen" value={template.required_variables.length > 0 ? template.required_variables.join(", ") : "geen"} />
            <InfoTile label="Laatste validatie" value={template.last_preview_errors.length === 0 ? "ok" : `${template.last_preview_errors.length} mist`} />
          </div>
          {template.last_preview_errors.length > 0 ? (
            <p className="rounded-2xl bg-destructive/10 p-3 text-sm font-semibold text-destructive">
              Ontbrekend in preview context: {template.last_preview_errors.join(", ")}
            </p>
          ) : null}
          {template.last_previewed_at ? (
            <div className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="font-semibold">{template.last_preview_subject ?? "Geen onderwerp"}</p>
              <p className="mt-2 whitespace-pre-line text-muted-foreground">{template.last_preview_body}</p>
            </div>
          ) : null}
        </form>
      </div>
    </details>
  );
}

function QueueMessageForm({ data, newsletter }: { data: AdminPhase12Data; newsletter?: boolean }) {
  return (
    <form action={queueMessageAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue={newsletter ? "all_parents" : "direct"} label="Doelgroep" name="target_kind" options={targetKindOptions} />
        <SelectField includeEmpty label="Template" name="template_id" options={data.messageTemplates.map(optionFromTemplate)} />
        <SelectField defaultValue="email" label="Kanaal" name="channel" options={channelOptions} />
        <SelectField defaultValue="smtp" label="Provider" name="provider" options={messageProviderOptions} />
        <SelectField defaultValue={newsletter ? "draft" : "queued"} label="Status" name="status" options={messageDraftStatusOptions} />
        <SelectField includeEmpty label="Profiel" name="recipient_profile_id" options={data.profiles.map(optionFromProfile)} />
        <TextField label="E-mail" name="recipient_email" type="email" />
        <SelectField includeEmpty label="Leerling" name="participant_id" options={data.participants.map(optionFromParticipant)} />
        <SelectField includeEmpty label="Inschrijving" name="enrollment_id" options={data.enrollments.map((enrollment) => optionFromEnrollment(enrollment, data))} />
        <SelectField includeEmpty label="Groep" name="group_id" options={data.groups.map(optionFromGroup)} />
        <SelectField includeEmpty label="Instructeur" name="instructor_id" options={data.instructors.map(optionFromInstructor)} />
        <TextField label="Gepland om" name="scheduled_at" type="datetime-local" />
      </div>
      <TextField label="Onderwerp" name="subject" />
      <TipTapBlockBuilder defaultBody={newsletter ? "Beste {{parent_name}},\n\nNieuws vanuit {{tenant_name}}.\n\n{{cta_url}}" : ""} fieldName="body" />
      <TextAreaField defaultValue='{ "learner_name": "Demo leerling", "parent_name": "Ouder", "tenant_name": "AquaSwim", "cta_url": "https://nxttrack.nl" }' label="Render context JSON" name="render_context" />
      <button className={primaryButtonClassName} type="submit">
        {newsletter ? "Nieuwsbrief als concept opslaan" : "Bericht klaarzetten"}
      </button>
    </form>
  );
}

function MessageOutboxCard({ lookups, message, showResetRetry }: { lookups: Phase12Lookups; message: MessageOutboxRow; showResetRetry?: boolean }) {
  const participant = message.participant_id ? lookups.participants.get(message.participant_id) : null;
  const profile = message.recipient_profile_id ? lookups.profiles.get(message.recipient_profile_id) : null;
  const template = message.template_id ? lookups.templates.get(message.template_id) : null;

  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{message.subject ?? template?.name ?? "Bericht zonder onderwerp"}</p>
          <p className="text-sm text-muted-foreground">
            {profile?.full_name ?? message.recipient_email ?? "ontvanger onbekend"} - {participant?.display_name ?? "geen leerling"} - {message.provider}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={statusTone(message.status)}>{message.status}</StatusPill>
          <StatusPill tone={statusTone(message.delivery_status)}>{message.delivery_status}</StatusPill>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{message.body}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <InfoTile label="Pogingen" value={`${message.retry_count}/${message.max_attempts}`} />
        <InfoTile label="Provider ID" value={message.provider_message_id ?? "-"} />
        <InfoTile label="Volgende poging" value={message.next_retry_at ? formatDateTime(message.next_retry_at) : "-"} />
        <InfoTile label="Verzonden" value={message.sent_at ? formatDateTime(message.sent_at) : "-"} />
        <InfoTile label="Event" value={message.event_key ?? "handmatig"} />
        <InfoTile label="Bron" value={message.source_table ?? "-"} />
      </div>
      {message.failure_reason || message.error_message ? <p className="mt-3 rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">{message.failure_reason ?? message.error_message}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {["failed", "retrying"].includes(message.status) ? (
          <form action={retryMessageAction}>
            <input name="id" type="hidden" value={message.id} />
            {showResetRetry ? <input name="reset_attempts" type="hidden" value="true" /> : null}
            <button className={secondaryButtonClassName} type="submit">
              {showResetRetry ? "Retry teller resetten" : "Opnieuw proberen"}
            </button>
          </form>
        ) : null}
        {["draft", "queued", "retrying"].includes(message.status) ? (
          <form action={cancelMessageAction}>
            <input name="id" type="hidden" value={message.id} />
            <input name="reason" type="hidden" value="Geannuleerd via backoffice." />
            <button className={secondaryButtonClassName} type="submit">
              Annuleren
            </button>
          </form>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{message.scheduled_at ? `Gepland ${formatDateTime(message.scheduled_at)}` : `Aangemaakt ${formatDateTime(message.created_at)}`}</p>
    </div>
  );
}

function OperationalTaskForm({ data, mode, task }: { data: AdminPhase12Data; mode: "create" | "update"; task?: OperationalTaskRow }) {
  return (
    <form action={mode === "create" ? createOperationalTaskAction : updateOperationalTaskAction} className="grid gap-3">
      {task ? <input name="id" type="hidden" value={task.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={task?.title} label="Titel" name="title" required />
        <SelectField defaultValue={task?.task_type ?? "general"} label="Type" name="task_type" options={taskTypeOptions} />
        <SelectField defaultValue={task?.status ?? "open"} label="Status" name="status" options={taskStatusOptions} />
        <SelectField defaultValue={task?.priority ?? "normal"} label="Prioriteit" name="priority" options={taskPriorityOptions} />
        <SelectField includeEmpty defaultValue={task?.assigned_to_profile_id} label="Toegewezen aan" name="assigned_to_profile_id" options={data.profiles.map(optionFromProfile)} />
        <SelectField includeEmpty defaultValue={task?.participant_id} label="Leerling" name="participant_id" options={data.participants.map(optionFromParticipant)} />
        <SelectField includeEmpty defaultValue={task?.enrollment_id} label="Inschrijving" name="enrollment_id" options={data.enrollments.map((enrollment) => optionFromEnrollment(enrollment, data))} />
        <TextField defaultValue={task?.due_on} label="Deadline" name="due_on" type="date" />
      </div>
      <TextAreaField defaultValue={task?.description} label="Omschrijving" name="description" />
      <button className={primaryButtonClassName} type="submit">
        {mode === "create" ? "Taak maken" : "Taak opslaan"}
      </button>
    </form>
  );
}

function TaskCard({ data, lookups, task }: { data: AdminPhase12Data; lookups: Phase12Lookups; task: OperationalTaskRow }) {
  const participant = task.participant_id ? lookups.participants.get(task.participant_id) : null;
  const profile = task.assigned_to_profile_id ? lookups.profiles.get(task.assigned_to_profile_id) : null;

  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{task.title}</p>
            <p className="text-sm text-muted-foreground">
              {task.task_type} - {participant?.display_name ?? "geen leerling"} - {profile?.full_name ?? "niet toegewezen"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill tone={priorityTone(task.priority)}>{task.priority}</StatusPill>
            <StatusPill tone={statusTone(task.status)}>{task.status}</StatusPill>
          </div>
        </div>
      </summary>
      {task.description ? <p className="mt-3 text-sm text-muted-foreground">{task.description}</p> : null}
      <div className="mt-4">
        <OperationalTaskForm data={data} mode="update" task={task} />
      </div>
    </details>
  );
}

function DocumentRecordForm({ data, document, mode }: { data: AdminPhase12Data; document?: TenantDocumentRecordRow; mode: "create" | "update" }) {
  return (
    <form action={mode === "create" ? createTenantDocumentRecordAction : updateTenantDocumentRecordAction} className="grid gap-3">
      {document ? <input name="id" type="hidden" value={document.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <TextField defaultValue={document?.title} label="Titel" name="title" required />
        <SelectField defaultValue={document?.document_type ?? "document"} label="Type" name="document_type" options={documentTypeOptions} />
        <SelectField defaultValue={document?.visibility ?? "staff"} label="Zichtbaarheid" name="visibility" options={documentVisibilityOptions} />
        <SelectField defaultValue={document?.status ?? "draft"} label="Status" name="status" options={documentStatusOptions} />
        <SelectField includeEmpty defaultValue={document?.participant_id} label="Leerling" name="participant_id" options={data.participants.map(optionFromParticipant)} />
        <SelectField includeEmpty defaultValue={document?.enrollment_id} label="Inschrijving" name="enrollment_id" options={data.enrollments.map((enrollment) => optionFromEnrollment(enrollment, data))} />
        <SelectField includeEmpty defaultValue={document?.certificate_id} label="Diploma/certificaat" name="certificate_id" options={data.certificates.map((certificate) => ({ label: `${certificate.title} - ${certificate.certificate_number ?? certificate.status}`, value: certificate.id }))} />
        <TextField defaultValue={document?.available_on} label="Beschikbaar vanaf" name="available_on" type="date" />
        <TextField defaultValue={document?.storage_bucket ?? "tenant-documents"} label="Opslagbucket" name="storage_bucket" />
        <TextField defaultValue={document?.file_path} label="Bestandspad" name="file_path" />
        <TextField defaultValue={document?.retention_until} label="Bewaren tot" name="retention_until" type="date" />
      </div>
      <button className={primaryButtonClassName} type="submit">
        {mode === "create" ? "Documentrecord maken" : "Documentrecord opslaan"}
      </button>
    </form>
  );
}

function DocumentRecordCard({ data, document, lookups }: { data: AdminPhase12Data; document: TenantDocumentRecordRow; lookups: Phase12Lookups }) {
  const participant = document.participant_id ? lookups.participants.get(document.participant_id) : null;

  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{document.title}</p>
            <p className="text-sm text-muted-foreground">
              {document.document_type} - {document.visibility} - {participant?.display_name ?? "tenant breed"}
            </p>
          </div>
          <StatusPill tone={statusTone(document.status)}>{document.status}</StatusPill>
        </div>
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <InfoTile label="Opslag" value={document.storage_bucket} />
        <InfoTile label="Pad" value={document.file_path ?? "nog geen bestand"} />
        <InfoTile label="Beschikbaar" value={document.available_on ? formatDate(document.available_on) : "-"} />
        <InfoTile label="Versie" value={`v${document.version_number}`} />
        <InfoTile label="Upload" value={document.upload_status} />
        <InfoTile label="Bestand" value={document.original_filename ?? document.mime_type ?? "-"} />
        <InfoTile label="Grootte" value={document.file_size_bytes ? formatBytes(document.file_size_bytes) : "-"} />
        <InfoTile label="Retentie" value={document.retention_until ? formatDate(document.retention_until) : "geen einddatum"} />
        <InfoTile label="Laatst gedownload" value={document.last_downloaded_at ? formatDateTime(document.last_downloaded_at) : "-"} />
      </div>
      <p className="mt-3 rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        Uploads worden als nieuwe versie opgeslagen onder tenant/document/vN. Ouderzichtbaarheid volgt de velden status + zichtbaarheid; retentie is zichtbaar voor beleid en toekomstige opschoning.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={uploadTenantDocumentAction} className="flex flex-wrap items-end gap-2">
          <input name="id" type="hidden" value={document.id} />
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            <span>Bestand uploaden</span>
            <input accept=".pdf,.png,.jpg,.jpeg,.csv,.json,.txt,application/pdf,image/png,image/jpeg,text/csv,application/json,text/plain" className={fieldClassName} name="file" required type="file" />
          </label>
          <button className={primaryButtonClassName} type="submit">
            Uploaden
          </button>
        </form>
        {document.file_path ? (
          <a className={secondaryButtonClassName} href={`/api/documents/${document.id}/download`}>
            Download
          </a>
        ) : null}
      </div>
      <div className="mt-4">
        <DocumentRecordForm data={data} document={document} mode="update" />
      </div>
    </details>
  );
}

function ReportFilterForm({ reporting }: { reporting: ReportingDashboardData }) {
  const filters = reporting.filters;

  return (
    <form action="/admin/rapportages" className="grid gap-3 md:grid-cols-4" method="get">
      <SelectField includeEmpty defaultValue={filters.programId} label="Programma" name="program_id" options={reporting.lookups.programs.map(optionFromLookup)} />
      <SelectField includeEmpty defaultValue={filters.stageId} label="Stage" name="stage_id" options={reporting.lookups.stages.map(optionFromLookup)} />
      <SelectField includeEmpty defaultValue={filters.groupId} label="Groep" name="group_id" options={reporting.lookups.groups.map(optionFromLookup)} />
      <SelectField includeEmpty defaultValue={filters.instructorId} label="Instructeur" name="instructor_id" options={reporting.lookups.instructors.map(optionFromLookup)} />
      <TextField defaultValue={filters.status} label="Status" name="status" />
      <TextField defaultValue={filters.dateFrom} label="Vanaf" name="date_from" type="date" />
      <TextField defaultValue={filters.dateTo} label="Tot en met" name="date_to" type="date" />
      <div className="flex items-end gap-2">
        <button className={primaryButtonClassName} type="submit">
          <Filter className="mr-2 inline h-4 w-4" />
          Filteren
        </button>
        <a className={secondaryButtonClassName} href="/admin/rapportages">
          Reset
        </a>
      </div>
    </form>
  );
}

function ReportExportForm({ mode, reporting, request }: { mode: "create" | "update"; reporting: ReportingDashboardData; request?: ReportExportRequestRow }) {
  const filters = request
    ? {
        programId: request.program_id,
        stageId: request.stage_id,
        groupId: request.group_id,
        instructorId: request.instructor_id,
        status: request.status_filter,
        dateFrom: request.date_from,
        dateTo: request.date_to
      }
    : reporting.filters;

  return (
    <form action={mode === "create" ? createReportExportRequestAction : updateReportExportRequestAction} className="grid gap-3">
      {request ? <input name="id" type="hidden" value={request.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue={request?.report_type ?? "occupancy"} label="Rapport" name="report_type" options={reportTypeOptions} />
        <SelectField defaultValue={request?.export_format ?? "csv"} label="Format" name="export_format" options={exportFormatOptions} />
        <SelectField defaultValue={request?.status ?? "requested"} label="Status" name="status" options={exportStatusOptions} />
        <SelectField includeEmpty defaultValue={filters.programId} label="Programmafilter" name="program_id" options={reporting.lookups.programs.map(optionFromLookup)} />
        <SelectField includeEmpty defaultValue={filters.stageId} label="Stagefilter" name="stage_id" options={reporting.lookups.stages.map(optionFromLookup)} />
        <SelectField includeEmpty defaultValue={filters.groupId} label="Groepfilter" name="group_id" options={reporting.lookups.groups.map(optionFromLookup)} />
        <SelectField includeEmpty defaultValue={filters.instructorId} label="Instructeurfilter" name="instructor_id" options={reporting.lookups.instructors.map(optionFromLookup)} />
        <TextField defaultValue={filters.status} label="Statusfilter" name="status_filter" />
        <TextField defaultValue={filters.dateFrom} label="Vanaf" name="date_from" type="date" />
        <TextField defaultValue={filters.dateTo} label="Tot en met" name="date_to" type="date" />
      </div>
      <input name="file_path" type="hidden" value={request?.file_path ?? ""} />
      <TextAreaField defaultValue={request ? formatJson(request.filters) : "{ \"scope\": \"filtered_dashboard\" }"} label="Extra filters JSON" name="filters" />
      <TextAreaField defaultValue={request?.error_message} label="Foutmelding" name="error_message" />
      <button className={primaryButtonClassName} type="submit">
        {mode === "create" ? "Export aanvragen" : "Export opslaan"}
      </button>
    </form>
  );
}

function ReportExportCard({ reporting, request }: { reporting: ReportingDashboardData; request: ReportExportRequestRow }) {
  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {request.report_type} - {request.export_format}
            </p>
            <p className="text-sm text-muted-foreground">
              {request.file_path ?? "export worker moet bestand nog maken"} {request.row_count !== null ? `- ${request.row_count} regels` : ""}
            </p>
          </div>
          <StatusPill tone={statusTone(request.status)}>{request.status}</StatusPill>
        </div>
      </summary>
      <div className="mt-4">
        <ReportExportForm mode="update" reporting={reporting} request={request} />
        <div className="mt-4 flex flex-wrap gap-2">
          <form action={generateReportExportAction}>
            <input name="id" type="hidden" value={request.id} />
            <button className={primaryButtonClassName} type="submit">
              Export genereren
            </button>
          </form>
          {request.file_path ? (
            <a className={secondaryButtonClassName} href={`/api/reports/${request.id}/download`}>
              Download
            </a>
          ) : null}
        </div>
      </div>
    </details>
  );
}

function ReportPermissionForm() {
  return (
    <form action={upsertReportPermissionGrantAction} className="grid gap-3 rounded-2xl border border-border bg-card p-4 md:grid-cols-4">
      <SelectField defaultValue="occupancy" label="Rapport" name="report_key" options={reportPermissionReportOptions} />
      <SelectField defaultValue="tenant_staff" label="Rol" name="role" options={reportPermissionRoleOptions} />
      <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold">
        <input defaultChecked name="can_view" type="checkbox" />
        Bekijken
      </label>
      <label className="flex min-h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold">
        <input name="can_export" type="checkbox" />
        Exporteren
      </label>
      <button className={primaryButtonClassName} type="submit">
        Recht opslaan
      </button>
    </form>
  );
}

function ReportPermissionCard({ grant }: { grant: ReportPermissionGrantRow }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{grant.report_key}</p>
          <p className="text-sm text-muted-foreground">{grant.role}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={grant.can_view ? "success" : "neutral"}>{grant.can_view ? "bekijken" : "geen view"}</StatusPill>
          <StatusPill tone={grant.can_export ? "success" : "neutral"}>{grant.can_export ? "export" : "geen export"}</StatusPill>
        </div>
      </div>
    </div>
  );
}

function TipTapBlockBuilder({ defaultBody, fieldName = "body_template" }: { defaultBody?: string | null; fieldName?: string }) {
  return (
    <div className="grid gap-3 rounded-2xl border border-border bg-muted/35 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">TipTap block builder</p>
          <p className="text-sm font-bold text-foreground">Contentblokken en shortcodes</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {["Kop", "Tekst", "Knop", "Divider"].map((block) => (
            <span key={block} className="rounded-full border border-border bg-card px-2 py-1 text-xs font-semibold">
              {block}
            </span>
          ))}
        </div>
      </div>
      <ShortcodePalette compact />
      <TextAreaField defaultValue={defaultBody} label="Body" name={fieldName} required />
    </div>
  );
}

function ShortcodePalette({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3"}>
      {templateShortcodes.map((shortcode) => (
        <code key={shortcode.value} className="rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-primary">
          {shortcode.value}
        </code>
      ))}
    </div>
  );
}

function ReportDashboardCard({ section, title, value }: { section: ReportSection; title: string; value: string }) {
  const rows = section.rows.slice(0, 8);
  const headers = Object.keys(rows[0] ?? {}).slice(0, 5);
  const chartRows = rows.slice(0, 6).map((row, index) => ({
    label: reportRowLabel(row, index),
    value: reportRowMetric(row)
  }));
  const maxValue = Math.max(1, ...chartRows.map((row) => row.value));

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-muted-foreground">{section.rows.length} regels uit echte tenantdata.</p>
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      {rows.length === 0 ? <EmptyState>Geen data voor deze filterset.</EmptyState> : null}
      {rows.length > 0 ? (
        <div className="grid gap-4">
          <div className="grid gap-2 rounded-2xl border border-border bg-muted/35 p-3">
            {chartRows.map((row) => (
              <div key={`${title}-${row.label}`} className="grid gap-1">
                <div className="flex items-center justify-between gap-3 text-xs font-semibold">
                  <span className="truncate text-muted-foreground">{row.label}</span>
                  <span>{row.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-border">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(6, Math.round((row.value / maxValue) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
          <details>
            <summary className="w-fit cursor-pointer rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted">Tabel bekijken</summary>
            <div className="mt-3 min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
              <table className="w-max min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    {headers.map((header) => (
                      <th key={header} className="border-b border-border px-2 py-2">
                        {header.replaceAll("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${title}-${index}`}>
                      {headers.map((header) => (
                        <td key={header} className="border-b border-border/70 px-2 py-2">
                          {formatReportCell(row[header])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      ) : null}
    </Card>
  );
}

function ReportSnapshotRow({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-muted/35 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </div>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function Phase12StatusPanel({ snapshot, title }: Phase12PageProps & { title: string }) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{title}</h2>
        <StatusPill tone={snapshot.status === "not_configured" ? "warning" : "danger"}>{snapshot.status}</StatusPill>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">Deze Fase 12 pagina heeft Supabase-configuratie en een actieve tenant nodig.</p>
      {snapshot.errors.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          {snapshot.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function MetricCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </Card>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <StatusPill tone="neutral">{count}</StatusPill>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">{children}</div>;
}

function TextField({ defaultValue, label, name, required, type = "text" }: { defaultValue?: string | number | null; label: string; name: string; required?: boolean; type?: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <input className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required} step={type === "number" ? "1" : undefined} type={type} />
    </label>
  );
}

function TextAreaField({ defaultValue, label, name, required }: { defaultValue?: string | null; label: string; name: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <textarea className={`${fieldClassName} min-h-24`} defaultValue={defaultValue ?? ""} name={name} required={required} />
    </label>
  );
}

function SelectField({
  defaultValue,
  includeEmpty,
  label,
  name,
  options,
  required
}: {
  defaultValue?: string | null;
  includeEmpty?: boolean;
  label: string;
  name: string;
  options: { label: string; value: string }[];
  required?: boolean;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span>{label}</span>
      <select className={fieldClassName} defaultValue={defaultValue ?? ""} name={name} required={required}>
        {includeEmpty || required ? <option value="">{required ? "Selecteer" : "-"}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function optionFromLookup(row: { id: string; name: string; status?: string }) {
  return { label: row.status ? `${row.name} - ${row.status}` : row.name, value: row.id };
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function activeFilterCount(filters: ReportingDashboardData["filters"]) {
  return Object.values(filters).filter(Boolean).length;
}

function formatReportCell(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  if (typeof value === "number") {
    return value.toString();
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);
  return stringValue.length > 36 ? `${stringValue.slice(0, 33)}...` : stringValue;
}

function buildLookups(data: AdminPhase12Data): Phase12Lookups {
  return {
    participants: byId(data.participants),
    enrollments: byId(data.enrollments),
    profiles: byId(data.profiles),
    templates: byId(data.messageTemplates)
  };
}

function buildCapacityRows(data: AdminDomainData) {
  const today = new Date().toISOString().slice(0, 10);

  return data.groups.map((group: GroupRow) => {
    const resource = data.resources.find((entry) => entry.id === group.resource_id);
    const activeMemberships = data.groupMemberships.filter((membership) => membership.group_id === group.id && ["planned", "active"].includes(membership.status) && (!membership.ends_on || membership.ends_on >= today)).length;
    const capacityLimit = Math.min(group.capacity, resource?.capacity ?? group.capacity);

    return {
      group,
      activeMemberships,
      capacityLimit,
      availableSpots: capacityLimit - activeMemberships
    };
  });
}

function byId<Row extends { id: string }>(rows: Row[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function optionFromTemplate(template: MessageTemplateRow) {
  return { label: `${template.name} - ${template.status}`, value: template.id };
}

function optionFromProfile(profile: OperationsProfileRow) {
  return { label: profile.full_name ?? profile.id.slice(0, 8), value: profile.id };
}

function optionFromParticipant(participant: OperationsParticipantRow) {
  return { label: `${participant.display_name} - ${participant.status}`, value: participant.id };
}

function optionFromGroup(group: OperationsGroupRow) {
  return { label: `${group.name} - ${group.status}`, value: group.id };
}

function optionFromInstructor(instructor: OperationsInstructorRow) {
  return { label: `${instructor.display_name} - ${instructor.status}`, value: instructor.id };
}

function optionFromEnrollment(enrollment: OperationsEnrollmentRow, data: AdminPhase12Data) {
  const participant = data.participants.find((entry) => entry.id === enrollment.participant_id);
  const program = data.programs.find((entry) => entry.id === enrollment.program_id);

  return {
    label: `${participant?.display_name ?? "Leerling"} - ${program?.name ?? "Programma"} - ${enrollment.status}`,
    value: enrollment.id
  };
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (["active", "available", "ready", "sent", "done", "queued"].includes(status)) {
    return "success";
  }

  if (["draft", "requested", "processing", "configured", "open", "in_progress"].includes(status)) {
    return "warning";
  }

  if (["failed", "cancelled", "archived", "disabled"].includes(status)) {
    return "danger";
  }

  return "neutral";
}

function priorityTone(priority: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (priority === "urgent") {
    return "danger";
  }

  if (priority === "high") {
    return "warning";
  }

  if (priority === "low") {
    return "neutral";
  }

  return "info";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(priceCents / 100);
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

function defaultPreviewContext(template: MessageTemplateRow) {
  const context: Record<string, string> = {
    leerling: "Demo leerling",
    tenant: "AquaSwim"
  };

  for (const variable of template.required_variables) {
    context[variable] = `Voorbeeld ${variable}`;
  }

  return context;
}

function templateVariableCount(templates: MessageTemplateRow[]) {
  return new Set(templates.flatMap((template) => template.required_variables)).size;
}

function reportRowMetric(row: Record<string, unknown>) {
  const preferredKeys = ["occupied", "capacity", "total", "updates", "records", "open_amount_cents", "net_cents", "amount_cents", "count"];

  for (const key of preferredKeys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.abs(value);
    }
  }

  const numericValue = Object.values(row).find((value) => typeof value === "number" && Number.isFinite(value));
  return typeof numericValue === "number" ? Math.abs(numericValue) : 1;
}

function reportRowLabel(row: Record<string, unknown>, index: number) {
  const preferredKeys = ["group_name", "program_name", "stage_name", "instructor_name", "status", "period", "name"];

  for (const key of preferredKeys) {
    const value = row[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return `Rij ${index + 1}`;
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const primaryButtonClassName = "w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90";
const secondaryButtonClassName = "inline-flex w-fit items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted";

const templateShortcodes = [
  { label: "Tenant", value: "{{tenant_name}}" },
  { label: "Ouder", value: "{{parent_name}}" },
  { label: "Leerling", value: "{{learner_name}}" },
  { label: "Programma", value: "{{program_name}}" },
  { label: "Groep", value: "{{group_name}}" },
  { label: "Lesdatum", value: "{{session_date}}" },
  { label: "Lesplek", value: "{{slot_offer_url}}" },
  { label: "Factuur", value: "{{invoice_number}}" },
  { label: "Bedrag", value: "{{amount_due}}" },
  { label: "CTA", value: "{{cta_url}}" }
];

const targetKindOptions = [
  { label: "Losse ontvanger", value: "direct" },
  { label: "Ouders van leerling", value: "participant_guardians" },
  { label: "Ouders van groep", value: "group_guardians" },
  { label: "Instructeur", value: "instructor" },
  { label: "Alle instructeurs", value: "all_instructors" },
  { label: "Alle ouders/verzorgers", value: "all_parents" }
];

const providerStatusOptions = [
  { label: "Uitgeschakeld", value: "disabled" },
  { label: "Geconfigureerd", value: "configured" },
  { label: "Actief", value: "active" }
];

const channelOptions = [
  { label: "E-mail", value: "email" },
  { label: "In-app", value: "in_app" }
];

const audienceOptions = [
  { label: "Ouder", value: "parent" },
  { label: "Instructeur", value: "instructor" },
  { label: "Tenantbeheerder", value: "tenant_admin" },
  { label: "Iedereen", value: "all" }
];

const templateStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "Actief", value: "active" },
  { label: "Gearchiveerd", value: "archived" }
];

const messageProviderOptions = [
  { label: "SMTP", value: "smtp" },
  { label: "SendGrid API voorbereid", value: "sendgrid" },
  { label: "In-app", value: "internal" }
];

const messageDraftStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "In wachtrij", value: "queued" }
];

const taskTypeOptions = [
  { label: "Algemeen", value: "general" },
  { label: "Planning", value: "planning" },
  { label: "Plaatsing", value: "placement" },
  { label: "Betaling", value: "payment" },
  { label: "Document", value: "document" },
  { label: "Opvolging", value: "follow_up" }
];

const taskStatusOptions = [
  { label: "Open", value: "open" },
  { label: "Bezig", value: "in_progress" },
  { label: "Afgerond", value: "done" },
  { label: "Geannuleerd", value: "cancelled" }
];

const taskPriorityOptions = [
  { label: "Laag", value: "low" },
  { label: "Normaal", value: "normal" },
  { label: "Hoog", value: "high" },
  { label: "Urgent", value: "urgent" }
];

const documentTypeOptions = [
  { label: "Document", value: "document" },
  { label: "Beleid", value: "policy" },
  { label: "Factuurbericht", value: "invoice_notice" },
  { label: "Certificaat", value: "certificate" },
  { label: "Diploma", value: "diploma" },
  { label: "Interne notitie", value: "internal_note" }
];

const documentVisibilityOptions = [
  { label: "Medewerkers", value: "staff" },
  { label: "Ouder", value: "parent" },
  { label: "Instructeur", value: "instructor" },
  { label: "Iedereen", value: "all" }
];

const documentStatusOptions = [
  { label: "Concept", value: "draft" },
  { label: "Beschikbaar", value: "available" },
  { label: "Gearchiveerd", value: "archived" }
];

const reportTypeOptions = [
  { label: "Bezetting", value: "occupancy" },
  { label: "Wachtlijst", value: "waitlist" },
  { label: "Voortgang", value: "progress" },
  { label: "Aanwezigheid", value: "attendance" },
  { label: "Betalingen", value: "payments" },
  { label: "Omzet", value: "revenue" }
];

const exportFormatOptions = [
  { label: "CSV", value: "csv" },
  { label: "XLSX", value: "xlsx" },
  { label: "JSON", value: "json" }
];

const reportPermissionReportOptions = [
  ...reportTypeOptions,
  { label: "Exports", value: "exports" }
];

const reportPermissionRoleOptions = [
  { label: "Tenant owner", value: "tenant_owner" },
  { label: "Tenant admin", value: "tenant_admin" },
  { label: "Tenant medewerker", value: "tenant_staff" },
  { label: "Instructeur", value: "instructor" }
];

const exportStatusOptions = [
  { label: "Aangevraagd", value: "requested" },
  { label: "Bezig", value: "processing" },
  { label: "Klaar", value: "ready" },
  { label: "Mislukt", value: "failed" },
  { label: "Geannuleerd", value: "cancelled" }
];
