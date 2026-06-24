import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
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
  scheduled_at: string | null;
  sent_at: string | null;
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
  available_on: string | null;
  created_at: string;
};

export type ReportExportRequestRow = {
  id: string;
  report_type: string;
  export_format: string;
  status: string;
  filters: Record<string, unknown>;
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
  reportExports: ReportExportRequestRow[];
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

export async function getAdminPhase12Snapshot(): Promise<AdminPhase12Snapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();

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
      .select("id, provider, mode, status, display_name, host, port, from_email, from_name, username_secret_reference, password_secret_reference, api_key_secret_reference")
      .eq("tenant_id", tenantId)
      .order("provider", { ascending: true }),
    supabase
      .from("message_templates")
      .select("id, code, name, channel, audience, subject_template, body_template, status, tags, sort_order")
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("message_outbox")
      .select("id, template_id, channel, provider, recipient_profile_id, recipient_email, participant_id, enrollment_id, subject, body, status, scheduled_at, sent_at, error_message, created_at")
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
      .select("id, participant_id, enrollment_id, certificate_id, title, document_type, visibility, status, storage_bucket, file_path, available_on, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("report_export_requests")
      .select("id, report_type, export_format, status, filters, metadata, file_path, completed_at, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase.from("participants").select("id, display_name, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase.from("enrollments").select("id, participant_id, program_id, status").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("programs").select("id, name").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("certificates").select("id, participant_id, title, status, certificate_number").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("tenant_memberships").select("user_id").eq("tenant_id", tenantId),
    supabase.from("participant_guardians").select("profile_id").eq("tenant_id", tenantId)
  ]);

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
    profiles: profilesResult.error
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
      reportExports: asRows<ReportExportRequestRow>(reportExportsResult.data),
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
    reportExports: [],
    participants: [],
    enrollments: [],
    programs: [],
    profiles: [],
    certificates: []
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}
