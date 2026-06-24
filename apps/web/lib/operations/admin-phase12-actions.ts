"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { prepareEmailEnvelope, type EmailProvider } from "@/lib/communication/email-adapter";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

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

export async function createMessageTemplateAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();
  const name = requiredString(formData, "name");

  await throwOnError(
    supabase.from("message_templates").insert({
      tenant_id: tenantId,
      code: optionalCode(formData, "code", name),
      name,
      channel: enumValue(formData, "channel", ["email", "in_app"], "email"),
      audience: enumValue(formData, "audience", ["parent", "instructor", "tenant_admin", "all"], "parent"),
      subject_template: optionalString(formData, "subject_template"),
      body_template: requiredString(formData, "body_template"),
      status: enumValue(formData, "status", ["draft", "active", "archived"], "draft"),
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

  await throwOnError(
    supabase
      .from("message_templates")
      .update({
        code: optionalCode(formData, "code", name),
        name,
        channel: enumValue(formData, "channel", ["email", "in_app"], "email"),
        audience: enumValue(formData, "audience", ["parent", "instructor", "tenant_admin", "all"], "parent"),
        subject_template: optionalString(formData, "subject_template"),
        body_template: requiredString(formData, "body_template"),
        status: enumValue(formData, "status", ["draft", "active", "archived"], "draft"),
        tags: listValue(formData, "tags"),
        sort_order: intValue(formData, "sort_order", 0)
      })
      .eq("id", requiredString(formData, "id"))
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
  let subject = optionalString(formData, "subject");
  let body = optionalString(formData, "body");

  if (templateId && (!subject || !body)) {
    const templateResult = await supabase
      .from("message_templates")
      .select("subject_template, body_template")
      .eq("tenant_id", tenantId)
      .eq("id", templateId)
      .single();

    if (templateResult.error || !templateResult.data) {
      throw new Error(templateResult.error?.message ?? "Template niet gevonden.");
    }

    subject = subject ?? templateResult.data.subject_template;
    body = body ?? templateResult.data.body_template;
  }

  if (!body) {
    throw new Error("Berichttekst is verplicht.");
  }

  if (channel === "email" && !recipientEmail && !recipientProfileId) {
    throw new Error("Kies een profiel of vul een e-mailadres in voor email.");
  }

  const prepared = prepareEmailEnvelope(provider, requestedStatus);

  await throwOnError(
    supabase.from("message_outbox").insert({
      tenant_id: tenantId,
      template_id: templateId,
      channel,
      provider,
      recipient_profile_id: recipientProfileId,
      recipient_email: recipientEmail,
      participant_id: optionalString(formData, "participant_id"),
      enrollment_id: optionalString(formData, "enrollment_id"),
      subject,
      body,
      status: prepared.dispatchStatus,
      scheduled_at: optionalDateTime(formData, "scheduled_at"),
      created_by_profile_id: profileId,
      metadata: { phase: "phase12", email_foundation: prepared }
    })
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
      created_by_profile_id: profileId,
      metadata: { phase: "phase12", storage: "prepared" }
    })
  );

  revalidatePhase12();
}

export async function updateTenantDocumentRecordAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();

  await throwOnError(
    supabase
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
        available_on: optionalDate(formData, "available_on")
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
}

export async function createReportExportRequestAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantWriter();

  await throwOnError(
    supabase.from("report_export_requests").insert({
      tenant_id: tenantId,
      report_type: enumValue(formData, "report_type", ["occupancy", "waitlist", "progress", "payments"], "occupancy"),
      export_format: enumValue(formData, "export_format", ["csv", "xlsx", "pdf", "json"], "csv"),
      status: enumValue(formData, "status", ["requested", "processing", "ready", "failed", "cancelled"], "requested"),
      filters: jsonObjectValue(formData, "filters"),
      file_path: optionalString(formData, "file_path"),
      requested_by_profile_id: profileId,
      metadata: { phase: "phase12", export_worker: "prepared" }
    })
  );

  revalidatePhase12();
}

export async function updateReportExportRequestAction(formData: FormData) {
  const { supabase, tenantId } = await requireTenantWriter();
  const status = enumValue(formData, "status", ["requested", "processing", "ready", "failed", "cancelled"], "requested");

  await throwOnError(
    supabase
      .from("report_export_requests")
      .update({
        report_type: enumValue(formData, "report_type", ["occupancy", "waitlist", "progress", "payments"], "occupancy"),
        export_format: enumValue(formData, "export_format", ["csv", "xlsx", "pdf", "json"], "csv"),
        status,
        filters: jsonObjectValue(formData, "filters"),
        file_path: optionalString(formData, "file_path"),
        completed_at: status === "ready" ? new Date().toISOString() : null,
        error_message: optionalString(formData, "error_message"),
        metadata: { phase: "phase12", export_worker: "prepared" }
      })
      .eq("id", requiredString(formData, "id"))
      .eq("tenant_id", tenantId)
  );

  revalidatePhase12();
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
    profileId: context.user.id
  };
}

function revalidatePhase12() {
  for (const path of ["/admin", "/admin/berichten", "/admin/taken", "/admin/documenten", "/admin/rapportages", "/parent/notificaties", "/parent/documenten"]) {
    revalidatePath(path);
  }
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
