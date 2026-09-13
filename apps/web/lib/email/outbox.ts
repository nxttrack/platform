import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { emailRetryDelaySeconds, isEmailSendingEnabled } from "./email-delivery-contract";
import { parseTransactionalEmailPayload } from "./outbox-payload";
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
  const leaseSeconds = Math.min(900, Math.max(input.leaseSeconds ?? 300, minimumEmailOutboxLeaseSeconds()));
  const limit = Number.isInteger(input.limit) && input.limit! >= 1 && input.limit! <= 100 ? input.limit! : 25;
  const results: EmailOutboxProcessResult[] = [];

  // Claim immediately before provider I/O. Pre-claiming a whole sequential batch
  // lets later leases expire while earlier provider calls are still in flight.
  for (let index = 0; index < limit; index += 1) {
    const claim = await admin.rpc("claim_email_outbox", {
      target_lease_seconds: leaseSeconds,
      target_limit: 1
    });

    if (claim.error) {
      throw new Error(`Could not claim email outbox: ${claim.error.message}`);
    }

    const item = ((claim.data ?? []) as ClaimedEmailOutboxItem[])[0];
    if (!item) break;
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

function minimumEmailOutboxLeaseSeconds() {
  const configuredTimeout = Number.parseInt(process.env.EMAIL_DELIVERY_TIMEOUT_MS ?? "15000", 10);
  const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout >= 1_000 && configuredTimeout <= 60_000
    ? configuredTimeout
    : 15_000;

  // Leave a bounded completion/logging margin after the provider timeout.
  return Math.max(30, Math.ceil(timeoutMs / 1_000) + 30);
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
