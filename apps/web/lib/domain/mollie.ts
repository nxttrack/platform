import "server-only";

const mollieApiBase = "https://api.mollie.com/v2";

export type MolliePayment = {
  id: string;
  status: "open" | "canceled" | "pending" | "authorized" | "expired" | "failed" | "paid";
  amount: { currency: string; value: string };
  metadata?: Record<string, unknown> | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  _links?: { checkout?: { href?: string } };
};

export async function createMolliePayment(input: { amountCents: number; currency: string; description: string; idempotencyKey: string; metadata: Record<string, string>; redirectUrl: string; secretReference: string; webhookUrl: string }) {
  return mollieRequest<MolliePayment>("/payments", input.secretReference, {
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

export async function getMolliePayment(paymentId: string, secretReference: string) {
  if (!/^tr_[A-Za-z0-9]+$/.test(paymentId)) throw new Error("Invalid Mollie payment id");
  return mollieRequest<MolliePayment>(`/payments/${paymentId}`, secretReference, { method: "GET" });
}

export function resolveMollieSecret(reference: string) {
  const variable = reference.replace(/^(?:GITHUB_ENV|ENV):/, "");
  if (!/^MOLLIE_[A-Z0-9_]+$/.test(variable)) throw new Error("Mollie secret reference must point to a MOLLIE_* environment variable");
  const value = process.env[variable];
  if (!value || !/^(?:test|live)_/.test(value)) throw new Error(`Mollie secret ${variable} is not configured`);
  return value;
}

export function normalizeMollieStatus(status: MolliePayment["status"]) {
  if (status === "open" || status === "pending") return "pending" as const;
  if (status === "authorized") return "authorized" as const;
  if (status === "paid") return "paid" as const;
  if (status === "expired") return "expired" as const;
  if (status === "canceled") return "cancelled" as const;
  return "failed" as const;
}

async function mollieRequest<T>(path: string, secretReference: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`${mollieApiBase}${path}`, {
      ...init,
      cache: "no-store",
      headers: { Authorization: `Bearer ${resolveMollieSecret(secretReference)}`, Accept: "application/json", ...init.headers },
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as (T & { detail?: string; title?: string }) | null;
    if (!response.ok || !payload) throw new Error(payload?.detail || payload?.title || `Mollie API returned ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
