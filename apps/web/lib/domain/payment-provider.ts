import "server-only";

export type PaymentProviderKind = "manual" | "mollie" | "ideal" | "other";
export type PaymentProviderMode = "test" | "live";

export type PaymentProviderConfigLike = {
  id: string;
  provider: string;
  mode: string;
  status: string;
  display_name: string;
  secret_reference: string | null;
};

export type PaymentSessionDraftInput = {
  amountCents: number;
  currency: string;
  idempotencyKey: string;
  paymentId: string;
  providerConfig: PaymentProviderConfigLike;
  returnUrl: string | null;
};

export type PaymentSessionDraft = {
  checkoutUrl: string | null;
  provider: PaymentProviderKind;
  providerSessionId: string | null;
  status: "draft" | "pending";
};

export type NormalizedPaymentWebhook = {
  eventType: string;
  provider: PaymentProviderKind;
  providerEventId: string | null;
  providerSessionId: string | null;
  statusHint: "paid" | "failed" | "expired" | "cancelled" | "pending" | "unknown";
};

export function createPaymentSessionDraft(input: PaymentSessionDraftInput): PaymentSessionDraft {
  const provider = normalizeProvider(input.providerConfig.provider);

  if (provider === "manual") {
    return {
      checkoutUrl: null,
      provider,
      providerSessionId: null,
      status: "draft"
    };
  }

  return {
    checkoutUrl: null,
    provider,
    providerSessionId: null,
    status: "pending"
  };
}

export function normalizePaymentWebhook(input: { eventType: string; payload: Record<string, unknown>; provider: string; providerEventId?: string | null }): NormalizedPaymentWebhook {
  const provider = normalizeProvider(input.provider);
  const statusValue = String(input.payload.status ?? input.payload.payment_status ?? "").toLowerCase();

  return {
    eventType: input.eventType,
    provider,
    providerEventId: input.providerEventId ?? null,
    providerSessionId: typeof input.payload.id === "string" ? input.payload.id : typeof input.payload.payment_id === "string" ? input.payload.payment_id : null,
    statusHint: statusValue === "paid" ? "paid" : statusValue === "failed" ? "failed" : statusValue === "expired" ? "expired" : statusValue === "cancelled" || statusValue === "canceled" ? "cancelled" : statusValue === "pending" || statusValue === "open" ? "pending" : "unknown"
  };
}

export function isProviderConfigReady(config: PaymentProviderConfigLike) {
  if (config.status !== "active") {
    return false;
  }

  return normalizeProvider(config.provider) === "manual" || Boolean(config.secret_reference);
}

export function paymentProviderLabel(provider: string) {
  if (provider === "mollie") {
    return "Mollie";
  }

  if (provider === "ideal") {
    return "iDEAL";
  }

  if (provider === "manual") {
    return "Handmatig";
  }

  return "Andere provider";
}

function normalizeProvider(provider: string): PaymentProviderKind {
  if (provider === "mollie" || provider === "ideal" || provider === "other") {
    return provider;
  }

  return "manual";
}
