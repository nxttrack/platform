import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredEmailDeliveryConfig, type SendGridApiEmailConfig } from "./platform-settings";
import { sendSmtpEmail } from "./smtp";
import { applyTenantEmailBranding, type TenantEmailBranding } from "./tenant-branding";
import { classifyEmailHttpFailure, classifyEmailTransportError, isEmailSendingEnabled } from "./email-delivery-contract";

export type TransactionalEmailInput = {
  fromName?: string | null;
  to: string;
  recipientUserId?: string | null;
  subject: string;
  text: string;
  html?: string;
  metadata?: Record<string, unknown>;
  organizationName?: string | null;
  relatedId?: string | null;
  relatedType?: string | null;
  templateKey?: string;
  tenantId?: string | null;
};

export type TransactionalEmailResult =
  | {
      accepted: true;
      attemptId?: string;
      provider: "sendgrid_api" | "smtp";
      providerMessageId?: string;
      source?: "env" | "platform_settings";
    }
  | {
      accepted: false;
      attemptId?: string;
      failureCode: string;
      provider: "not_configured" | "sendgrid_api" | "smtp";
      providerMessageId?: string;
      reason: string;
      retryable: boolean;
      source?: "env" | "platform_settings";
    };

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  if (!isEmailSendingEnabled(process.env.EMAIL_SENDING_ENABLED)) {
    return withDeliveryAttempt(input, {
      accepted: false,
      failureCode: "sending_disabled",
      provider: "not_configured",
      reason: "E-mailtransport is centraal uitgeschakeld.",
      retryable: false
    });
  }

  if (isReservedTestRecipient(input.to)) {
    return withDeliveryAttempt(input, {
      accepted: false,
      failureCode: "reserved_test_recipient",
      provider: "not_configured",
      reason: "Delivery intentionally skipped for a reserved .test recipient.",
      retryable: false
    });
  }

  const [config, branding] = await Promise.all([
    getConfiguredEmailDeliveryConfig(),
    input.tenantId ? getTenantEmailBranding(input.tenantId) : Promise.resolve(null)
  ]);

  if (!config) {
    const result: TransactionalEmailResult = {
      accepted: false,
      failureCode: "configuration",
      provider: "not_configured",
      reason: "Configureer SendGrid API of SMTP in de platform admin instellingen.",
      retryable: false
    };

    return withDeliveryAttempt(input, result);
  }

  const brandedContent = branding ? applyTenantEmailBranding(input, branding) : null;
  const deliveryInput: TransactionalEmailInput = brandedContent
    ? { ...input, ...brandedContent }
    : input;
  const fromName = input.fromName ?? branding?.fromName ?? brandedContent?.organizationName ?? input.organizationName ?? config.fromName;
  let result: TransactionalEmailResult;

  if (config.provider === "sendgrid_api") {
    try {
      result = await sendWithSendGridApi({ ...config, fromName }, deliveryInput);
    } catch (error) {
      const classification = classifyEmailTransportError(error);
      result = {
        accepted: false,
        failureCode: classification.code,
        provider: "sendgrid_api",
        reason: "SendGrid transport failed before provider acceptance.",
        retryable: classification.retryable,
        source: config.source
      };
    }
  } else {
    try {
      await sendSmtpEmail({ ...config, fromName }, deliveryInput);

      result = {
        accepted: true,
        provider: "smtp",
        source: config.source
      };
    } catch (error) {
      const classification = classifyEmailTransportError(error);
      result = {
        accepted: false,
        failureCode: classification.code,
        provider: "smtp",
        reason: "SMTP transport failed before provider acceptance.",
        retryable: classification.retryable,
        source: config.source
      };
    }
  }

  return withDeliveryAttempt(deliveryInput, result);
}

async function getTenantEmailBranding(tenantId: string): Promise<TenantEmailBranding | null> {
  const { data, error } = await createAdminClient()
    .from("tenant_branding")
    .select("accent_color, email_footer, email_from_name, logo_url, primary_color, product_name")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !data) return null;

  return {
    accentColor: data.accent_color,
    footer: data.email_footer,
    fromName: data.email_from_name,
    logoUrl: data.logo_url,
    primaryColor: data.primary_color,
    productName: data.product_name
  };
}

async function sendWithSendGridApi(config: SendGridApiEmailConfig, input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: input.to }]
        }
      ],
      from: {
        email: config.fromEmail,
        name: config.fromName
      },
      subject: input.subject,
      content: [
        {
          type: input.html ? "text/html" : "text/plain",
          value: input.html ?? input.text
        }
      ]
    }),
    signal: AbortSignal.timeout(emailDeliveryTimeoutMs())
  });

  if (!response.ok) {
    const classification = classifyEmailHttpFailure(response.status);
    return {
      accepted: false,
      failureCode: classification.code,
      provider: "sendgrid_api",
      reason: `SendGrid API returned ${response.status}.`,
      retryable: classification.retryable,
      source: config.source
    };
  }

  return {
    accepted: true,
    provider: "sendgrid_api",
    providerMessageId: response.headers.get("x-message-id") ?? undefined,
    source: config.source
  };
}

async function withDeliveryAttempt(input: TransactionalEmailInput, result: TransactionalEmailResult): Promise<TransactionalEmailResult> {
  try {
    const attemptId = await logDeliveryAttempt(input, result);

    return attemptId ? { ...result, attemptId } : result;
  } catch {
    return result;
  }
}

async function logDeliveryAttempt(input: TransactionalEmailInput, result: TransactionalEmailResult) {
  const admin = createAdminClient();
  const metadata = { ...input.metadata };

  if (result.providerMessageId) {
    metadata.providerMessageId = result.providerMessageId;
  }

  const { data, error } = await admin
    .from("email_delivery_attempts")
    .insert({
      tenant_id: input.tenantId ?? null,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_email: input.to,
      provider: result.provider,
      provider_source: result.source ?? null,
      template_key: input.templateKey ?? "custom",
      subject: input.subject,
      status: result.accepted ? "pending" : result.provider === "not_configured" ? "skipped" : "failed",
      error_message: result.accepted ? null : result.reason,
      related_type: input.relatedType ?? null,
      related_id: input.relatedId ?? null,
      metadata,
      accepted_at: result.accepted ? new Date().toISOString() : null,
      delivered_at: null
    })
    .select("id")
    .single();

  if (error || !data) {
    return null;
  }

  return (data as { id: string }).id;
}

function emailDeliveryTimeoutMs() {
  const value = Number.parseInt(process.env.EMAIL_DELIVERY_TIMEOUT_MS ?? "15000", 10);

  return Number.isInteger(value) && value >= 1_000 && value <= 60_000 ? value : 15_000;
}

function isReservedTestRecipient(value: string) {
  const domain = value.trim().toLowerCase().split("@").at(-1);

  return domain === "test" || domain?.endsWith(".test") === true;
}
