import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getReportingDashboardData, normalizeReportFilters, type ReportFilters, type ReportPermissionGrantRow, type ReportingDashboardData } from "@/lib/operations/reporting";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type CommunicationProviderConfigRow = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  display_name: string;
  host: string | null;
  port: number | null;
  from_email: string | null;
  from_name: string | null;
  username_secret_reference: string | null;
  password_secret_reference: string | null;
  api_key_secret_reference: string | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
};

export type MessageTemplateRow = {
  id: string;
  code: string;
  name: string;
  channel: string;
  audience: string;
  subject_template: string | null;
  body_template: string;
  status: string;
  required_variables: string[];
  last_preview_subject: string | null;
  last_preview_body: string | null;
  last_preview_errors: string[];
  last_previewed_at: string | null;
  tags: string[];
  sort_order: number;
};

export type MessageOutboxRow = {
  id: string;
  template_id: string | null;
  channel: string;
  provider: string;
  recipient_profile_id: string | null;
  recipient_email: string | null;
  participant_id: string | null;
  enrollment_id: string | null;
  subject: string | null;
  body: string;
  status: string;
  delivery_status: string;
  retry_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_attempt_at: string | null;
  failure_reason: string | null;
  provider_message_id: string | null;
  event_key: string | null;
  source_table: string | null;
  source_record_id: string | null;
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type OperationalTaskRow = {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  status: string;
  priority: string;
  assigned_to_profile_id: string | null;
  participant_id: string | null;
  enrollment_id: string | null;
  due_on: string | null;
  completed_at: string | null;
  created_at: string;
};

export type TenantDocumentRecordRow = {
  id: string;
  participant_id: string | null;
  enrollment_id: string | null;
  certificate_id: string | null;
  title: string;
  document_type: string;
  visibility: string;
  status: string;
  storage_bucket: string;
  file_path: string | null;
  parent_document_id: string | null;
  version_number: number;
  upload_status: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  original_filename: string | null;
  retention_until: string | null;
  last_downloaded_at: string | null;
  available_on: string | null;
  created_at: string;
};

export type DocumentStorageStatus = {
  bucket: string;
  status: "ready" | "missing" | "error";
  isPrivate: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[];
  message: string | null;
};

export type ReportExportRequestRow = {
  id: string;
  report_type: string;
  export_format: string;
  status: string;
  filters: Record<string, unknown>;
  program_id: string | null;
  stage_id: string | null;
  group_id: string | null;
  instructor_id: string | null;
  status_filter: string | null;
  date_from: string | null;
  date_to: string | null;
  row_count: number | null;
  export_scope: string;
  metadata: Record<string, unknown>;
  file_path: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type OperationsParticipantRow = {
  id: string;
  display_name: string;
  status: string;
};

export type OperationsEnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  status: string;
};

export type OperationsProgramRow = {
  id: string;
  name: string;
};

export type OperationsProfileRow = {
  id: string;
  full_name: string | null;
};

export type OperationsCertificateRow = {
  id: string;
  participant_id: string;
  title: string;
  status: string;
  certificate_number: string | null;
};

export type AdminPhase12Data = {
  providerConfigs: CommunicationProviderConfigRow[];
  messageTemplates: MessageTemplateRow[];
  messageOutbox: MessageOutboxRow[];
  operationalTasks: OperationalTaskRow[];
  documentRecords: TenantDocumentRecordRow[];
  documentStorage: DocumentStorageStatus;
  reportExports: ReportExportRequestRow[];
  reportPermissionGrants: ReportPermissionGrantRow[];
  reporting: ReportingDashboardData;
  participants: OperationsParticipantRow[];
  enrollments: OperationsEnrollmentRow[];
  programs: OperationsProgramRow[];
  profiles: OperationsProfileRow[];
  certificates: OperationsCertificateRow[];
};

export type AdminPhase12Snapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminPhase12Data;
  errors: string[];
};

export async function getAdminPhase12Snapshot(options: { reportFilters?: ReportFilters | Record<string, unknown> } = {}): Promise<AdminPhase12Snapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();
  const reportFilters = isReportFilters(options.reportFilters) ? options.reportFilters : normalizeReportFilters(options.reportFilters);

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor operations."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;
  const [
    providerConfigsResult,
    messageTemplatesResult,
    messageOutboxResult,
    operationalTasksResult,
    documentRecordsResult,
    reportExportsResult,
    participantsResult,
    enrollmentsResult,
    programsResult,
    certificatesResult,
    tenantMembersResult,
    guardiansResult
  ] = await Promise.all([
    supabase
      .from("communication_provider_configs")
      .select("id, provider, mode, status, display_name, host, port, from_email, from_name, username_secret_reference, password_secret_reference, api_key_secret_reference, last_tested_at, last_test_status, last_test_error")
      .eq("tenant_id", tenantId)
      .order("provider", { ascending: true }),
    supabase
      .from("message_templates")
      .select("id, code, name, channel, audience, subject_template, body_template, status, required_variables, last_preview_subject, last_preview_body, last_preview_errors, last_previewed_at, tags, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("message_outbox")
      .select("id, template_id, channel, provider, recipient_profile_id, recipient_email, participant_id, enrollment_id, subject, body, status, delivery_status, retry_count, max_attempts, next_retry_at, last_attempt_at, failure_reason, provider_message_id, event_key, source_table, source_record_id, scheduled_at, sent_at, delivered_at, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("operational_tasks")
      .select("id, title, description, task_type, status, priority, assigned_to_profile_id, participant_id, enrollment_id, due_on, completed_at, created_at")
      .eq("tenant_id", tenantId)
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_document_records")
      .select("id, participant_id, enrollment_id, certificate_id, title, document_type, visibility, status, storage_bucket, file_path, parent_document_id, version_number, upload_status, mime_type, file_size_bytes, original_filename, retention_until, last_downloaded_at, available_on, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_export_requests")
      .select("id, report_type, export_format, status, filters, program_id, stage_id, group_id, instructor_id, status_filter, date_from, date_to, row_count, export_scope, metadata, file_path, completed_at, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase.from("participants").select("id, display_name, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase.from("enrollments").select("id, participant_id, program_id, status").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("programs").select("id, name").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("certificates").select("id, participant_id, title, status, certificate_number").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId),
    supabase.from("participant_guardians").select("profile_id").eq("tenant_id", tenantId)
  ]);
  const documentStorage = await getDocumentStorageStatus();

  const messageOutbox = asRows<MessageOutboxRow>(messageOutboxResult.data);
  const tasks = asRows<OperationalTaskRow>(operationalTasksResult.data);
  const profileIds = unique([
    ...asRows<{ user_id: string }>(tenantMembersResult.data).map((member) => member.user_id),
    ...asRows<{ profile_id: string }>(guardiansResult.data).map((guardian) => guardian.profile_id),
    ...messageOutbox.flatMap((message) => [message.recipient_profile_id].filter(Boolean) as string[]),
    ...tasks.flatMap((task) => [task.assigned_to_profile_id].filter(Boolean) as string[])
  ]);
  const profilesResult =
    profileIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("profiles").select("id, full_name").in("id", profileIds).order("full_name", { ascending: true });
  let reporting = createEmptyReporting(reportFilters);
  let reportingError: { message: string } | null = null;

  try {
    reporting = await getReportingDashboardData(supabase, tenantId, reportFilters);
  } catch (error) {
    reportingError = { message: error instanceof Error ? error.message : "Rapportagequeries mislukt." };
  }

  const errors = collectErrors({
    communication_provider_configs: providerConfigsResult.error,
    message_templates: messageTemplatesResult.error,
    message_outbox: messageOutboxResult.error,
    operational_tasks: operationalTasksResult.error,
    tenant_document_records: documentRecordsResult.error,
    report_export_requests: reportExportsResult.error,
    participants: participantsResult.error,
    enrollments: enrollmentsResult.error,
    programs: programsResult.error,
    certificates: certificatesResult.error,
    tenant_memberships: tenantMembersResult.error,
    participant_guardians: guardiansResult.error,
    profiles: profilesResult.error,
    reporting: reportingError
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      providerConfigs: asRows<CommunicationProviderConfigRow>(providerConfigsResult.data),
      messageTemplates: asRows<MessageTemplateRow>(messageTemplatesResult.data),
      messageOutbox,
      operationalTasks: tasks,
      documentRecords: asRows<TenantDocumentRecordRow>(documentRecordsResult.data),
      documentStorage,
      reportExports: asRows<ReportExportRequestRow>(reportExportsResult.data),
      reportPermissionGrants: reporting.permissions,
      reporting,
      participants: asRows<OperationsParticipantRow>(participantsResult.data),
      enrollments: asRows<OperationsEnrollmentRow>(enrollmentsResult.data),
      programs: asRows<OperationsProgramRow>(programsResult.data),
      profiles: asRows<OperationsProfileRow>(profilesResult.data),
      certificates: asRows<OperationsCertificateRow>(certificatesResult.data)
    }
  };
}

function createEmptyData(): AdminPhase12Data {
  return {
    providerConfigs: [],
    messageTemplates: [],
    messageOutbox: [],
    operationalTasks: [],
    documentRecords: [],
    documentStorage: {
      bucket: "tenant-documents",
      status: "missing",
      isPrivate: true,
      fileSizeLimit: null,
      allowedMimeTypes: [],
      message: "Nog niet gecontroleerd."
    },
    reportExports: [],
    reportPermissionGrants: [],
    reporting: createEmptyReporting(normalizeReportFilters(undefined)),
    participants: [],
    enrollments: [],
    programs: [],
    profiles: [],
    certificates: []
  };
}

function createEmptyReporting(filters: ReportFilters): ReportingDashboardData {
  const emptySection = { summary: {}, rows: [] };

  return {
    filters,
    lookups: {
      programs: [],
      stages: [],
      groups: [],
      instructors: []
    },
    permissions: [],
    occupancy: emptySection,
    waitlist: emptySection,
    progress: emptySection,
    attendance: emptySection,
    payments: emptySection,
    revenue: emptySection,
    auditEvents: []
  };
}

function isReportFilters(value: unknown): value is ReportFilters {
  return Boolean(value && typeof value === "object" && "programId" in value);
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

async function getDocumentStorageStatus(): Promise<DocumentStorageStatus> {
  try {
    const admin = createAdminClient();
    const result = await admin.storage.getBucket("tenant-documents");

    if (result.error || !result.data) {
      return {
        bucket: "tenant-documents",
        status: "missing",
        isPrivate: true,
        fileSizeLimit: null,
        allowedMimeTypes: [],
        message: result.error?.message ?? "Bucket tenant-documents bestaat nog niet."
      };
    }

    return {
      bucket: result.data.name,
      status: result.data.public ? "error" : "ready",
      isPrivate: !result.data.public,
      fileSizeLimit: result.data.file_size_limit ?? null,
      allowedMimeTypes: result.data.allowed_mime_types ?? [],
      message: result.data.public ? "Bucket moet private zijn voor documentkluis." : null
    };
  } catch (error) {
    return {
      bucket: "tenant-documents",
      status: "error",
      isPrivate: true,
      fileSizeLimit: null,
      allowedMimeTypes: [],
      message: error instanceof Error ? error.message : "Bucketcheck mislukt."
    };
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}
