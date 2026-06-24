import type { ReactNode } from "react";
import { BarChart3, ClipboardList, Download, FileText, Inbox, Mail, Send, Settings } from "lucide-react";

import { Card, PageHeader, StatusPill } from "@/components/shell/ui";
import {
  createMessageTemplateAction,
  createOperationalTaskAction,
  createReportExportRequestAction,
  createTenantDocumentRecordAction,
  queueMessageAction,
  updateCommunicationProviderConfigAction,
  updateMessageTemplateAction,
  updateOperationalTaskAction,
  updateReportExportRequestAction,
  updateTenantDocumentRecordAction
} from "@/lib/operations/admin-phase12-actions";
import type {
  AdminPhase12Data,
  AdminPhase12Snapshot,
  CommunicationProviderConfigRow,
  MessageOutboxRow,
  MessageTemplateRow,
  OperationalTaskRow,
  OperationsEnrollmentRow,
  OperationsParticipantRow,
  OperationsProfileRow,
  ReportExportRequestRow,
  TenantDocumentRecordRow
} from "@/lib/operations/admin-phase12-read-model";
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
  const activeTemplates = data.messageTemplates.filter((template) => template.status === "active").length;
  const queuedMessages = data.messageOutbox.filter((message) => message.status === "queued").length;
  const smtpProvider = data.providerConfigs.find((provider) => provider.provider === "smtp");
  const sendgridProvider = data.providerConfigs.find((provider) => provider.provider === "sendgrid");

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Communicatie</StatusPill>}
        kicker="Backoffice - berichten"
        subtitle="SMTP-first met SendGrid als provider. Berichten worden klaargezet in de outbox; er is nog geen live worker."
        title="Berichten"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<Settings className="h-5 w-5" />} label="Providers" value={data.providerConfigs.length.toString()} detail="SMTP + SendGrid" />
        <MetricCard icon={<Mail className="h-5 w-5" />} label="Templates actief" value={activeTemplates.toString()} detail={`${data.messageTemplates.length} totaal`} />
        <MetricCard icon={<Send className="h-5 w-5" />} label="Outbox queued" value={queuedMessages.toString()} detail="nog niet live verstuurd" />
        <MetricCard icon={<Inbox className="h-5 w-5" />} label="SendGrid API" value={sendgridProvider?.status ?? "missing"} detail="adapter voorbereid" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <SectionHeader title="E-mail instellingen" count={data.providerConfigs.length} />
          <div className="grid gap-3">
            <ProviderConfigCard provider={smtpProvider} title="SMTP via SendGrid" />
            <ProviderConfigCard provider={sendgridProvider} title="SendGrid API voorbereiding" />
          </div>
        </Card>

        <Card>
          <SectionHeader title="Nieuw template" count={data.messageTemplates.length} />
          <MessageTemplateForm mode="create" />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <SectionHeader title="Templates" count={data.messageTemplates.length} />
          <div className="grid gap-3">
            {data.messageTemplates.length === 0 ? <EmptyState>Nog geen templates.</EmptyState> : null}
            {data.messageTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeader title="Bericht klaarzetten" count={data.participants.length} />
          <QueueMessageForm data={data} />
        </Card>
      </div>

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

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Documenten</StatusPill>}
        kicker="Backoffice - documenten"
        subtitle="Documenten en rechten staan klaar; echte upload en opslagkoppeling blijft voorbereid."
        title="Documenten"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Documenten" value={data.documentRecords.length.toString()} detail="tenantdocumenten" />
        <MetricCard icon={<Download className="h-5 w-5" />} label="Beschikbaar" value={availableDocuments.toString()} detail="zichtbaar volgens rechten" />
        <MetricCard icon={<Inbox className="h-5 w-5" />} label="Ouderzichtbaar" value={parentVisible.toString()} detail="ouder/iedereen" />
        <MetricCard icon={<Settings className="h-5 w-5" />} label="Opslag" value="voorbereid" detail="tenant-documents" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <SectionHeader title="Nieuw documentrecord" count={data.participants.length} />
          <DocumentRecordForm data={data} mode="create" />
        </Card>

        <Card>
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

  const capacityRows = domain.status === "ready" ? buildCapacityRows(domain.data) : [];
  const totalCapacity = capacityRows.reduce((sum, row) => sum + row.capacityLimit, 0);
  const totalOccupied = capacityRows.reduce((sum, row) => sum + row.activeMemberships, 0);
  const waiting = placement.status === "ready" ? placement.data.waitlistEntries.filter((entry) => ["waiting", "matched"].includes(entry.status)).length : 0;
  const progressCount = domain.status === "ready" ? domain.data.progress.length : 0;
  const openAmount =
    payments.status === "ready"
      ? payments.data.invoices.filter((invoice) => ["open", "partially_paid", "overdue"].includes(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents), 0)
      : 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        action={<StatusPill tone="info">Rapportage</StatusPill>}
        kicker="Backoffice - rapportages"
        subtitle="Basisrapportages voor bezetting, wachtlijst, voortgang en betalingen met exportvoorbereiding."
        title="Rapportages"
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard icon={<BarChart3 className="h-5 w-5" />} label="Bezetting" value={`${totalOccupied}/${totalCapacity}`} detail="actieve plekken" />
        <MetricCard icon={<ClipboardList className="h-5 w-5" />} label="Wachtlijst" value={waiting.toString()} detail="wachtend/gematcht" />
        <MetricCard icon={<FileText className="h-5 w-5" />} label="Voortgang" value={progressCount.toString()} detail="laatste updates" />
        <MetricCard icon={<Download className="h-5 w-5" />} label="Openstaand" value={formatMoney(openAmount, "EUR")} detail="handmatige betalingen" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <SectionHeader title="Export aanvragen" count={phase12.data.reportExports.length} />
          <ReportExportForm mode="create" />
        </Card>

        <Card>
          <SectionHeader title="Rapport snapshots" count={4} />
          <div className="grid gap-3">
            <ReportSnapshotRow label="Bezetting" value={`${totalOccupied}/${totalCapacity}`} detail={`${capacityRows.reduce((sum, row) => sum + row.availableSpots, 0)} vrije plekken`} />
            <ReportSnapshotRow label="Wachtlijst" value={waiting.toString()} detail={placement.status === "ready" ? `${placement.data.placementSuggestions.length} plaatsingsvoorstellen` : placement.status} />
            <ReportSnapshotRow label="Voortgang" value={progressCount.toString()} detail={domain.status === "ready" ? `${domain.data.badges.length} badges gedefinieerd` : domain.status} />
            <ReportSnapshotRow label="Betalingen" value={formatMoney(openAmount, "EUR")} detail={payments.status === "ready" ? `${payments.data.invoices.length} facturen` : payments.status} />
          </div>
        </Card>
      </div>

      <Card>
        <SectionHeader title="Exportaanvragen" count={phase12.data.reportExports.length} />
        <div className="grid gap-3">
          {phase12.data.reportExports.length === 0 ? <EmptyState>Nog geen export requests.</EmptyState> : null}
          {phase12.data.reportExports.map((request) => (
            <ReportExportCard key={request.id} request={request} />
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
      <TextAreaField defaultValue={template?.body_template} label="Body template" name="body_template" required />
      <TextField defaultValue={template?.tags.join(", ")} label="Tags" name="tags" />
      <button className={primaryButtonClassName} type="submit">
        {mode === "create" ? "Template maken" : "Template opslaan"}
      </button>
    </form>
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
      </div>
    </details>
  );
}

function QueueMessageForm({ data }: { data: AdminPhase12Data }) {
  return (
    <form action={queueMessageAction} className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField includeEmpty label="Template" name="template_id" options={data.messageTemplates.map(optionFromTemplate)} />
        <SelectField defaultValue="email" label="Kanaal" name="channel" options={channelOptions} />
        <SelectField defaultValue="smtp" label="Provider" name="provider" options={messageProviderOptions} />
        <SelectField defaultValue="draft" label="Status" name="status" options={messageDraftStatusOptions} />
        <SelectField includeEmpty label="Profiel" name="recipient_profile_id" options={data.profiles.map(optionFromProfile)} />
        <TextField label="E-mail" name="recipient_email" type="email" />
        <SelectField includeEmpty label="Leerling" name="participant_id" options={data.participants.map(optionFromParticipant)} />
        <SelectField includeEmpty label="Inschrijving" name="enrollment_id" options={data.enrollments.map((enrollment) => optionFromEnrollment(enrollment, data))} />
        <TextField label="Gepland om" name="scheduled_at" type="datetime-local" />
      </div>
      <TextField label="Onderwerp" name="subject" />
      <TextAreaField label="Berichttekst" name="body" />
      <button className={primaryButtonClassName} type="submit">
        Bericht klaarzetten
      </button>
    </form>
  );
}

function MessageOutboxCard({ lookups, message }: { lookups: Phase12Lookups; message: MessageOutboxRow }) {
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
        <StatusPill tone={statusTone(message.status)}>{message.status}</StatusPill>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{message.body}</p>
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
      </div>
      <div className="mt-4">
        <DocumentRecordForm data={data} document={document} mode="update" />
      </div>
    </details>
  );
}

function ReportExportForm({ mode, request }: { mode: "create" | "update"; request?: ReportExportRequestRow }) {
  return (
    <form action={mode === "create" ? createReportExportRequestAction : updateReportExportRequestAction} className="grid gap-3">
      {request ? <input name="id" type="hidden" value={request.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField defaultValue={request?.report_type ?? "occupancy"} label="Rapport" name="report_type" options={reportTypeOptions} />
        <SelectField defaultValue={request?.export_format ?? "csv"} label="Format" name="export_format" options={exportFormatOptions} />
        <SelectField defaultValue={request?.status ?? "requested"} label="Status" name="status" options={exportStatusOptions} />
        <TextField defaultValue={request?.file_path} label="Bestandspad" name="file_path" />
      </div>
      <TextAreaField defaultValue={request ? formatJson(request.filters) : "{ \"scope\": \"all\" }"} label="Filters JSON" name="filters" />
      <TextAreaField defaultValue={request?.error_message} label="Foutmelding" name="error_message" />
      <button className={primaryButtonClassName} type="submit">
        {mode === "create" ? "Export aanvragen" : "Export opslaan"}
      </button>
    </form>
  );
}

function ReportExportCard({ request }: { request: ReportExportRequestRow }) {
  return (
    <details className="rounded-2xl border border-border bg-muted/35 p-4">
      <summary className="cursor-pointer">
        <div className="inline-flex w-full flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-semibold">
              {request.report_type} - {request.export_format}
            </p>
            <p className="text-sm text-muted-foreground">{request.file_path ?? "export worker moet bestand nog maken"}</p>
          </div>
          <StatusPill tone={statusTone(request.status)}>{request.status}</StatusPill>
        </div>
      </summary>
      <div className="mt-4">
        <ReportExportForm mode="update" request={request} />
      </div>
    </details>
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

function formatJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}

const fieldClassName = "min-h-10 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground outline-none ring-primary/20 focus:ring-2";
const primaryButtonClassName = "w-fit rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-primary/90";

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
  { label: "Betalingen", value: "payments" }
];

const exportFormatOptions = [
  { label: "CSV", value: "csv" },
  { label: "XLSX", value: "xlsx" },
  { label: "PDF", value: "pdf" },
  { label: "JSON", value: "json" }
];

const exportStatusOptions = [
  { label: "Aangevraagd", value: "requested" },
  { label: "Bezig", value: "processing" },
  { label: "Klaar", value: "ready" },
  { label: "Mislukt", value: "failed" },
  { label: "Geannuleerd", value: "cancelled" }
];
