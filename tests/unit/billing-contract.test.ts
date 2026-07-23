import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  assertMollieSecretMode,
  getMollieAccountLast4,
  getSafeMollieCheckoutUrl,
  isMollieCustomerId,
  isMollieMandateId,
  MollieWebhookRequestError,
  normalizeMollieStatus,
  readClassicMollieWebhookId,
  resolveMollieApplicationUrl,
  validateMolliePaymentSnapshot
} from "../../apps/web/lib/domain/mollie-contract";
import {
  isMatchingPaymentSessionRetry,
  isProviderConfigReady,
  readPaymentIdempotencyKey
} from "../../apps/web/lib/domain/payment-provider";

describe("Mollie credential contract", () => {
  it("accepts only a credential matching the configured mode", () => {
    assert.equal(assertMollieSecretMode("test_example", "test", "MOLLIE_API_KEY"), "test_example");
    assert.throws(() => assertMollieSecretMode("live_example", "test", "MOLLIE_API_KEY"), /does not match test mode/);
    assert.throws(() => assertMollieSecretMode(undefined, "live", "MOLLIE_API_KEY"), /is not configured/);
  });
});

describe("Mollie recurring identifiers and account masking", () => {
  it("accepts only provider-shaped customer and mandate ids", () => {
    assert.equal(isMollieCustomerId("cst_abc123"), true);
    assert.equal(isMollieCustomerId("mdt_abc123"), false);
    assert.equal(isMollieMandateId("mdt_abc123"), true);
    assert.equal(isMollieMandateId("cst_abc123"), false);
  });

  it("stores only a validated account suffix", () => {
    assert.equal(getMollieAccountLast4("NL55 INGB 0000 0000 00"), "0000");
    assert.equal(getMollieAccountLast4("not-an-account"), null);
    assert.equal(getMollieAccountLast4(null), null);
  });

  it("keeps recurring collection behind consent, pre-notification and an explicit feature switch", () => {
    const actions = readFileSync("apps/web/lib/domain/billing-recurring-actions.ts", "utf8");
    assert.match(actions, /consentAccepted"\) !== "accepted"/);
    assert.match(actions, /recurring_enabled !== true/);
    assert.match(actions, /prenotification_delivery_status !== "sent"/);
    assert.match(actions, /new Date\(attempt\.scheduled_for\)\.getTime\(\) > Date\.now\(\)/);
    assert.match(actions, /sequence_type: "first"/);
    assert.match(actions, /sequence_type: "recurring"/);
  });

  it("activates mandates and records recurring failures only from verified webhooks", () => {
    const webhook = readFileSync("apps/web/app/api/webhooks/mollie/route.ts", "utf8");
    assert.match(webhook, /validateMolliePaymentSnapshot/);
    assert.match(webhook, /listMollieMandates/);
    assert.match(webhook, /type: "mandate_activated"/);
    assert.match(webhook, /type: "payment_failed"/);
    assert.match(webhook, /collection_attempt_id/);
  });
});

describe("checkout idempotency contract", () => {
  const key = "123e4567-e89b-42d3-a456-426614174000";

  it("accepts UUID v4 keys and rejects arbitrary values", () => {
    assert.equal(readPaymentIdempotencyKey(key.toUpperCase()), key);
    assert.equal(readPaymentIdempotencyKey("not-a-key"), null);
  });

  it("reuses a key only for the exact payment, provider, amount and currency", () => {
    const candidate = {
      amount_cents: 1250,
      currency: "EUR",
      id: "session-1",
      manual_payment_id: "payment-1",
      provider_config_id: "provider-1"
    };

    assert.equal(isMatchingPaymentSessionRetry(candidate, {
      amountCents: 1250,
      currency: "EUR",
      manualPaymentId: "payment-1",
      providerConfigId: "provider-1"
    }), true);
    assert.equal(isMatchingPaymentSessionRetry(candidate, {
      amountCents: 1251,
      currency: "EUR",
      manualPaymentId: "payment-1",
      providerConfigId: "provider-1"
    }), false);
  });

  it("keeps unfinished provider types inactive", () => {
    const base = {
      display_name: "Provider",
      id: "provider-1",
      mode: "test",
      secret_reference: "ENV:MOLLIE_API_KEY",
      status: "active"
    };

    assert.equal(isProviderConfigReady({ ...base, provider: "mollie" }), true);
    assert.equal(isProviderConfigReady({ ...base, provider: "ideal" }), false);
    assert.equal(isProviderConfigReady({ ...base, provider: "other" }), false);
  });
});

describe("classic Mollie webhook contract", () => {
  it("reads a form-urlencoded payment id", async () => {
    const request = new Request("https://example.test/api/webhooks/mollie", {
      body: "id=tr_abc123",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    });

    assert.equal(await readClassicMollieWebhookId(request), "tr_abc123");
  });

  it("rejects unsupported content types", async () => {
    const request = new Request("https://example.test/api/webhooks/mollie", {
      body: JSON.stringify({ id: "tr_abc123" }),
      headers: { "content-type": "application/json" },
      method: "POST"
    });

    await assert.rejects(() => readClassicMollieWebhookId(request), (error: unknown) => {
      return error instanceof MollieWebhookRequestError && error.status === 415;
    });
  });

  it("rejects a chunked body that exceeds the actual byte limit", async () => {
    const request = new Request("https://example.test/api/webhooks/mollie", {
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`id=tr_${"a".repeat(100)}`));
          controller.close();
        }
      }),
      duplex: "half",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST"
    } as RequestInit & { duplex: "half" });

    await assert.rejects(() => readClassicMollieWebhookId(request, 32), (error: unknown) => {
      return error instanceof MollieWebhookRequestError && error.status === 413;
    });
  });

  it("returns bounded operational reason codes without provider details", () => {
    const source = readFileSync("apps/web/app/api/webhooks/mollie/route.ts", "utf8");
    assert.match(source, /reason: "session_lookup"/);
    assert.match(source, /reason: "provider_config"/);
    assert.match(source, /reason: `processing_\$\{processingStage\}`/);
    assert.match(source, /providerEvent\.error\.code !== "23505"/);
    assert.match(source, /errorEvent\.error\.code !== "23505"/);
    assert.doesNotMatch(source, /payment_provider_events"\)\.upsert/);
    assert.doesNotMatch(source, /reason: sessionResult\.error/);
    assert.doesNotMatch(source, /reason: configResult\.error/);
  });
});

describe("provider-verified payment state", () => {
  const session = {
    amountCents: 1250,
    currency: "EUR",
    id: "session-1",
    manualPaymentId: "payment-1",
    tenantId: "tenant-1"
  };

  it("normalizes every classic payment status", () => {
    assert.equal(normalizeMollieStatus("open"), "pending");
    assert.equal(normalizeMollieStatus("authorized"), "authorized");
    assert.equal(normalizeMollieStatus("paid"), "paid");
    assert.equal(normalizeMollieStatus("expired"), "expired");
    assert.equal(normalizeMollieStatus("canceled"), "cancelled");
    assert.equal(normalizeMollieStatus("failed"), "failed");
  });

  it("accepts exact metadata, currency and decimal amount", () => {
    assert.doesNotThrow(() => validateMolliePaymentSnapshot({
      payment: {
        amount: { currency: "EUR", value: "12.50" },
        metadata: { manualPaymentId: "payment-1", paymentSessionId: "session-1", tenantId: "tenant-1" }
      },
      session
    }));
  });

  it("rejects mismatched metadata and imprecise amounts", () => {
    assert.throws(() => validateMolliePaymentSnapshot({
      payment: {
        amount: { currency: "EUR", value: "12.50" },
        metadata: { manualPaymentId: "payment-2", paymentSessionId: "session-1", tenantId: "tenant-1" }
      },
      session
    }), /metadata/);
    assert.throws(() => validateMolliePaymentSnapshot({
      payment: {
        amount: { currency: "EUR", value: "12.5" },
        metadata: { manualPaymentId: "payment-1", paymentSessionId: "session-1", tenantId: "tenant-1" }
      },
      session
    }), /invalid format/);
  });
});

describe("parent checkout link contract", () => {
  it("allows only active HTTPS Mollie links", () => {
    assert.equal(getSafeMollieCheckoutUrl({
      checkoutUrl: "https://www.mollie.com/checkout/select-issuer/example",
      expiresAt: "2099-01-01T00:00:00.000Z",
      provider: "mollie",
      status: "pending"
    }), "https://www.mollie.com/checkout/select-issuer/example");
    assert.equal(getSafeMollieCheckoutUrl({
      checkoutUrl: "https://mollie.com.attacker.example/checkout",
      expiresAt: "2099-01-01T00:00:00.000Z",
      provider: "mollie",
      status: "pending"
    }), null);
    assert.equal(getSafeMollieCheckoutUrl({
      checkoutUrl: "https://www.mollie.com/checkout/example",
      expiresAt: "2020-01-01T00:00:00.000Z",
      provider: "mollie",
      status: "pending"
    }), null);
  });

  it("requires the configured application origin for provider returns", () => {
    assert.equal(
      resolveMollieApplicationUrl("https://staging.nxttrack.nl/portaal/betalingen", "https://staging.nxttrack.nl"),
      "https://staging.nxttrack.nl"
    );
    assert.throws(
      () => resolveMollieApplicationUrl("https://attacker.example/return", "https://staging.nxttrack.nl"),
      /application origin/
    );
    assert.throws(
      () => resolveMollieApplicationUrl("http://staging.nxttrack.nl/return"),
      /HTTPS/
    );
  });
});
