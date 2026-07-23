import "server-only";

import {
  assertMollieSecretMode,
  isMolliePaymentId,
  isMollieSecretReference,
  type MollieMode,
  type MollieProviderStatus
} from "./mollie-contract";

const mollieApiBase = "https://api.mollie.com/v2";

export type MolliePayment = {
  id: string;
  status: MollieProviderStatus;
  amount: { currency: string; value: string };
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  _links?: { checkout?: { href?: string } };
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
    const response = await fetch(`${mollieApiBase}${path}`, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${resolveMollieSecret(secretReference, mode)}`, Accept: "application/json", ...init.headers },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as (T & { detail?: string; title?: string }) | null;
    if (!response.ok || !payload) throw new Error(payload?.detail || payload?.title || `Mollie API returned ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
