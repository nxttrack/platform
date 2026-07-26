import "server-only";

import {
  assertMollieSecretMode,
  isMollieCustomerId,
  isMollieMandateId,
  isMolliePaymentId,
  isMollieRefundId,
  isMollieSecretReference,
  type MollieMandateStatus,
  type MollieMode,
  type MollieProviderStatus,
  type MollieRefundStatus
} from "./mollie-contract";

const mollieApiBase = "https://api.mollie.com/v2";

export class MollieApiError extends Error {
  constructor(message: string, readonly status: number | null, readonly indeterminate: boolean) {
    super(message);
    this.name = "MollieApiError";
  }
}

export type MolliePayment = {
  id: string;
  status: MollieProviderStatus;
  amount: { currency: string; value: string };
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  customerId?: string | null;
  mandateId?: string | null;
  method?: string | null;
  sequenceType?: "oneoff" | "first" | "recurring";
  _links?: { changePaymentState?: { href?: string }; checkout?: { href?: string } };
};

export type MollieCustomer = {
  id: string;
  name?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MollieMandate = {
  id: string;
  method: "creditcard" | "directdebit" | "paypal";
  status: MollieMandateStatus;
  mandateReference?: string | null;
  signatureDate?: string | null;
  details?: {
    consumerAccount?: string | null;
    consumerName?: string | null;
  } | null;
};

export type MollieRefund = {
  id: string;
  amount: { currency: string; value: string };
  description: string;
  metadata?: Record<string, unknown> | null;
  paymentId: string;
  status: MollieRefundStatus;
  createdAt: string;
};

export type MollieChargeback = {
  id: string;
  amount: { currency: string; value: string };
  paymentId: string;
  reason?: { code?: string; description?: string } | null;
  createdAt: string;
  reversedAt?: string | null;
};

export async function createMolliePayment(input: { amountCents: number; currency: string; description: string; idempotencyKey: string; metadata: Record<string, string>; mode: MollieMode; redirectUrl: string; secretReference: string; webhookUrl: string }) {
  return mollieRequest<MolliePayment>("/payments", input.secretReference, input.mode, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: { currency: input.currency, value: (input.amountCents / 100).toFixed(2) },
      description: input.description.slice(0, 255),
      redirectUrl: input.redirectUrl,
      webhookUrl: input.webhookUrl,
      metadata: input.metadata
    })
  });
}

export async function createMollieCustomer(input: {
  email: string;
  guardianUserId: string;
  idempotencyKey: string;
  mode: MollieMode;
  name: string;
  secretReference: string;
  tenantId: string;
}) {
  return mollieRequest<MollieCustomer>("/customers", input.secretReference, input.mode, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      email: input.email,
      locale: "nl_NL",
      name: input.name,
      metadata: {
        guardianUserId: input.guardianUserId,
        tenantId: input.tenantId
      }
    })
  });
}

export async function createMollieFirstPayment(input: {
  amountCents: number;
  currency: string;
  customerId: string;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  mode: MollieMode;
  redirectUrl: string;
  secretReference: string;
  webhookUrl: string;
}) {
  if (!isMollieCustomerId(input.customerId)) throw new Error("Invalid Mollie customer id");
  return mollieRequest<MolliePayment>("/payments", input.secretReference, input.mode, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: { currency: input.currency, value: (input.amountCents / 100).toFixed(2) },
      customerId: input.customerId,
      description: input.description.slice(0, 255),
      metadata: input.metadata,
      redirectUrl: input.redirectUrl,
      sequenceType: "first",
      webhookUrl: input.webhookUrl
    })
  });
}

export async function createMollieRecurringPayment(input: {
  amountCents: number;
  currency: string;
  customerId: string;
  description: string;
  idempotencyKey: string;
  mandateId: string;
  metadata: Record<string, string>;
  mode: MollieMode;
  secretReference: string;
  webhookUrl: string;
}) {
  if (!isMollieCustomerId(input.customerId)) throw new Error("Invalid Mollie customer id");
  if (!isMollieMandateId(input.mandateId)) throw new Error("Invalid Mollie mandate id");
  return mollieRequest<MolliePayment>("/payments", input.secretReference, input.mode, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({
      amount: { currency: input.currency, value: (input.amountCents / 100).toFixed(2) },
      customerId: input.customerId,
      description: input.description.slice(0, 255),
      mandateId: input.mandateId,
      metadata: input.metadata,
      method: "directdebit",
      sequenceType: "recurring",
      webhookUrl: input.webhookUrl
    })
  });
}

export async function listMollieMandates(customerId: string, secretReference: string, mode: MollieMode) {
  if (!isMollieCustomerId(customerId)) throw new Error("Invalid Mollie customer id");
  const result = await mollieRequest<{ _embedded?: { mandates?: MollieMandate[] } }>(
    `/customers/${encodeURIComponent(customerId)}/mandates?limit=250`,
    secretReference,
    mode,
    { method: "GET" }
  );
  return result._embedded?.mandates ?? [];
}

export async function revokeMollieMandate(customerId: string, mandateId: string, secretReference: string, mode: MollieMode) {
  if (!isMollieCustomerId(customerId)) throw new Error("Invalid Mollie customer id");
  if (!isMollieMandateId(mandateId)) throw new Error("Invalid Mollie mandate id");
  await mollieRequest<void>(
    `/customers/${encodeURIComponent(customerId)}/mandates/${encodeURIComponent(mandateId)}`,
    secretReference,
    mode,
    { method: "DELETE" }
  );
}

export async function deleteMollieCustomer(customerId: string, secretReference: string, mode: MollieMode) {
  if (!isMollieCustomerId(customerId)) throw new Error("Invalid Mollie customer id");
  await mollieRequest<void>(
    `/customers/${encodeURIComponent(customerId)}`,
    secretReference,
    mode,
    { method: "DELETE" }
  );
}

export async function createMollieRefund(input: {
  amountCents: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  mode: MollieMode;
  paymentId: string;
  secretReference: string;
}) {
  if (!isMolliePaymentId(input.paymentId)) throw new Error("Invalid Mollie payment id");
  return mollieRequest<MollieRefund>(
    `/payments/${encodeURIComponent(input.paymentId)}/refunds`,
    input.secretReference,
    input.mode,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": input.idempotencyKey },
      body: JSON.stringify({
        amount: { currency: input.currency, value: (input.amountCents / 100).toFixed(2) },
        description: input.description.slice(0, 255),
        metadata: input.metadata
      })
    }
  );
}

export async function listMolliePaymentRefunds(paymentId: string, secretReference: string, mode: MollieMode) {
  if (!isMolliePaymentId(paymentId)) throw new Error("Invalid Mollie payment id");
  const result = await mollieRequest<{ _embedded?: { refunds?: MollieRefund[] } }>(
    `/payments/${encodeURIComponent(paymentId)}/refunds?limit=250`,
    secretReference,
    mode,
    { method: "GET" }
  );
  return result._embedded?.refunds ?? [];
}

export async function getMolliePaymentRefund(paymentId: string, refundId: string, secretReference: string, mode: MollieMode) {
  if (!isMolliePaymentId(paymentId)) throw new Error("Invalid Mollie payment id");
  if (!isMollieRefundId(refundId)) throw new Error("Invalid Mollie refund id");
  return mollieRequest<MollieRefund>(
    `/payments/${encodeURIComponent(paymentId)}/refunds/${encodeURIComponent(refundId)}`,
    secretReference,
    mode,
    { method: "GET" }
  );
}

export async function listMolliePaymentChargebacks(paymentId: string, secretReference: string, mode: MollieMode) {
  if (!isMolliePaymentId(paymentId)) throw new Error("Invalid Mollie payment id");
  const result = await mollieRequest<{ _embedded?: { chargebacks?: MollieChargeback[] } }>(
    `/payments/${encodeURIComponent(paymentId)}/chargebacks?limit=250`,
    secretReference,
    mode,
    { method: "GET" }
  );
  return result._embedded?.chargebacks ?? [];
}

export async function getMolliePayment(paymentId: string, secretReference: string, mode: MollieMode) {
  if (!isMolliePaymentId(paymentId)) throw new Error("Invalid Mollie payment id");
  return mollieRequest<MolliePayment>(`/payments/${paymentId}`, secretReference, mode, { method: "GET" });
}

export function resolveMollieSecret(reference: string, expectedMode: MollieMode) {
  if (!isMollieSecretReference(reference)) {
    throw new Error("Mollie secret reference must point to a MOLLIE_* environment variable");
  }

  const variable = reference.replace(/^(?:GITHUB_ENV|ENV):/, "");
  return assertMollieSecretMode(process.env[variable], expectedMode, variable);
}

async function mollieRequest<T>(path: string, secretReference: string, mode: MollieMode, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    let response: Response;
    try {
      response = await fetch(`${mollieApiBase}${path}`, {
        ...init,
        cache: "no-store",
        headers: { Authorization: `Bearer ${resolveMollieSecret(secretReference, mode)}`, Accept: "application/json", ...init.headers },
        signal: controller.signal
      });
    } catch {
      throw new MollieApiError("Mollie API request had an indeterminate network outcome.", null, init.method !== "GET");
    }
    const payload = response.status === 204
      ? undefined
      : await response.json().catch(() => null) as (T & { detail?: string; title?: string }) | null;
    if (!response.ok || (response.status !== 204 && !payload)) {
      const errorPayload = payload as ({ detail?: string; title?: string } | null | undefined);
      throw new MollieApiError(
        errorPayload?.detail || errorPayload?.title || `Mollie API returned ${response.status}`,
        response.status,
        false
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}
