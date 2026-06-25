import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

type MollieWebhookPayload = {
  id: string | null;
  status: string | null;
};

type MolliePaymentResponse = {
  id: string;
  status: string;
};

type PaymentRecordForWebhook = {
  id: string;
  tenant_id: string;
  invoice_id: string | null;
};

type SepaItemForWebhook = {
  id: string;
  tenant_id: string;
  mandate_id: string | null;
  collection_run_id: string;
};

export async function POST(request: NextRequest) {
  const secretResult = verifyWebhookSecret(request);

  if (secretResult instanceof NextResponse) {
    return secretResult;
  }

  const payload = await parseWebhookPayload(request);

  if (!payload.id) {
    return NextResponse.json({ ok: false, error: "Missing Mollie payment id." }, { status: 400 });
  }

  const mollieStatus = await resolveMollieStatus(payload);

  if (!mollieStatus) {
    return NextResponse.json({ ok: true, ignored: true, reason: "No verifiable status available in this environment." }, { status: 202 });
  }

  const paymentStatus = mapPaymentStatus(mollieStatus);
  const sepaStatus = mapSepaItemStatus(mollieStatus);
  const admin = createAdminClient();
  const paymentRecord = await findPaymentRecord(admin, payload.id);
  const sepaItem = await findSepaItem(admin, payload.id);

  if (!paymentRecord && !sepaItem) {
    return NextResponse.json({ ok: true, ignored: true, reason: "Payment id not linked to NXTTRACK record." }, { status: 202 });
  }

  if (paymentRecord) {
    await admin
      .from("payment_records")
      .update({
        status: paymentStatus,
        received_on: paymentStatus === "paid" ? todayInput() : null,
        note: `Mollie webhook: ${mollieStatus}`,
        metadata: { source: "mollie_webhook", mollie_status: mollieStatus }
      })
      .eq("tenant_id", paymentRecord.tenant_id)
      .eq("id", paymentRecord.id);

    await admin.from("payment_events").insert({
      tenant_id: paymentRecord.tenant_id,
      invoice_id: paymentRecord.invoice_id,
      payment_record_id: paymentRecord.id,
      provider: "mollie",
      event_type: `mollie_${mollieStatus}`,
      payload: { provider_payment_id: payload.id, payment_status: paymentStatus },
      created_by_profile_id: null
    });
  }

  if (sepaItem) {
    await admin
      .from("sepa_collection_items")
      .update({
        status: sepaStatus,
        processed_at: ["paid", "failed", "cancelled"].includes(sepaStatus) ? new Date().toISOString() : null,
        failure_reason: sepaStatus === "failed" || sepaStatus === "cancelled" ? `Mollie status: ${mollieStatus}` : null,
        metadata: { source: "mollie_webhook", mollie_status: mollieStatus }
      })
      .eq("tenant_id", sepaItem.tenant_id)
      .eq("id", sepaItem.id);

    await admin.from("sepa_incasso_events").insert({
      tenant_id: sepaItem.tenant_id,
      mandate_id: sepaItem.mandate_id,
      collection_run_id: sepaItem.collection_run_id,
      collection_item_id: sepaItem.id,
      event_type: `mollie_${mollieStatus}`,
      payload: { provider_payment_id: payload.id, payment_status: sepaStatus },
      created_by_profile_id: null
    });

    await refreshSepaRunStatus(admin, sepaItem.tenant_id, sepaItem.collection_run_id);
  }

  return NextResponse.json({ ok: true, id: payload.id, status: mollieStatus });
}

function verifyWebhookSecret(request: NextRequest) {
  const expected = process.env.MOLLIE_WEBHOOK_SECRET;

  if (!expected || expected === "placeholder_add_later" || expected.startsWith("placeholder")) {
    return true;
  }

  const supplied = request.headers.get("x-nxttrack-webhook-secret") ?? request.nextUrl.searchParams.get("secret");

  if (supplied !== expected) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret." }, { status: 401 });
  }

  return true;
}

async function parseWebhookPayload(request: NextRequest): Promise<MollieWebhookPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    return {
      id: typeof body.id === "string" ? body.id : null,
      status: typeof body.status === "string" ? body.status : null
    };
  }

  const body = await request.text();
  const params = new URLSearchParams(body);

  return {
    id: params.get("id"),
    status: params.get("status")
  };
}

async function resolveMollieStatus(payload: MollieWebhookPayload) {
  const apiKey = process.env.MOLLIE_API_KEY;

  if (!apiKey || apiKey === "placeholder_add_later" || apiKey.startsWith("placeholder")) {
    return payload.status;
  }

  const response = await fetch(`https://api.mollie.com/v2/payments/${payload.id}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    return payload.status;
  }

  const payment = (await response.json()) as MolliePaymentResponse;

  return payment.status;
}

async function findPaymentRecord(admin: ReturnType<typeof createAdminClient>, providerPaymentId: string) {
  const result = await admin
    .from("payment_records")
    .select("id, tenant_id, invoice_id")
    .eq("provider", "mollie")
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();

  return (result.data as PaymentRecordForWebhook | null) ?? null;
}

async function findSepaItem(admin: ReturnType<typeof createAdminClient>, providerPaymentId: string) {
  const result = await admin
    .from("sepa_collection_items")
    .select("id, tenant_id, mandate_id, collection_run_id")
    .eq("provider_payment_id", providerPaymentId)
    .maybeSingle();

  return (result.data as SepaItemForWebhook | null) ?? null;
}

async function refreshSepaRunStatus(admin: ReturnType<typeof createAdminClient>, tenantId: string, runId: string) {
  const result = await admin.from("sepa_collection_items").select("status").eq("tenant_id", tenantId).eq("collection_run_id", runId);

  if (result.error) {
    return;
  }

  const statuses = ((result.data ?? []) as Array<{ status: string }>).map((row) => row.status);
  const terminal = statuses.filter((status) => ["paid", "failed", "cancelled", "skipped"].includes(status));

  if (statuses.length === 0 || terminal.length !== statuses.length) {
    await admin.from("sepa_collection_runs").update({ status: "processing" }).eq("tenant_id", tenantId).eq("id", runId);
    return;
  }

  const hasPaid = statuses.includes("paid");
  const hasFailed = statuses.some((status) => ["failed", "cancelled"].includes(status));
  const runStatus = hasFailed ? (hasPaid ? "partially_failed" : "failed") : "processed";

  await admin
    .from("sepa_collection_runs")
    .update({
      status: runStatus,
      completed_at: new Date().toISOString()
    })
    .eq("tenant_id", tenantId)
    .eq("id", runId);
}

function mapPaymentStatus(mollieStatus: string) {
  if (mollieStatus === "paid") {
    return "paid";
  }

  if (mollieStatus === "canceled") {
    return "cancelled";
  }

  if (["failed", "expired"].includes(mollieStatus)) {
    return "failed";
  }

  return "pending";
}

function mapSepaItemStatus(mollieStatus: string) {
  if (mollieStatus === "paid") {
    return "paid";
  }

  if (mollieStatus === "canceled") {
    return "cancelled";
  }

  if (["failed", "expired"].includes(mollieStatus)) {
    return "failed";
  }

  return "pending";
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}
