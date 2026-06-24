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
    throw new Error("Mollie/iDEAL is voorbereid, maar nog niet actief. Rond eerst de manual payment flow af.");
  }
};
