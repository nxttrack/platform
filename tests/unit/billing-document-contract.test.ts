import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BILLING_DOCUMENT_RENDERER_VERSION,
  BILLING_DOCUMENT_TEMPLATE_VERSION,
  calculateInclusiveVat,
  isFinalBillingDocument
} from "../../apps/web/lib/domain/billing-document-contract";

const invoiceMigration = readFileSync(
  new URL("../../supabase/migrations/20260802200000_immutable_billing_documents.sql", import.meta.url),
  "utf8"
);
const offeringMigration = readFileSync(
  new URL("../../supabase/migrations/20260802210000_holidays_and_paid_offerings.sql", import.meta.url),
  "utf8"
);

test("21%-btw wordt uit een consumentenprijs inclusief btw gehaald", () => {
  assert.deepEqual(calculateInclusiveVat(10_000, 2100), {
    grossCents: 10_000,
    netCents: 8_264,
    rateBasisPoints: 2100,
    vatCents: 1_736
  });
  assert.deepEqual(calculateInclusiveVat(1_210, 2100), {
    grossCents: 1_210,
    netCents: 1_000,
    rateBasisPoints: 2100,
    vatCents: 210
  });
  assert.throws(() => calculateInclusiveVat(10.5, 2100), /integer/);
});

test("alleen een gehashte, gefinaliseerde documentstate geldt als definitief", () => {
  assert.equal(BILLING_DOCUMENT_TEMPLATE_VERSION, "invoice_standard_v1");
  assert.equal(BILLING_DOCUMENT_RENDERER_VERSION, "billing_pdf_v1");
  assert.equal(isFinalBillingDocument({
    content_hash: "a".repeat(64),
    finalized_at: "2026-08-02T12:00:00Z",
    status: "issued"
  }), true);
  assert.equal(isFinalBillingDocument({
    content_hash: null,
    finalized_at: null,
    status: "draft"
  }), false);
});

test("facturen en creditnota's zijn server-side, genummerd en immutable", () => {
  assert.match(invoiceMigration, /default_vat_rate_basis_points integer not null default 2100/i);
  assert.match(invoiceMigration, /next_billing_document_number/i);
  assert.match(invoiceMigration, /for update/i);
  assert.match(invoiceMigration, /issue_invoice_for_payment/i);
  assert.match(invoiceMigration, /issue_credit_note/i);
  assert.match(invoiceMigration, /Final billing document content is immutable/i);
  assert.match(invoiceMigration, /domain_command_receipts/i);
  assert.match(invoiceMigration, /original_invoice_id/i);
  assert.match(invoiceMigration, /revoke insert, update, delete on public\.billing_invoices from authenticated/i);
});

test("de factuurmigratie behoudt alle bestaande billing-eventtypen", () => {
  assert.match(invoiceMigration, /'mandate_activated'/);
  assert.match(invoiceMigration, /'reconciliation_exception'/);
  assert.match(invoiceMigration, /'mandate_valid'/);
  assert.match(invoiceMigration, /'invoice_issued'/);
  assert.match(invoiceMigration, /'credit_note_issued'/);
});

test("tijdelijk aanbod gebruikt holds, fysieke capaciteit en providerbetaling zonder automatische plaatsing", () => {
  assert.match(offeringMigration, /offering_registrations/i);
  assert.match(offeringMigration, /hold_expires_at/i);
  assert.match(offeringMigration, /for update/i);
  assert.match(offeringMigration, /Physical group capacity exceeded/i);
  assert.match(offeringMigration, /confirm_offering_registration_from_payment/i);
  assert.match(offeringMigration, /payment_review/i);
  assert.match(offeringMigration, /payment_mode in \('free', 'manual', 'direct_mollie', 'periodic_debit'\)/i);
  assert.match(offeringMigration, /schedule_occurrence_exceptions/i);
  assert.match(offeringMigration, /finalInvoicesWillBeChanged', false/i);
  assert.match(offeringMigration, /season_financial_adjustment_proposals/i);
});
