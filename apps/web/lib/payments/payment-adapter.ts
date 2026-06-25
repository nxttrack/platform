export type PaymentProvider = "manual" | "mollie";

export type PreparedPaymentRequest = {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  description: string;
  returnUrl?: string;
  webhookUrl?: string;
};

export type PreparedPaymentResult = {
  provider: PaymentProvider;
  providerPaymentId: string | null;
  checkoutUrl: string | null;
  status: "recorded" | "pending";
};

export type MollieSepaDebitRequest = {
  tenantId: string;
  invoiceId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerId: string;
  mandateId: string;
  sequenceType: "first" | "recurring";
  webhookUrl?: string;
  redirectUrl?: string;
  metadata?: Record<string, string>;
};

export type MollieSepaDebitPayload = {
  amount: {
    currency: string;
    value: string;
  };
  description: string;
  method: "directdebit";
  customerId: string;
  mandateId: string;
  sequenceType: "first" | "recurring";
  webhookUrl?: string;
  redirectUrl?: string;
  metadata: Record<string, string>;
};

export interface PaymentAdapter {
  provider: PaymentProvider;
  preparePayment(request: PreparedPaymentRequest): Promise<PreparedPaymentResult>;
}

export const manualPaymentAdapter: PaymentAdapter = {
  provider: "manual",
  async preparePayment() {
    return {
      provider: "manual",
      providerPaymentId: null,
      checkoutUrl: null,
      status: "recorded"
    };
  }
};

export const molliePreparedAdapter: PaymentAdapter = {
  provider: "mollie",
  async preparePayment(_request) {
    throw new Error("Mollie checkout wordt per flow geactiveerd. Gebruik de SEPA/checkout helpers zodat webhook, mandaat en providerstatus expliciet vastliggen.");
  }
};

export function buildMollieSepaDebitPayload(request: MollieSepaDebitRequest): MollieSepaDebitPayload {
  return {
    amount: {
      currency: request.currency,
      value: (request.amountCents / 100).toFixed(2)
    },
    description: request.description.slice(0, 255),
    method: "directdebit",
    customerId: request.customerId,
    mandateId: request.mandateId,
    sequenceType: request.sequenceType,
    webhookUrl: request.webhookUrl,
    redirectUrl: request.redirectUrl,
    metadata: {
      tenant_id: request.tenantId,
      invoice_id: request.invoiceId,
      ...(request.metadata ?? {})
    }
  };
}
