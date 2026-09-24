export const BILLING_DOCUMENT_TEMPLATE_VERSION = "invoice_standard_v1";
export const BILLING_DOCUMENT_RENDERER_VERSION = "billing_pdf_v1";

export type InclusiveVatBreakdown = {
  grossCents: number;
  netCents: number;
  rateBasisPoints: 0 | 900 | 2100;
  vatCents: number;
};

export function calculateInclusiveVat(
  grossCents: number,
  rateBasisPoints: 0 | 900 | 2100
): InclusiveVatBreakdown {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) {
    throw new Error("Gross amount must be a non-negative integer number of cents.");
  }

  const vatCents =
    rateBasisPoints === 0
      ? 0
      : Math.round((grossCents * rateBasisPoints) / (10_000 + rateBasisPoints));

  return {
    grossCents,
    netCents: grossCents - vatCents,
    rateBasisPoints,
    vatCents
  };
}

export function formatVatRate(rateBasisPoints: number) {
  return `${new Intl.NumberFormat("nl-NL", {
    maximumFractionDigits: 2
  }).format(rateBasisPoints / 100)}%`;
}

export function isFinalBillingDocument(input: {
  content_hash: string | null;
  finalized_at: string | null;
  status: string;
}) {
  return (
    input.status !== "draft" &&
    Boolean(input.finalized_at) &&
    /^[0-9a-f]{64}$/.test(input.content_hash ?? "")
  );
}
