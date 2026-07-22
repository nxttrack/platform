import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getConfiguredEmailDeliveryConfig, type SendGridApiEmailConfig } from "./platform-settings";
import { sendSmtpEmail } from "./smtp";

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
      attemptId?: string;
      delivered: true;
      provider: "sendgrid_api" | "smtp";
      providerMessageId?: string;
      source?: "env" | "platform_settings";
    }
  | {
      attemptId?: string;
      delivered: false;
      provider: "not_configured" | "sendgrid_api" | "smtp";
      providerMessageId?: string;
      reason: string;
      source?: "env" | "platform_settings";
    };

export async function sendTransactionalEmail(input: TransactionalEmailInput): Promise<TransactionalEmailResult> {
  if (isReservedTestRecipient(input.to)) {
    return withDeliveryAttempt(input, {
      delivered: false,
      provider: "not_configured",
      reason: "Delivery intentionally skipped for a reserved .test recipient."
    });
  }

  const config = await getConfiguredEmailDeliveryConfig();

  if (!config) {
    const result: TransactionalEmailResult = {
      delivered: false,
      provider: "not_configured",
      reason: "Configureer SendGrid API of SMTP in de platform admin instellingen."
    };

    return withDeliveryAttempt(input, result);
  }

  const fromName = input.fromName ?? input.organizationName ?? config.fromName;
  let result: TransactionalEmailResult;

  if (config.provider === "sendgrid_api") {
    try {
      result = await sendWithSendGridApi({ ...config, fromName }, input);
    } catch (error) {
      result = {
        delivered: false,
        provider: "sendgrid_api",
        reason: error instanceof Error ? error.message : String(error),
        source: config.source
      };
    }
  } else {
    try {
      await sendSmtpEmail({ ...config, fromName }, input);

      result = {
        delivered: true,
        provider: "smtp",
        source: config.source
      };
    } catch (error) {
      result = {
        delivered: false,
        provider: "smtp",
        reason: error instanceof Error ? error.message : String(error),
        source: config.source
      };
    }
  }

  return withDeliveryAttempt(input, result);
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
    return {
      delivered: false,
      provider: "sendgrid_api",
      reason: `SendGrid API returned ${response.status}.`,
      source: config.source
    };
  }

  return {
    delivered: true,
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
      status: result.delivered ? "sent" : result.provider === "not_configured" ? "skipped" : "failed",
      error_message: result.delivered ? null : result.reason,
      related_type: input.relatedType ?? null,
      related_id: input.relatedId ?? null,
      metadata,
      delivered_at: result.delivered ? new Date().toISOString() : null
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
