"use server";

import { extractTemplateVariables, renderTemplate, validateTemplateVariables, type EmailProvider } from "@/lib/communication/email-adapter";
import { createClient } from "@/lib/supabase/server";

type TenantSupabaseClient = Awaited<ReturnType<typeof createClient>>;

type MessageTemplate = {
  id: string;
  code: string;
  channel: string;
  subject_template: string | null;
  body_template: string;
  required_variables: string[] | null;
};

type GuardianRecipient = {
  profile_id: string;
  email: string | null;
  display_name: string | null;
};

export type QueueParentEventInput = {
  tenantId: string;
  participantId: string;
  enrollmentId?: string | null;
  eventKey: "intake_submitted" | "slot_offer_sent" | "payment_reminder" | "badge_awarded" | "afzwem_invited" | "diploma_issued";
  templateCode: string;
  context: Record<string, unknown>;
  sourceTable: string;
  sourceRecordId: string;
  createdByProfileId?: string | null;
  provider?: EmailProvider;
  fallbackSubject: string;
  fallbackBody: string;
};

export type QueueDirectEventInput = {
  tenantId: string;
  recipientEmail: string;
  recipientName?: string | null;
  eventKey: QueueParentEventInput["eventKey"];
  templateCode: string;
  context: Record<string, unknown>;
  sourceTable: string;
  sourceRecordId: string;
  provider?: EmailProvider;
  fallbackSubject: string;
  fallbackBody: string;
};

export async function queueDirectEventMessage(supabase: TenantSupabaseClient, input: QueueDirectEventInput) {
  const template = await getActiveTemplate(supabase, input.tenantId, input.templateCode);
  const context = {
    ...input.context,
    parent_name: valueOrFallback(input.context.parent_name, input.recipientName ?? "ouder/verzorger"),
    recipient_email: input.recipientEmail
  };
  const rendered = renderEventTemplate(template, input.fallbackSubject, input.fallbackBody, context);
  const result = await supabase.from("message_outbox").insert({
    tenant_id: input.tenantId,
    template_id: template?.id ?? null,
    channel: template?.channel ?? "email",
    provider: input.provider ?? "smtp",
    recipient_email: input.recipientEmail,
    subject: rendered.subject,
    body: rendered.body,
    status: rendered.validationErrors.length > 0 ? "draft" : "queued",
    delivery_status: rendered.validationErrors.length > 0 ? "prepared" : "pending",
    render_context: context,
    template_variables: rendered.variables,
    validation_errors: rendered.validationErrors,
    event_key: input.eventKey,
    source_table: input.sourceTable,
    source_record_id: input.sourceRecordId,
    metadata: {
      source: "communication_event_hook",
      event_key: input.eventKey,
      template_code: input.templateCode,
      validation_state: rendered.validationErrors.length > 0 ? "missing_variables" : "ready"
    }
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { queued: rendered.validationErrors.length > 0 ? 0 : 1, skipped: null };
}

export async function queueParentEventMessages(supabase: TenantSupabaseClient, input: QueueParentEventInput) {
  const guardians = await getActiveGuardianRecipients(supabase, input.tenantId, input.participantId);

  if (guardians.length === 0) {
    return { queued: 0, skipped: "no_guardian_email" };
  }

  const template = await getActiveTemplate(supabase, input.tenantId, input.templateCode);
  const provider = input.provider ?? "smtp";
  const rows = guardians.map((guardian) => {
    const context = {
      ...input.context,
      parent_name: valueOrFallback(input.context.parent_name, guardian.display_name ?? "ouder/verzorger"),
      recipient_email: guardian.email
    };
    const rendered = renderEventTemplate(template, input.fallbackSubject, input.fallbackBody, context);

    return {
      tenant_id: input.tenantId,
      template_id: template?.id ?? null,
      channel: template?.channel ?? "email",
      provider,
      recipient_profile_id: guardian.profile_id,
      recipient_email: guardian.email,
      participant_id: input.participantId,
      enrollment_id: input.enrollmentId ?? null,
      subject: rendered.subject,
      body: rendered.body,
      status: rendered.validationErrors.length > 0 ? "draft" : "queued",
      delivery_status: rendered.validationErrors.length > 0 ? "prepared" : "pending",
      render_context: context,
      template_variables: rendered.variables,
      validation_errors: rendered.validationErrors,
      event_key: input.eventKey,
      source_table: input.sourceTable,
      source_record_id: input.sourceRecordId,
      created_by_profile_id: input.createdByProfileId ?? null,
      metadata: {
        source: "communication_event_hook",
        event_key: input.eventKey,
        template_code: input.templateCode,
        validation_state: rendered.validationErrors.length > 0 ? "missing_variables" : "ready"
      }
    };
  });

  const result = await supabase.from("message_outbox").insert(rows);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return { queued: rows.filter((row) => row.status === "queued").length, skipped: null };
}

function renderEventTemplate(template: MessageTemplate | null, fallbackSubject: string, fallbackBody: string, context: Record<string, unknown>) {
  const variables = template ? uniqueStrings([...(template.required_variables ?? []), ...extractTemplateVariables(template.subject_template, template.body_template)]) : [];
  const validationErrors = template ? validateTemplateVariables(variables, context) : [];

  if (!template || validationErrors.length > 0) {
    return {
      subject: fallbackSubject,
      body: fallbackBody,
      variables,
      validationErrors
    };
  }

  return {
    subject: renderTemplate(template.subject_template, context) ?? fallbackSubject,
    body: renderTemplate(template.body_template, context) ?? fallbackBody,
    variables,
    validationErrors
  };
}

async function getActiveTemplate(supabase: TenantSupabaseClient, tenantId: string, templateCode: string) {
  const result = await supabase
    .from("message_templates")
    .select("id, code, channel, subject_template, body_template, required_variables")
    .eq("tenant_id", tenantId)
    .eq("code", templateCode)
    .eq("status", "active")
    .maybeSingle();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data ? (result.data as MessageTemplate) : null;
}

async function getActiveGuardianRecipients(supabase: TenantSupabaseClient, tenantId: string, participantId: string) {
  const result = await supabase
    .from("participant_guardians")
    .select("profile_id, email, display_name")
    .eq("tenant_id", tenantId)
    .eq("participant_id", participantId)
    .eq("status", "active");

  if (result.error) {
    throw new Error(result.error.message);
  }

  return ((result.data ?? []) as GuardianRecipient[]).filter((guardian) => Boolean(guardian.email));
}

function valueOrFallback(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort();
}
