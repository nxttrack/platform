export type MollieMode = "test" | "live";
export type MollieProviderStatus = "open" | "canceled" | "pending" | "authorized" | "expired" | "failed" | "paid";
export type MollieSessionStatus = "pending" | "authorized" | "paid" | "expired" | "cancelled" | "failed";

const molliePaymentIdPattern = /^tr_[A-Za-z0-9]+$/;
const mollieSecretReferencePattern = /^(?:(?:GITHUB_ENV|ENV):)?MOLLIE_[A-Z0-9_]+$/;

export class MollieWebhookRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "MollieWebhookRequestError";
  }
}

export function isMolliePaymentId(value: string) {
  return molliePaymentIdPattern.test(value);
}

export function isMollieSecretReference(value: string) {
  return mollieSecretReferencePattern.test(value);
}

export function assertMollieSecretMode(value: string | undefined, expectedMode: MollieMode, variable: string) {
  if (!value || !/^(?:test|live)_/.test(value)) {
    throw new Error(`Mollie secret ${variable} is not configured`);
  }

  if (!value.startsWith(`${expectedMode}_`)) {
    throw new Error(`Mollie secret ${variable} does not match ${expectedMode} mode`);
  }

  return value;
}

export function normalizeMollieStatus(status: MollieProviderStatus): MollieSessionStatus {
  if (status === "open" || status === "pending") return "pending";
  if (status === "authorized") return "authorized";
  if (status === "paid") return "paid";
  if (status === "expired") return "expired";
  if (status === "canceled") return "cancelled";
  return "failed";
}

export function validateMolliePaymentSnapshot(input: {
  payment: {
    amount: { currency: string; value: string };
    metadata?: Record<string, unknown> | null;
  };
  session: {
    amountCents: number;
    currency: string;
    id: string;
    manualPaymentId: string;
    tenantId: string;
  };
}) {
  const metadata = input.payment.metadata ?? {};

  if (
    metadata.tenantId !== input.session.tenantId ||
    metadata.paymentSessionId !== input.session.id ||
    metadata.manualPaymentId !== input.session.manualPaymentId
  ) {
    throw new Error("Mollie metadata does not match payment session");
  }

  const amountCents = parseMollieAmountCents(input.payment.amount.value);
  if (amountCents !== input.session.amountCents || input.payment.amount.currency !== input.session.currency) {
    throw new Error("Mollie amount does not match payment session");
  }
}

export async function readClassicMollieWebhookId(request: Request, maximumBytes = 10_000) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/x-www-form-urlencoded") {
    throw new MollieWebhookRequestError("Unsupported Mollie webhook content type", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new MollieWebhookRequestError("Mollie webhook body is too large", 413);
  }

  const body = await readBoundedBody(request.body, maximumBytes);
  return String(new URLSearchParams(body).get("id") ?? "");
}

export function getSafeMollieCheckoutUrl(input: {
  checkoutUrl: string | null;
  expiresAt: string | null;
  provider: string;
  status: string;
}, now = Date.now()) {
  if (input.provider !== "mollie" || (input.status !== "pending" && input.status !== "authorized") || !input.checkoutUrl) {
    return null;
  }

  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now) {
    return null;
  }

  try {
    const url = new URL(input.checkoutUrl);
    const isMollieHost = url.hostname === "mollie.com" || url.hostname.endsWith(".mollie.com");
    return url.protocol === "https:" && isMollieHost ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveMollieApplicationUrl(returnUrl: string, configuredAppUrl?: string) {
  const parsedReturnUrl = new URL(returnUrl);
  if (parsedReturnUrl.protocol !== "https:" && parsedReturnUrl.hostname !== "localhost") {
    throw new Error("Return URL must use HTTPS");
  }

  if (!configuredAppUrl) return parsedReturnUrl.origin;

  const parsedAppUrl = new URL(configuredAppUrl);
  if (parsedReturnUrl.origin !== parsedAppUrl.origin) {
    throw new Error("Return URL must use the application origin");
  }

  return parsedAppUrl.origin;
}

function parseMollieAmountCents(value: string) {
  const match = /^(\d+)\.(\d{2})$/.exec(value);
  if (!match) {
    throw new Error("Mollie amount has an invalid format");
  }

  const cents = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(cents)) {
    throw new Error("Mollie amount is outside the supported range");
  }

  return cents;
}

async function readBoundedBody(stream: ReadableStream<Uint8Array> | null, maximumBytes: number) {
  if (!stream) return "";

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > maximumBytes) {
      await reader.cancel();
      throw new MollieWebhookRequestError("Mollie webhook body is too large", 413);
    }
    result += decoder.decode(value, { stream: true });
  }

  return result + decoder.decode();
}
