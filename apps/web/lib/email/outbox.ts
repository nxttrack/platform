import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { emailRetryDelaySeconds, isEmailSendingEnabled } from "./email-delivery-contract";
import { sendTransactionalEmail, type TransactionalEmailInput } from "./transactional";

type ClaimedEmailOutboxItem = {
  attempt_number: number;
  claim_token: string;
  lease_expires_at: string;
  message_type: string;
  outbox_id: string;
  payload: unknown;
  payload_reference_id: string | null;
  payload_reference_type: string | null;
  tenant_id: string | null;
};

export type EmailOutboxProcessResult = {
  outboxId: string;
  status: "accepted" | "dead" | "failed" | "retry";
};

export class EmailOutboxProcessingDisabledError extends Error {
  constructor() {
    super("Email outbox processing is disabled by the central transport gate.");
    this.name = "EmailOutboxProcessingDisabledError";
  }
}

export async function enqueueTransactionalEmail(input: {
  idempotencyKey: string;
  maxAttempts?: number;
  message: TransactionalEmailInput;
  messageType: string;
}) {
  const result = await createAdminClient().rpc("enqueue_email_outbox", {
    target_idempotency_key: input.idempotencyKey,
    target_max_attempts: input.maxAttempts ?? 5,
    target_message_type: input.messageType,
    target_payload: input.message,
    target_payload_reference_id: input.message.relatedId ?? null,
    target_payload_reference_type: input.message.relatedType ?? null,
    target_tenant_id: input.message.tenantId ?? null
  });

  if (result.error || typeof result.data !== "string") {
    throw new Error(`Could not enqueue transactional email: ${result.error?.message ?? "missing outbox id"}`);
  }

  return result.data;
}

export async function processEmailOutboxBatch(input: { leaseSeconds?: number; limit?: number } = {}) {
  if (!isEmailSendingEnabled(process.env.EMAIL_SENDING_ENABLED)) {
    throw new EmailOutboxProcessingDisabledError();
  }

  const admin = createAdminClient();
  const claim = await admin.rpc("claim_email_outbox", {
    target_lease_seconds: input.leaseSeconds ?? 300,
    target_limit: input.limit ?? 25
  });

  if (claim.error) {
    throw new Error(`Could not claim email outbox: ${claim.error.message}`);
  }

  const claimed = (claim.data ?? []) as ClaimedEmailOutboxItem[];
  const results: EmailOutboxProcessResult[] = [];

  for (const item of claimed) {
    const message = parseTransactionalEmailPayload(item.payload);

    if (!message) {
      const completed = await completeOutboxItem(item, {
        errorCode: "invalid_payload",
        errorMessage: "Durable email payload is invalid.",
        outcome: "dead",
        provider: null
      });
      results.push({ outboxId: item.outbox_id, status: completed ? "dead" : "failed" });
      continue;
    }

    const delivery = await sendTransactionalEmail(message);
    const provider = delivery.provider === "not_configured" ? null : delivery.provider;
    const outcome = delivery.accepted ? "accepted" : delivery.retryable ? "retry" : "dead";
    const completed = await completeOutboxItem(item, {
      errorCode: delivery.accepted ? null : delivery.failureCode,
      errorMessage: delivery.accepted ? null : delivery.reason,
      outcome,
      provider,
      providerMessageId: delivery.providerMessageId ?? null,
      retryDelaySeconds: outcome === "retry" ? emailRetryDelaySeconds(item.attempt_number) : null
    });

    results.push({ outboxId: item.outbox_id, status: completed ?? "failed" });
  }

  return results;
}

async function completeOutboxItem(
  item: ClaimedEmailOutboxItem,
  input: {
    errorCode: string | null;
    errorMessage: string | null;
    outcome: "accepted" | "dead" | "retry";
    provider: "sendgrid_api" | "smtp" | null;
    providerMessageId?: string | null;
    retryDelaySeconds?: number | null;
  }
): Promise<"accepted" | "dead" | "retry" | null> {
  const result = await createAdminClient().rpc("complete_email_outbox", {
    target_claim_token: item.claim_token,
    target_error_code: input.errorCode,
    target_error_message: input.errorMessage,
    target_outbox_id: item.outbox_id,
    target_outcome: input.outcome,
    target_provider: input.provider,
    target_provider_message_id: input.providerMessageId ?? null,
    target_retry_delay_seconds: input.retryDelaySeconds ?? null
  });

  if (result.error || !["accepted", "dead", "retry"].includes(String(result.data))) {
    console.error("[email-outbox] completion failed", {
      code: result.error?.code ?? "invalid_completion_result",
      outboxId: item.outbox_id
    });
    return null;
  }

  return result.data as "accepted" | "dead" | "retry";
}

function parseTransactionalEmailPayload(value: unknown): TransactionalEmailInput | null {
  if (!isRecord(value)) return null;
  const to = requiredString(value.to, 320);
  const subject = requiredString(value.subject, 500);
  const text = requiredString(value.text, 65_536);

  if (!to || !subject || !text || !isEmail(to)) return null;

  return {
    fromName: optionalString(value.fromName, 200),
    html: optionalString(value.html, 65_536) ?? undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    organizationName: optionalString(value.organizationName, 200),
    recipientUserId: optionalUuid(value.recipientUserId),
    relatedId: optionalUuid(value.relatedId),
    relatedType: optionalString(value.relatedType, 80),
    subject,
    templateKey: optionalString(value.templateKey, 80) ?? undefined,
    tenantId: optionalUuid(value.tenantId),
    text,
    to
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, maximumLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function optionalString(value: unknown, maximumLength: number) {
  if (value === null || value === undefined || value === "") return null;
  return requiredString(value, maximumLength);
}

function optionalUuid(value: unknown) {
  const normalized = optionalString(value, 36);
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}
