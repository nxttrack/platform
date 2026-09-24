import { NextResponse } from "next/server";

import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { renderBillingDocumentPdf } from "@/lib/domain/billing-document-pdf";
import { canManageTenantFiles, canViewParticipantFile } from "@/lib/domain/private-file-access";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const guard = await requireApiAuthenticatedContext(request);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const admin = createAdminClient();
  const documentResult = await admin
    .from("billing_invoices")
    .select("id, tenant_id, participant_id, guardian_user_id, invoice_number, status, issued_on, due_on, paid_on, subtotal_cents, tax_cents, total_cents, currency, document_type, original_invoice_id, issuer_snapshot_json, recipient_snapshot_json, default_vat_rate_basis_points, correction_reason, finalized_at, content_hash")
    .eq("id", id)
    .maybeSingle();

  if (documentResult.error || !documentResult.data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const document = documentResult.data;
  const allowed =
    canManageTenantFiles(guard.context, document.tenant_id) ||
    document.guardian_user_id === guard.context.user.id ||
    (document.participant_id
      ? await canViewParticipantFile(guard.context, {
          participantId: document.participant_id,
          tenantId: document.tenant_id
        })
      : false);
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (document.status === "draft" || !document.finalized_at || !document.content_hash || !document.invoice_number || !document.issued_on) {
    return NextResponse.json({ error: "not_final" }, { status: 409 });
  }

  const linesResult = await admin
    .from("billing_invoice_lines")
    .select("description, quantity, tax_rate_basis_points, net_amount_cents, vat_amount_cents, gross_amount_cents")
    .eq("tenant_id", document.tenant_id)
    .eq("invoice_id", document.id)
    .order("sort_order");
  if (linesResult.error) return NextResponse.json({ error: "render_unavailable" }, { status: 503 });

  try {
    const bytes = await renderBillingDocumentPdf({
      document: {
        ...document,
        document_type: document.document_type as "invoice" | "credit_note",
        issuer_snapshot_json: asRecord(document.issuer_snapshot_json),
        recipient_snapshot_json: asRecord(document.recipient_snapshot_json)
      },
      lines: (linesResult.data ?? []).map((line) => ({
        ...line,
        quantity: Number(line.quantity)
      }))
    });
    const safeName = document.invoice_number.replace(/[^A-Za-z0-9-]/g, "_");

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
        "Content-Security-Policy": "default-src 'none'",
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("[billing] PDF rendering failed", {
      documentId: document.id,
      error: error instanceof Error ? error.message : "unknown"
    });
    return NextResponse.json({ error: "render_unavailable" }, { status: 503 });
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
