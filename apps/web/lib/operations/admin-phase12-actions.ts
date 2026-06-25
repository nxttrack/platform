"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { extractTemplateVariables, prepareEmailEnvelope, renderTemplate, validateTemplateVariables, type EmailProvider } from "@/lib/communication/email-adapter";
import { sendLiveEmail, type LiveSmtpSettings } from "@/lib/communication/live-email";
import { buildReportRows as buildReportingRows, canRoleExportReport, normalizeReportFilters, normalizeReportType, reportFilterColumns, reportFiltersToJson } from "@/lib/operations/reporting";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;
const documentBucket = "tenant-documents";
const maxDocumentUploadBytes = 10 * 1024 * 1024;
const allowedDocumentMimeTypes = ["application/pdf", "image/png", "image/jpeg", "text/csv", "application/json", "text/plain"] as const;
const helpdeskStatuses = ["new", "open", "waiting_for_parent", "waiting_internal", "resolved", "closed"] as const;
const helpdeskPriorities = ["low", "normal", "high", "urgent"] as const;
const helpdeskVisibilities = ["public_to_parent", "internal"] as const;

type MessageTemplateForSend = {
  id: string;
  subject_template: string | null;
  body_template: string;
  required_variables: string[] | null;
};

type MessageOutboxForDispatch = {
  id: string;
  channel: string;
  provider: EmailProvider;
  recipient_email: string | null;
  subject: string | null;
  body: string;
  retry_count: number | null;
  max_attempts: number | null;
};

type CommunicationProviderConfigForDispatch = {
  provider: string;
  mode: string;
  status: string;
  host: string | null;
  port: number | null;
  from_email: string | null;
  from_name: string | null;
  username_secret_reference: string | null;
  password_secret_reference: string | null;
  api_key_secret_reference: string | null;
};

type MessageRecipient = {
  recipient_profile_id: string | null;
  recipient_email: string | null;
  participant_id: string | null;
  label: string;
};

type TenantDocumentForSync = {
  id: string;
  tenant_id: string;
  participant_id: string | null;
  enrollment_id: string | null;
  certificate_id: string | null;
  parent_document_id: string | null;
  title: string;
  document_type: string;
  visibility: string;
  status: string;
  storage_bucket: string;
  file_path: string | null;
  available_on: string | null;
};

type TenantSupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function updateCommunicationProviderConfigAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("communication_provider_configs")
      .update({
        status: enumValue(formData, "status", ["disabled", "configured", "active"], "configured"),
        display_name: requiredString(formData, "display_name"),
        host: optionalString(formData, "host"),
        port: optionalInt(formData, "port"),
        from_email: optionalString(formData, "from_email"),
        from_name: optionalString(formData, "from_name"),
        username_secret_reference: optionalString(formData, "username_secret_reference"),
        password_secret_reference: optionalString(formData, "password_secret_reference"),
        api_key_secret_reference: optionalString(formData, "api_key_secret_reference"),
        metadata: { phase: "phase12", updated_via: "tenant_admin" }
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function runMessageDispatchWorkerAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const limit = intValue(formData, "limit", 10, 1, 50);
  const dueNow = new Date().toISOString();
  const outboxResult = await supabase
    .from("message_outbox")
    .select("id, channel, provider, recipient_email, subject, body, retry_count, max_attempts")
    .eq("tenant_id", tenantId)
    .in("status", ["queued", "retrying"])
    .or(`scheduled_at.is.null,scheduled_at.lte.${dueNow}`)
    .or(`next_retry_at.is.null,next_retry_at.lte.${dueNow}`)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (outboxResult.error) {
    throw new Error(outboxResult.error.message);
  }

  const messages = (outboxResult.data ?? []) as MessageOutboxForDispatch[];
  const providerConfigsResult = await supabase
    .from("communication_provider_configs")
    .select("provider, mode, status, host, port, from_email, from_name, username_secret_reference, password_secret_reference, api_key_secret_reference")
    .eq("tenant_id", tenantId);

  if (providerConfigsResult.error) {
    throw new Error(providerConfigsResult.error.message);
  }

  const providerConfigs = (providerConfigsResult.data ?? []) as CommunicationProviderConfigForDispatch[];

  for (const message of messages) {
    await dispatchMessage(supabase, tenantId, message, providerConfigs);
  }

  revalidatePhase12();
}

export async function retryMessageAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const resetAttempts = boolValue(formData, "reset_attempts");

  await throwOnError(
    supabase
      .from("message_outbox")
      .update({
        status: "queued",
        delivery_status: "pending",
        ...(resetAttempts ? { retry_count: 0 } : {}),
        next_retry_at: null,
        failure_reason: null,
        error_message: null
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function cancelMessageAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("message_outbox")
      .update({
        status: "cancelled",
        delivery_status: "cancelled",
        failure_reason: optionalString(formData, "reason") ?? "Handmatig geannuleerd."
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function createMessageTemplateAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const name = requiredString(formData, "name");
  const subjectTemplate = optionalString(formData, "subject_template");
  const bodyTemplate = requiredString(formData, "body_template");
  const requiredVariables = uniqueStrings([...listValue(formData, "required_variables"), ...extractTemplateVariables(subjectTemplate, bodyTemplate)]);

  await throwOnError(
    supabase.from("message_templates").insert({
      tenant_id: tenantId,
      code: optionalCode(formData, "code", name),
      name,
      channel: enumValue(formData, "channel", ["email", "in_app"], "email"),
      audience: enumValue(formData, "audience", ["parent", "instructor", "tenant_admin", "all"], "parent"),
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      status: enumValue(formData, "status", ["draft", "active", "archived"], "draft"),
      required_variables: requiredVariables,
      tags: listValue(formData, "tags"),
      sort_order: intValue(formData, "sort_order", 0),
      created_by_profile_id: profileId,
      metadata: { phase: "phase12" }
    })
  );

  revalidatePhase12();
}

export async function updateMessageTemplateAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const name = requiredString(formData, "name");
  const subjectTemplate = optionalString(formData, "subject_template");
  const bodyTemplate = requiredString(formData, "body_template");
  const requiredVariables = uniqueStrings([...listValue(formData, "required_variables"), ...extractTemplateVariables(subjectTemplate, bodyTemplate)]);

  await throwOnError(
    supabase
      .from("message_templates")
      .update({
        code: optionalCode(formData, "code", name),
        name,
        channel: enumValue(formData, "channel", ["email", "in_app"], "email"),
        audience: enumValue(formData, "audience", ["parent", "instructor", "tenant_admin", "all"], "parent"),
        subject_template: subjectTemplate,
        body_template: bodyTemplate,
        status: enumValue(formData, "status", ["draft", "active", "archived"], "draft"),
        required_variables: requiredVariables,
        tags: listValue(formData, "tags"),
        sort_order: intValue(formData, "sort_order", 0)
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function previewMessageTemplateAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const templateId = requiredString(formData, "id");
  const context = jsonObjectValue(formData, "preview_context");

  const templateResult = await supabase
    .from("message_templates")
    .select("id, subject_template, body_template, required_variables")
    .eq("tenant_id", tenantId)
    .eq("id", templateId)
    .single();

  if (templateResult.error || !templateResult.data) {
    throw new Error(templateResult.error?.message ?? "Template niet gevonden.");
  }

  const template = templateResult.data as MessageTemplateForSend;
  const variables = uniqueStrings([...(template.required_variables ?? []), ...extractTemplateVariables(template.subject_template, template.body_template)]);
  const validationErrors = validateTemplateVariables(variables, context);

  await throwOnError(
    supabase
      .from("message_templates")
      .update({
        required_variables: variables,
        last_preview_context: context,
        last_preview_subject: validationErrors.length === 0 ? renderTemplate(template.subject_template, context) : null,
        last_preview_body: validationErrors.length === 0 ? renderTemplate(template.body_template, context) : null,
        last_preview_errors: validationErrors,
        last_previewed_at: new Date().toISOString()
      })
      .eq("id", templateId)
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function queueMessageAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const templateId = optionalString(formData, "template_id");
  const channel = enumValue(formData, "channel", ["email", "in_app"], "email");
  const provider = enumValue(formData, "provider", ["smtp", "sendgrid", "internal"], channel === "email" ? "smtp" : "internal") as EmailProvider;
  const requestedStatus = enumValue(formData, "status", ["draft", "queued"], "draft");
  const recipientProfileId = optionalString(formData, "recipient_profile_id");
  const recipientEmail = optionalString(formData, "recipient_email");
  const targetKind = enumValue(formData, "target_kind", ["direct", "participant_guardians", "group_guardians", "instructor", "all_instructors", "all_parents"], "direct");
  const renderContext = jsonObjectValue(formData, "render_context");
  let subject = optionalString(formData, "subject");
  let body = optionalString(formData, "body");
  let templateVariables: string[] = [];
  let validationErrors: string[] = [];

  if (templateId && (!subject || !body)) {
    const templateResult = await supabase
      .from("message_templates")
      .select("subject_template, body_template, required_variables")
      .eq("tenant_id", tenantId)
      .eq("id", templateId)
      .single();

    if (templateResult.error || !templateResult.data) {
      throw new Error(templateResult.error?.message ?? "Template niet gevonden.");
    }

    const template = templateResult.data as MessageTemplateForSend;
    templateVariables = uniqueStrings([...(template.required_variables ?? []), ...extractTemplateVariables(template.subject_template, template.body_template)]);
    validationErrors = validateTemplateVariables(templateVariables, renderContext);
    subject = subject ?? renderTemplate(template.subject_template, renderContext);
    body = body ?? renderTemplate(template.body_template, renderContext);
  }

  if (!body) {
    throw new Error("Berichttekst is verplicht.");
  }

  if (validationErrors.length > 0) {
    throw new Error(`Ontbrekende templatevariabelen: ${validationErrors.join(", ")}.`);
  }

  const prepared = prepareEmailEnvelope(provider, requestedStatus);
  const recipients = await resolveMessageRecipients(supabase, tenantId, formData, {
    targetKind,
    recipientProfileId,
    recipientEmail
  });

  if (recipients.length === 0) {
    throw new Error("Geen ontvangers gevonden voor deze selectie.");
  }

  const deliverableRecipients = channel === "email" ? recipients.filter((recipient) => recipient.recipient_email) : recipients;

  if (deliverableRecipients.length === 0) {
    throw new Error("Geen ontvangers met e-mailadres gevonden voor e-mail.");
  }

  await throwOnError(
    supabase.from("message_outbox").insert(
      deliverableRecipients.map((recipient) => ({
      tenant_id: tenantId,
      template_id: templateId,
      channel,
      provider,
      recipient_profile_id: recipient.recipient_profile_id,
      recipient_email: recipient.recipient_email,
      participant_id: recipient.participant_id,
      enrollment_id: optionalString(formData, "enrollment_id"),
      subject,
      body,
      status: prepared.dispatchStatus,
      delivery_status: prepared.dispatchStatus === "queued" ? "pending" : "prepared",
      scheduled_at: optionalDateTime(formData, "scheduled_at"),
      render_context: renderContext,
      template_variables: templateVariables,
      validation_errors: validationErrors,
      created_by_profile_id: profileId,
      metadata: {
        phase: "phase12",
        email_foundation: prepared,
        target_kind: targetKind,
        recipient_label: recipient.label,
        requested_recipients: recipients.length
      }
    }))
    )
  );

  revalidatePhase12();
}

export async function createOperationalTaskAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("operational_tasks").insert({
      tenant_id: tenantId,
      title: requiredString(formData, "title"),
      description: optionalString(formData, "description"),
      task_type: enumValue(formData, "task_type", ["general", "planning", "placement", "payment", "document", "follow_up"], "general"),
      status: enumValue(formData, "status", ["open", "in_progress", "done", "cancelled"], "open"),
      priority: enumValue(formData, "priority", ["low", "normal", "high", "urgent"], "normal"),
      assigned_to_profile_id: optionalString(formData, "assigned_to_profile_id"),
      participant_id: optionalString(formData, "participant_id"),
      enrollment_id: optionalString(formData, "enrollment_id"),
      due_on: optionalDate(formData, "due_on"),
      created_by_profile_id: profileId,
      metadata: { phase: "phase12" }
    })
  );

  revalidatePhase12();
}

export async function updateOperationalTaskAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const status = enumValue(formData, "status", ["open", "in_progress", "done", "cancelled"], "open");

  await throwOnError(
    supabase
      .from("operational_tasks")
      .update({
        title: requiredString(formData, "title"),
        description: optionalString(formData, "description"),
        task_type: enumValue(formData, "task_type", ["general", "planning", "placement", "payment", "document", "follow_up"], "general"),
        status,
        priority: enumValue(formData, "priority", ["low", "normal", "high", "urgent"], "normal"),
        assigned_to_profile_id: optionalString(formData, "assigned_to_profile_id"),
        participant_id: optionalString(formData, "participant_id"),
        enrollment_id: optionalString(formData, "enrollment_id"),
        due_on: optionalDate(formData, "due_on"),
        completed_at: status === "done" ? new Date().toISOString() : null
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function updateHelpdeskTicketAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
      .from("helpdesk_tickets")
      .update({
        status: enumValue(formData, "status", helpdeskStatuses, "open"),
        priority: enumValue(formData, "priority", helpdeskPriorities, "normal"),
        assigned_to: optionalString(formData, "assigned_to")
      })
      .eq("tenant_id", tenantId)
      .eq("id", requiredString(formData, "ticket_id"))
  );

  revalidatePhase12();
}

export async function addHelpdeskTicketMessageAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const ticketId = requiredString(formData, "ticket_id");
  const visibility = enumValue(formData, "visibility", helpdeskVisibilities, "public_to_parent");
  const nextStatus = enumValue(formData, "next_status", helpdeskStatuses, visibility === "public_to_parent" ? "waiting_for_parent" : "waiting_internal");

  await throwOnError(
    supabase.from("helpdesk_ticket_messages").insert({
      tenant_id: tenantId,
      ticket_id: ticketId,
      author_profile_id: profileId,
      author_type: "admin",
      message: requiredString(formData, "message"),
      visibility
    })
  );

  await throwOnError(
    supabase
      .from("helpdesk_tickets")
      .update({ status: nextStatus })
      .eq("tenant_id", tenantId)
      .eq("id", ticketId)
  );

  if (visibility === "public_to_parent") {
    await notifyGuardianAboutHelpdeskReply(tenantId, ticketId);
  }

  revalidatePhase12();
}

export async function createTenantDocumentRecordAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("tenant_document_records").insert({
      tenant_id: tenantId,
      participant_id: optionalString(formData, "participant_id"),
      enrollment_id: optionalString(formData, "enrollment_id"),
      certificate_id: optionalString(formData, "certificate_id"),
      title: requiredString(formData, "title"),
      document_type: enumValue(formData, "document_type", ["document", "policy", "invoice_notice", "certificate", "diploma", "internal_note"], "document"),
      visibility: enumValue(formData, "visibility", ["staff", "parent", "instructor", "all"], "staff"),
      status: enumValue(formData, "status", ["draft", "available", "archived"], "draft"),
      storage_bucket: optionalString(formData, "storage_bucket") ?? "tenant-documents",
      file_path: optionalString(formData, "file_path"),
      available_on: optionalDate(formData, "available_on"),
      retention_until: optionalDate(formData, "retention_until"),
      created_by_profile_id: profileId,
      metadata: { phase: "phase12", storage: "prepared" }
    })
  );

  revalidatePhase12();
}

export async function uploadTenantDocumentAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const documentId = requiredString(formData, "id");
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Kies een bestand om te uploaden.");
  }

  const documentResult = await supabase
    .from("tenant_document_records")
    .select("id, tenant_id, participant_id, enrollment_id, certificate_id, parent_document_id, title, document_type, visibility, status, storage_bucket, file_path, available_on, version_number")
    .eq("tenant_id", tenantId)
    .eq("id", documentId)
    .single();

  if (documentResult.error || !documentResult.data) {
    throw new Error(documentResult.error?.message ?? "Documentrecord niet gevonden.");
  }

  const current = documentResult.data as TenantDocumentForSync & { version_number: number | null };
  const nextVersion = current.file_path ? (current.version_number ?? 1) + 1 : Math.max(1, current.version_number ?? 1);
  const filename = safeFileName(file.name);
  const filePath = `${tenantId}/${documentId}/v${nextVersion}/${filename}`;
  const admin = createAdminClient();
  await assertDocumentBucketReady(admin, file);
  const uploadResult = await admin.storage.from(documentBucket).upload(filePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: true
  });

  if (uploadResult.error) {
    await supabase
      .from("tenant_document_records")
      .update({ upload_status: "failed", metadata: { phase: "sprint5", upload_error: uploadResult.error.message } })
      .eq("tenant_id", tenantId)
      .eq("id", documentId);
    throw new Error(uploadResult.error.message);
  }

  const updatedResult = await supabase
    .from("tenant_document_records")
    .update({
      storage_bucket: documentBucket,
      file_path: filePath,
      original_filename: filename,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      version_number: nextVersion,
      upload_status: "uploaded",
      status: current.status === "draft" ? "available" : current.status,
      metadata: { phase: "sprint5", storage: "uploaded" }
    })
    .eq("tenant_id", tenantId)
    .eq("id", documentId)
    .select("id, tenant_id, participant_id, enrollment_id, certificate_id, parent_document_id, title, document_type, visibility, status, storage_bucket, file_path, available_on")
    .single();

  if (updatedResult.error || !updatedResult.data) {
    throw new Error(updatedResult.error?.message ?? "Documentrecord kon niet worden bijgewerkt.");
  }

  const parentDocumentId = await syncParentDocumentVisibility(supabase, updatedResult.data as TenantDocumentForSync);
  await logDocumentAccessEvent({
    tenantId,
    tenantDocumentId: documentId,
    parentDocumentId,
    participantId: current.participant_id,
    actorProfileId: profileId,
    eventType: "upload",
    metadata: {
      file_path: filePath,
      original_filename: filename,
      mime_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      version_number: nextVersion
    }
  });
  revalidatePhase12();
}

export async function updateTenantDocumentRecordAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();

  const result = await supabase
    .from("tenant_document_records")
    .update({
      participant_id: optionalString(formData, "participant_id"),
      enrollment_id: optionalString(formData, "enrollment_id"),
      certificate_id: optionalString(formData, "certificate_id"),
      title: requiredString(formData, "title"),
      document_type: enumValue(formData, "document_type", ["document", "policy", "invoice_notice", "certificate", "diploma", "internal_note"], "document"),
      visibility: enumValue(formData, "visibility", ["staff", "parent", "instructor", "all"], "staff"),
      status: enumValue(formData, "status", ["draft", "available", "archived"], "draft"),
      storage_bucket: optionalString(formData, "storage_bucket") ?? "tenant-documents",
      file_path: optionalString(formData, "file_path"),
      available_on: optionalDate(formData, "available_on"),
      retention_until: optionalDate(formData, "retention_until")
    })
    .eq("id", requiredString(formData, "id"))
    .eq("tenant_id", tenantId)
    .select("id, tenant_id, participant_id, enrollment_id, certificate_id, parent_document_id, title, document_type, visibility, status, storage_bucket, file_path, available_on")
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Documentrecord kon niet worden bijgewerkt.");
  }

  const syncedDocument = result.data as TenantDocumentForSync;
  const parentDocumentId = await syncParentDocumentVisibility(supabase, syncedDocument);
  await logDocumentAccessEvent({
    tenantId,
    tenantDocumentId: syncedDocument.id,
    parentDocumentId,
    participantId: syncedDocument.participant_id,
    actorProfileId: profileId,
    eventType: "visibility_synced",
    metadata: {
      visibility: syncedDocument.visibility,
      status: syncedDocument.status,
      file_path: syncedDocument.file_path,
      retention_until: optionalDate(formData, "retention_until")
    }
  });

  revalidatePhase12();
}

export async function createReportExportRequestAction(formData: FormData) {
  const { supabase, tenantId, profileId, roles } = await requireTenantWriter();
  const reportType = normalizeReportType(optionalString(formData, "report_type"));
  const filters = normalizeReportFilters({ ...jsonObjectValue(formData, "filters"), ...formDataToReportFilterObject(formData) });
  await requireReportExportPermission(supabase, tenantId, roles, reportType);

  await throwOnError(
    supabase.from("report_export_requests").insert({
      tenant_id: tenantId,
      report_type: reportType,
      export_format: enumValue(formData, "export_format", ["csv", "xlsx", "json"], "csv"),
      status: enumValue(formData, "status", ["requested", "processing", "ready", "failed", "cancelled"], "requested"),
      filters: reportFiltersToJson(filters),
      ...reportFilterColumns(filters),
      export_scope: roles.includes("instructor") && !roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)) ? "instructor" : "tenant_admin",
      file_path: optionalString(formData, "file_path"),
      requested_by_profile_id: profileId,
      metadata: { phase: "reporting", export_worker: "query_backed" }
    })
  );

  revalidatePhase12();
}

export async function updateReportExportRequestAction(formData: FormData) {
  const { supabase, tenantId, roles } = await requireTenantWriter();
  const status = enumValue(formData, "status", ["requested", "processing", "ready", "failed", "cancelled"], "requested");
  const reportType = normalizeReportType(optionalString(formData, "report_type"));
  const filters = normalizeReportFilters({ ...jsonObjectValue(formData, "filters"), ...formDataToReportFilterObject(formData) });
  await requireReportExportPermission(supabase, tenantId, roles, reportType);

  await throwOnError(
    supabase
      .from("report_export_requests")
      .update({
        report_type: reportType,
        export_format: enumValue(formData, "export_format", ["csv", "xlsx", "json"], "csv"),
        status,
        filters: reportFiltersToJson(filters),
        ...reportFilterColumns(filters),
        file_path: optionalString(formData, "file_path"),
        completed_at: status === "ready" ? new Date().toISOString() : null,
        error_message: optionalString(formData, "error_message"),
        metadata: { phase: "reporting", export_worker: "query_backed" }
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function generateReportExportAction(formData: FormData) {
  const { supabase, tenantId, roles } = await requireTenantWriter();
  const requestId = requiredString(formData, "id");
  const requestResult = await supabase
    .from("report_export_requests")
    .select("id, report_type, export_format, filters, program_id, stage_id, group_id, instructor_id, status_filter, date_from, date_to")
    .eq("tenant_id", tenantId)
    .eq("id", requestId)
    .single();

  if (requestResult.error || !requestResult.data) {
    throw new Error(requestResult.error?.message ?? "Exportaanvraag niet gevonden.");
  }

  await supabase.from("report_export_requests").update({ status: "processing", error_message: null }).eq("tenant_id", tenantId).eq("id", requestId);

  try {
    const request = requestResult.data as {
      id: string;
      report_type: string;
      export_format: string;
      filters: Record<string, unknown>;
      program_id: string | null;
      stage_id: string | null;
      group_id: string | null;
      instructor_id: string | null;
      status_filter: string | null;
      date_from: string | null;
      date_to: string | null;
    };
    const reportType = normalizeReportType(request.report_type);
    const filters = normalizeReportFilters({
      ...(request.filters ?? {}),
      program_id: request.program_id,
      stage_id: request.stage_id,
      group_id: request.group_id,
      instructor_id: request.instructor_id,
      status_filter: request.status_filter,
      date_from: request.date_from,
      date_to: request.date_to
    });
    await requireReportExportPermission(supabase, tenantId, roles, reportType);
    const rows = await buildReportingRows(supabase, tenantId, reportType, filters);
    const generated = buildReportFile(rows, request.export_format);
    const filePath = `${tenantId}/reports/${request.report_type}-${request.id}.${generated.extension}`;
    const admin = createAdminClient();
    const uploadResult = await admin.storage.from(documentBucket).upload(filePath, new Blob([generated.body], { type: generated.contentType }), {
      contentType: generated.contentType,
      upsert: true
    });

    if (uploadResult.error) {
      throw new Error(uploadResult.error.message);
    }

    await throwOnError(
      supabase
        .from("report_export_requests")
        .update({
          status: "ready",
          file_path: filePath,
          row_count: rows.length,
          completed_at: new Date().toISOString(),
          error_message: null,
          metadata: {
            phase: "reporting",
            row_count: rows.length,
            requested_format: request.export_format,
            generated_format: generated.generatedFormat,
            filters: reportFiltersToJson(filters)
          }
        })
        .eq("tenant_id", tenantId)
        .eq("id", requestId)
    );
  } catch (error) {
    await supabase
      .from("report_export_requests")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Export genereren mislukt.",
        metadata: { phase: "sprint5", failure: "export_generation" }
      })
      .eq("tenant_id", tenantId)
      .eq("id", requestId);
    throw error;
  }

  revalidatePhase12();
}

export async function upsertReportPermissionGrantAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAdmin();

  await throwOnError(
    supabase.from("report_permission_grants").upsert(
      {
        tenant_id: tenantId,
        report_key: enumValue(formData, "report_key", ["occupancy", "waitlist", "progress", "attendance", "payments", "revenue", "exports"], "occupancy"),
        role: enumValue(formData, "role", ["tenant_owner", "tenant_admin", "tenant_staff", "instructor"], "tenant_staff"),
        can_view: boolValue(formData, "can_view"),
        can_export: boolValue(formData, "can_export"),
        created_by_profile_id: profileId,
        metadata: { phase: "reporting", source: "tenant_admin" }
      },
      { onConflict: "tenant_id,report_key,role" }
    )
  );

  revalidatePhase12();
}

async function dispatchMessage(supabase: TenantSupabaseClient, tenantId: string, message: MessageOutboxForDispatch, providerConfigs: CommunicationProviderConfigForDispatch[]) {
  if (message.channel !== "email") {
    await throwOnError(
      supabase
        .from("message_outbox")
        .update({
          status: "sent",
          delivery_status: "skipped",
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
          failure_reason: "In-app bericht is zonder externe provider gemarkeerd als verwerkt."
        })
        .eq("tenant_id", tenantId)
        .eq("id", message.id)
    );
    return;
  }

  if (!message.recipient_email) {
    await markDispatchFailed(supabase, tenantId, message, "Geen ontvanger e-mailadres gevonden.");
    return;
  }

  const provider = message.provider === "sendgrid" ? "sendgrid" : "smtp";
  const settings = toLiveSmtpSettings(selectProviderConfig(providerConfigs, provider));

  await supabase
    .from("message_outbox")
    .update({ status: "sending", delivery_status: "sending", last_attempt_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", message.id);

  try {
    const delivery = await sendLiveEmail(
      {
        to: message.recipient_email,
        subject: message.subject ?? "NXTTRACK bericht",
        text: message.body
      },
      { provider, smtpSettings: settings }
    );

    await throwOnError(
      supabase
        .from("message_outbox")
        .update({
          status: "sent",
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          delivered_at: new Date().toISOString(),
          provider: delivery.provider,
          provider_message_id: delivery.messageId,
          failure_reason: null,
          error_message: null,
          next_retry_at: null
        })
        .eq("tenant_id", tenantId)
        .eq("id", message.id)
    );
  } catch (error) {
    await markDispatchFailed(supabase, tenantId, message, error instanceof Error ? error.message : "Verzending mislukt.");
  }
}

async function markDispatchFailed(supabase: TenantSupabaseClient, tenantId: string, message: MessageOutboxForDispatch, reason: string) {
  const nextRetryCount = (message.retry_count ?? 0) + 1;
  const maxAttempts = message.max_attempts ?? 3;
  const retryable = nextRetryCount < maxAttempts;

  await throwOnError(
    supabase
      .from("message_outbox")
      .update({
        status: retryable ? "retrying" : "failed",
        delivery_status: "failed",
        retry_count: nextRetryCount,
        next_retry_at: retryable ? new Date(Date.now() + nextRetryCount * 15 * 60 * 1000).toISOString() : null,
        failure_reason: reason,
        error_message: reason,
        last_attempt_at: new Date().toISOString()
      })
      .eq("tenant_id", tenantId)
      .eq("id", message.id)
  );
}

async function resolveMessageRecipients(
  supabase: TenantSupabaseClient,
  tenantId: string,
  formData: FormData,
  input: {
    targetKind: string;
    recipientProfileId: string | null;
    recipientEmail: string | null;
  }
): Promise<MessageRecipient[]> {
  if (input.targetKind === "direct") {
    return uniqueRecipients([
      {
        recipient_profile_id: input.recipientProfileId,
        recipient_email: input.recipientEmail,
        participant_id: optionalString(formData, "participant_id"),
        label: input.recipientEmail ?? input.recipientProfileId ?? "direct"
      }
    ]);
  }

  if (input.targetKind === "participant_guardians") {
    const participantId = requiredString(formData, "participant_id");
    return getGuardianRecipients(supabase, tenantId, [participantId]);
  }

  if (input.targetKind === "group_guardians") {
    const groupId = requiredString(formData, "group_id");
    const membershipsResult = await supabase
      .from("group_memberships")
      .select("enrollment_id")
      .eq("tenant_id", tenantId)
      .eq("group_id", groupId)
      .in("status", ["planned", "active"]);

    if (membershipsResult.error) {
      throw new Error(membershipsResult.error.message);
    }

    const enrollmentIds = uniqueStrings((membershipsResult.data ?? []).map((membership) => membership.enrollment_id).filter(Boolean));

    if (enrollmentIds.length === 0) {
      return [];
    }

    const enrollmentsResult = await supabase.from("enrollments").select("participant_id").eq("tenant_id", tenantId).in("id", enrollmentIds);

    if (enrollmentsResult.error) {
      throw new Error(enrollmentsResult.error.message);
    }

    const participantIds = uniqueStrings((enrollmentsResult.data ?? []).map((enrollment) => enrollment.participant_id).filter(Boolean));
    return getGuardianRecipients(supabase, tenantId, participantIds);
  }

  if (input.targetKind === "instructor") {
    const instructorId = requiredString(formData, "instructor_id");
    const instructorResult = await supabase.from("instructors").select("profile_id, display_name, email").eq("tenant_id", tenantId).eq("id", instructorId).single();

    if (instructorResult.error || !instructorResult.data) {
      throw new Error(instructorResult.error?.message ?? "Instructeur niet gevonden.");
    }

    return uniqueRecipients([
      {
        recipient_profile_id: instructorResult.data.profile_id,
        recipient_email: instructorResult.data.email,
        participant_id: null,
        label: instructorResult.data.display_name ?? instructorResult.data.email ?? "instructeur"
      }
    ]);
  }

  if (input.targetKind === "all_instructors") {
    const instructorsResult = await supabase.from("instructors").select("profile_id, display_name, email").eq("tenant_id", tenantId).eq("status", "active");

    if (instructorsResult.error) {
      throw new Error(instructorsResult.error.message);
    }

    return uniqueRecipients(
      (instructorsResult.data ?? []).map((instructor) => ({
        recipient_profile_id: instructor.profile_id,
        recipient_email: instructor.email,
        participant_id: null,
        label: instructor.display_name ?? instructor.email ?? "instructeur"
      }))
    );
  }

  if (input.targetKind === "all_parents") {
    return getGuardianRecipients(supabase, tenantId, null);
  }

  return [];
}

async function getGuardianRecipients(supabase: TenantSupabaseClient, tenantId: string, participantIds: string[] | null): Promise<MessageRecipient[]> {
  let query = supabase.from("participant_guardians").select("participant_id, profile_id, display_name, email").eq("tenant_id", tenantId).eq("status", "active");

  if (participantIds) {
    if (participantIds.length === 0) {
      return [];
    }

    query = query.in("participant_id", participantIds);
  }

  const guardiansResult = await query;

  if (guardiansResult.error) {
    throw new Error(guardiansResult.error.message);
  }

  return uniqueRecipients(
    (guardiansResult.data ?? []).map((guardian) => ({
      recipient_profile_id: guardian.profile_id,
      recipient_email: guardian.email,
      participant_id: guardian.participant_id,
      label: guardian.display_name ?? guardian.email ?? "ouder"
    }))
  );
}

function uniqueRecipients(recipients: MessageRecipient[]) {
  const seen = new Set<string>();

  return recipients.filter((recipient) => {
    const key = recipient.recipient_email ? `email:${recipient.recipient_email.toLowerCase()}` : recipient.recipient_profile_id ? `profile:${recipient.recipient_profile_id}` : "";

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function toLiveSmtpSettings(provider: CommunicationProviderConfigForDispatch | undefined): LiveSmtpSettings | null {
  if (!provider || provider.status === "disabled") {
    return null;
  }

  return {
    status: provider.status,
    provider: provider.provider === "sendgrid" ? "sendgrid" : "smtp",
    host: provider.host,
    port: provider.port,
    secure: provider.port === 465,
    from_email: provider.from_email,
    from_name: provider.from_name,
    reply_to_email: provider.from_email,
    username_secret_reference: provider.username_secret_reference,
    password_secret_reference: provider.password_secret_reference,
    api_key_secret_reference: provider.api_key_secret_reference
  };
}

function selectProviderConfig(providerConfigs: CommunicationProviderConfigForDispatch[], provider: "smtp" | "sendgrid") {
  return (
    providerConfigs.find((config) => config.provider === provider && config.mode === "live" && config.status !== "disabled") ??
    providerConfigs.find((config) => config.provider === provider && config.status !== "disabled") ??
    providerConfigs.find((config) => config.provider === provider)
  );
}

async function syncParentDocumentVisibility(supabase: TenantSupabaseClient, document: TenantDocumentForSync) {
  const parentVisible = ["parent", "all"].includes(document.visibility) && document.participant_id && document.status === "available";

  if (!parentVisible) {
    if (document.parent_document_id) {
      await supabase
        .from("parent_documents")
        .update({
          status: "archived",
          share_enabled: false,
          share_token: null,
          share_revoked_at: new Date().toISOString()
        })
        .eq("tenant_id", document.tenant_id)
        .eq("id", document.parent_document_id);
    }

    return document.parent_document_id ?? null;
  }

  const payload = {
    tenant_id: document.tenant_id,
    participant_id: document.participant_id,
    enrollment_id: document.enrollment_id,
    certificate_id: document.certificate_id,
    title: document.title,
    document_type: normalizeParentDocumentType(document.document_type),
    status: "available",
    file_path: document.file_path,
    available_on: document.available_on
  };

  let parentDocumentId = document.parent_document_id;

  if (parentDocumentId) {
    await throwOnError(supabase.from("parent_documents").update(payload).eq("tenant_id", document.tenant_id).eq("id", parentDocumentId));
  } else {
    const insertResult = await supabase.from("parent_documents").insert(payload).select("id").single();

    if (insertResult.error || !insertResult.data) {
      throw new Error(insertResult.error?.message ?? "Ouderdocument kon niet worden aangemaakt.");
    }

    parentDocumentId = insertResult.data.id as string;
    await throwOnError(supabase.from("tenant_document_records").update({ parent_document_id: parentDocumentId }).eq("tenant_id", document.tenant_id).eq("id", document.id));
  }

  const guardiansResult = await supabase
    .from("participant_guardians")
    .select("profile_id")
    .eq("tenant_id", document.tenant_id)
    .eq("participant_id", document.participant_id)
    .eq("status", "active");

  if (guardiansResult.error) {
    throw new Error(guardiansResult.error.message);
  }

  const notifications = (guardiansResult.data ?? []).map((guardian) => ({
    tenant_id: document.tenant_id,
    recipient_profile_id: guardian.profile_id,
    participant_id: document.participant_id,
    enrollment_id: document.enrollment_id,
    title: "Nieuw document beschikbaar",
    body: document.title,
    notification_type: "document",
    status: "unread"
  }));

  if (notifications.length > 0) {
    await throwOnError(supabase.from("parent_notifications").insert(notifications));
  }

  return parentDocumentId;
}

async function assertDocumentBucketReady(admin: ReturnType<typeof createAdminClient>, file: File) {
  if (file.size > maxDocumentUploadBytes) {
    throw new Error("Document is groter dan 10 MB.");
  }

  const mimeType = file.type || "application/octet-stream";

  if (!allowedDocumentMimeTypes.includes(mimeType as (typeof allowedDocumentMimeTypes)[number])) {
    throw new Error(`Bestandstype ${mimeType} is niet toegestaan voor de documentkluis.`);
  }

  const bucketResult = await admin.storage.getBucket(documentBucket);

  if (bucketResult.error || !bucketResult.data) {
    throw new Error(`Supabase Storage bucket ${documentBucket} is niet beschikbaar: ${bucketResult.error?.message ?? "bucket ontbreekt"}.`);
  }

  if (bucketResult.data.public) {
    throw new Error(`Supabase Storage bucket ${documentBucket} moet private zijn.`);
  }
}

async function logDocumentAccessEvent({
  actorProfileId,
  eventType,
  metadata,
  parentDocumentId,
  participantId,
  tenantDocumentId,
  tenantId
}: {
  actorProfileId: string | null;
  eventType: "upload" | "download" | "share_link_created" | "share_link_revoked" | "visibility_synced";
  metadata?: Record<string, unknown>;
  parentDocumentId?: string | null;
  participantId?: string | null;
  tenantDocumentId?: string | null;
  tenantId: string;
}) {
  const admin = createAdminClient();
  const result = await admin.from("document_access_events").insert({
    tenant_id: tenantId,
    tenant_document_id: tenantDocumentId ?? null,
    parent_document_id: parentDocumentId ?? null,
    participant_id: participantId ?? null,
    actor_profile_id: actorProfileId,
    event_type: eventType,
    access_channel: "web",
    metadata: metadata ?? {}
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0] ?? {});

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");
}

function buildReportFile(rows: Array<Record<string, unknown>>, requestedFormat: string) {
  if (requestedFormat === "json") {
    return {
      body: JSON.stringify(rows, null, 2),
      contentType: "application/json",
      extension: "json",
      generatedFormat: "json"
    };
  }

  if (requestedFormat === "xlsx") {
    return {
      body: toExcelHtml(rows),
      contentType: "application/vnd.ms-excel",
      extension: "xls",
      generatedFormat: "excel_compatible_html"
    };
  }

  return {
    body: toCsv(rows),
    contentType: "text/csv",
    extension: "csv",
    generatedFormat: "csv"
  };
}

function toExcelHtml(rows: Array<Record<string, unknown>>) {
  const headers = Object.keys(rows[0] ?? {});
  const headerCells = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const bodyRows = rows
    .map((row) => `<tr>${headers.map((header) => `<td>${escapeHtml(row[header])}</td>`).join("")}</tr>`)
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

function escapeHtml(value: unknown) {
  const stringValue = value === null || value === undefined ? "" : typeof value === "string" ? value : JSON.stringify(value);

  return stringValue
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = typeof value === "string" ? value : JSON.stringify(value);

  return /[",\n]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function normalizeParentDocumentType(type: string) {
  return type === "internal_note" ? "document" : type;
}

function safeFileName(filename: string) {
  return filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "document";
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}

async function requireTenantWriter() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om operations te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id,
    roles: context.activeTenant.roles
  };
}

async function requireTenantAdmin() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canManage = context.activeTenant.roles.some((role) => ["tenant_owner", "tenant_admin"].includes(role));

  if (!canManage) {
    throw new Error("Je hebt geen rechten om rapportrechten te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id,
    roles: context.activeTenant.roles
  };
}

async function requireReportExportPermission(supabase: TenantSupabaseClient, tenantId: string, roles: readonly string[], reportType: string) {
  const result = await supabase.from("report_permission_grants").select("id, report_key, role, can_view, can_export").eq("tenant_id", tenantId);

  if (result.error) {
    throw new Error(result.error.message);
  }

  if (!canRoleExportReport(result.data ?? [], roles, reportType)) {
    throw new Error("Je hebt geen rechten om dit rapport te exporteren.");
  }
}

function revalidatePhase12() {
  for (const path of ["/admin", "/admin/berichten", "/admin/helpdesk", "/admin/mail-instellingen", "/admin/mailtemplates", "/admin/notificatietemplates", "/admin/nieuwsbrief", "/admin/taken", "/admin/documenten", "/admin/rapportages", "/parent/notificaties", "/parent/documenten", "/parent/helpdesk"]) {
    revalidatePath(path);
  }
}

async function notifyGuardianAboutHelpdeskReply(tenantId: string, ticketId: string) {
  const admin = createAdminClient();
  const ticketResult = await admin
    .from("helpdesk_tickets")
    .select("id, guardian_id, participant_id, subject")
    .eq("tenant_id", tenantId)
    .eq("id", ticketId)
    .single();

  if (ticketResult.error || !ticketResult.data) {
    throw new Error(ticketResult.error?.message ?? "Helpdeskticket niet gevonden voor notificatie.");
  }

  const ticket = ticketResult.data as { id: string; guardian_id: string; participant_id: string | null; subject: string };
  const guardianResult = await admin
    .from("participant_guardians")
    .select("profile_id")
    .eq("tenant_id", tenantId)
    .eq("id", ticket.guardian_id)
    .single();

  if (guardianResult.error || !guardianResult.data) {
    throw new Error(guardianResult.error?.message ?? "Ouder/verzorger niet gevonden voor notificatie.");
  }

  await throwOnError(
    admin.from("parent_notifications").insert({
      tenant_id: tenantId,
      recipient_profile_id: (guardianResult.data as { profile_id: string }).profile_id,
      participant_id: ticket.participant_id,
      title: "Reactie van de zwemschool",
      body: ticket.subject,
      notification_type: "general",
      status: "unread"
    })
  );
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function optionalCode(formData: FormData, key: string, fallback: string) {
  const value = optionalString(formData, key) ?? fallback;
  const code = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!code) {
    throw new Error(`${key} heeft geen geldige code.`);
  }

  return code;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function intValue(formData: FormData, key: string, fallback: number, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const value = optionalString(formData, key);
  const parsed = value ? Number.parseInt(value, 10) : fallback;

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function optionalInt(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${key} heeft geen geldige waarde.`);
  }

  return parsed;
}

function optionalDate(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function optionalDateTime(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum/tijd.`);
  }

  return value;
}

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function formDataToReportFilterObject(formData: FormData) {
  return {
    program_id: optionalString(formData, "program_id"),
    stage_id: optionalString(formData, "stage_id"),
    group_id: optionalString(formData, "group_id"),
    instructor_id: optionalString(formData, "instructor_id"),
    status_filter: optionalString(formData, "status_filter"),
    date_from: optionalString(formData, "date_from"),
    date_to: optionalString(formData, "date_to")
  };
}

function listValue(formData: FormData, key: string) {
  return (optionalString(formData, key) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function jsonObjectValue(formData: FormData, key: string) {
  const raw = optionalString(formData, key);

  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} moet een JSON-object zijn.`);
  }

  return parsed as Record<string, unknown>;
}
