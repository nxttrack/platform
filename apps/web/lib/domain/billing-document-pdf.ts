import "server-only";

import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import sharp from "sharp";

import { formatVatRate } from "./billing-document-contract";

type InvoicePdfDocument = {
  content_hash: string;
  correction_reason: string | null;
  currency: string;
  default_vat_rate_basis_points: number;
  document_type: "invoice" | "credit_note";
  due_on: string | null;
  invoice_number: string;
  issued_on: string;
  issuer_snapshot_json: Record<string, unknown>;
  original_invoice_id: string | null;
  paid_on: string | null;
  recipient_snapshot_json: Record<string, unknown>;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
};

type InvoicePdfLine = {
  description: string;
  gross_amount_cents: number;
  net_amount_cents: number;
  quantity: number;
  tax_rate_basis_points: number;
  vat_amount_cents: number;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 46;
const blue = rgb(0.075, 0.255, 0.545);
const navy = rgb(0.04, 0.11, 0.2);
const gray = rgb(0.39, 0.43, 0.49);
const pale = rgb(0.95, 0.97, 1);

export async function renderBillingDocumentPdf(input: {
  document: InvoicePdfDocument;
  lines: InvoicePdfLine[];
}) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await loadInvoiceLogo(input.document.issuer_snapshot_json.logo_url);
  const embeddedLogo = logo ? await pdf.embedPng(logo) : null;
  const page = pdf.addPage([pageWidth, pageHeight]);
  const documentLabel = input.document.document_type === "credit_note" ? "CREDITNOTA" : "FACTUUR";

  page.drawRectangle({ color: blue, height: 10, width: pageWidth, x: 0, y: pageHeight - 10 });
  if (embeddedLogo) {
    const dimensions = embeddedLogo.scaleToFit(145, 58);
    page.drawImage(embeddedLogo, {
      height: dimensions.height,
      width: dimensions.width,
      x: margin,
      y: pageHeight - 95
    });
  } else {
    drawText(page, bold, issuer(input.document, "trade_name") || issuer(input.document, "legal_name") || "NXTTRACK", margin, pageHeight - 62, 18, navy);
  }

  drawText(page, bold, documentLabel, 390, pageHeight - 55, 20, blue);
  drawText(page, bold, input.document.invoice_number, 390, pageHeight - 76, 11, navy);
  drawText(page, regular, `Uitgiftedatum: ${formatDate(input.document.issued_on)}`, 390, pageHeight - 94, 9, gray);
  drawText(page, regular, `Vervaldatum: ${input.document.due_on ? formatDate(input.document.due_on) : "n.v.t."}`, 390, pageHeight - 108, 9, gray);

  drawAddressBlock(page, regular, bold, input.document, margin, pageHeight - 145);
  drawRecipientBlock(page, regular, bold, input.document, 320, pageHeight - 145);

  let y = pageHeight - 270;
  page.drawRectangle({ color: pale, height: 28, width: pageWidth - margin * 2, x: margin, y: y - 7 });
  drawText(page, bold, "Omschrijving", margin + 8, y + 3, 9, navy);
  drawText(page, bold, "Aantal", 335, y + 3, 9, navy);
  drawText(page, bold, "Btw", 388, y + 3, 9, navy);
  drawText(page, bold, "Excl.", 439, y + 3, 9, navy);
  drawText(page, bold, "Incl.", 500, y + 3, 9, navy);
  y -= 30;

  for (const line of input.lines.slice(0, 12)) {
    const descriptions = wrapText(line.description, 52);
    drawText(page, regular, descriptions[0] ?? "", margin + 8, y, 9, navy);
    if (descriptions[1]) {
      drawText(page, regular, descriptions[1], margin + 8, y - 12, 8, gray);
    }
    drawText(page, regular, formatQuantity(line.quantity), 337, y, 9, navy);
    drawText(page, regular, formatVatRate(line.tax_rate_basis_points), 390, y, 9, navy);
    drawRightText(page, regular, formatMoney(line.net_amount_cents, input.document.currency), 484, y, 9, navy);
    drawRightText(page, regular, formatMoney(line.gross_amount_cents, input.document.currency), 548, y, 9, navy);
    page.drawLine({ color: rgb(0.88, 0.9, 0.93), end: { x: pageWidth - margin, y: y - 18 }, start: { x: margin, y: y - 18 }, thickness: 0.7 });
    y -= descriptions[1] ? 42 : 30;
  }

  y = Math.max(250, y - 12);
  drawSummaryLine(page, regular, "Subtotaal excl. btw", input.document.subtotal_cents, input.document.currency, y);
  y -= 20;
  drawSummaryLine(page, regular, `Btw ${formatVatRate(input.document.default_vat_rate_basis_points)}`, input.document.tax_cents, input.document.currency, y);
  y -= 28;
  page.drawRectangle({ color: blue, height: 34, width: 220, x: pageWidth - margin - 220, y: y - 8 });
  drawText(page, bold, input.document.document_type === "credit_note" ? "Te crediteren" : "Totaal", pageWidth - margin - 210, y + 3, 11, rgb(1, 1, 1));
  drawRightText(page, bold, formatMoney(input.document.total_cents, input.document.currency), pageWidth - margin - 10, y + 3, 11, rgb(1, 1, 1));

  const detailsY = 175;
  if (input.document.document_type === "credit_note") {
    drawText(page, bold, "Correctie", margin, detailsY, 10, navy);
    drawParagraph(page, regular, input.document.correction_reason ?? "Correctie op eerdere factuur.", margin, detailsY - 16, 74, 9, gray);
  } else {
    drawText(page, bold, input.document.status === "paid" ? "Betaald" : "Betaling", margin, detailsY, 10, navy);
    const iban = issuer(input.document, "iban");
    const paymentText = input.document.status === "paid"
      ? `Betaald op ${input.document.paid_on ? formatDate(input.document.paid_on) : formatDate(input.document.issued_on)}.`
      : iban
        ? `Maak het totaal over naar ${iban} onder vermelding van ${input.document.invoice_number}.`
        : `Voldoe deze factuur uiterlijk op ${input.document.due_on ? formatDate(input.document.due_on) : "de afgesproken datum"}.`;
    drawParagraph(page, regular, paymentText, margin, detailsY - 16, 74, 9, gray);
  }

  drawText(page, regular, `Documentversie invoice_standard_v1 · verificatie ${input.document.content_hash.slice(0, 16)}`, margin, 40, 7.5, gray);
  drawRightText(page, regular, issuer(input.document, "billing_email"), pageWidth - margin, 40, 7.5, gray);

  pdf.setTitle(`${documentLabel} ${input.document.invoice_number}`);
  pdf.setAuthor(issuer(input.document, "legal_name") || "NXTTRACK");
  pdf.setProducer("NXTTRACK billing_pdf_v1");
  pdf.setCreationDate(new Date(`${input.document.issued_on}T12:00:00.000Z`));
  pdf.setModificationDate(new Date(`${input.document.issued_on}T12:00:00.000Z`));

  return pdf.save({ addDefaultPage: false, useObjectStreams: true });
}

async function loadInvoiceLogo(value: unknown) {
  if (typeof value !== "string") return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some((address) => isPrivateAddress(address.address))) return null;

    const response = await fetch(url, {
      cache: "no-store",
      headers: { accept: "image/png,image/jpeg,image/webp" },
      redirect: "error",
      signal: AbortSignal.timeout(3_000)
    });
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
    if (!response.ok || !["image/png", "image/jpeg", "image/webp"].includes(contentType ?? "") || contentLength > 1_000_000) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1_000_000) return null;

    return sharp(bytes)
      .resize({ fit: "inside", height: 116, withoutEnlargement: true, width: 290 })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    parts[0] === 0
  );
}

function drawAddressBlock(page: PDFPage, regular: PDFFont, bold: PDFFont, document: InvoicePdfDocument, x: number, y: number) {
  drawText(page, bold, "Van", x, y, 9, blue);
  const values = [
    issuer(document, "legal_name"),
    issuer(document, "address_line_1"),
    issuer(document, "address_line_2"),
    [issuer(document, "postal_code"), issuer(document, "city")].filter(Boolean).join(" "),
    issuer(document, "country_code"),
    issuer(document, "chamber_of_commerce_number") ? `KvK ${issuer(document, "chamber_of_commerce_number")}` : "",
    issuer(document, "vat_number") ? `Btw ${issuer(document, "vat_number")}` : ""
  ].filter(Boolean);
  values.forEach((value, index) => drawText(page, index === 0 ? bold : regular, value, x, y - 17 - index * 13, index === 0 ? 10 : 8.5, index === 0 ? navy : gray));
}

function drawRecipientBlock(page: PDFPage, regular: PDFFont, bold: PDFFont, document: InvoicePdfDocument, x: number, y: number) {
  drawText(page, bold, "Aan", x, y, 9, blue);
  const values = [
    recipient(document, "guardian_name"),
    recipient(document, "guardian_email"),
    recipient(document, "participant_name") ? `Leerling: ${recipient(document, "participant_name")}` : ""
  ].filter(Boolean);
  values.forEach((value, index) => drawText(page, index === 0 ? bold : regular, value, x, y - 17 - index * 14, index === 0 ? 10 : 8.5, index === 0 ? navy : gray));
}

function drawSummaryLine(page: PDFPage, font: PDFFont, label: string, cents: number, currency: string, y: number) {
  drawText(page, font, label, pageWidth - margin - 210, y, 9, gray);
  drawRightText(page, font, formatMoney(cents, currency), pageWidth - margin - 10, y, 9, navy);
}

function drawText(page: PDFPage, font: PDFFont, value: string, x: number, y: number, size: number, color = navy) {
  page.drawText(toWinAnsi(value), { color, font, size, x, y });
}

function drawRightText(page: PDFPage, font: PDFFont, value: string, right: number, y: number, size: number, color = navy) {
  const safe = toWinAnsi(value);
  drawText(page, font, safe, right - font.widthOfTextAtSize(safe, size), y, size, color);
}

function drawParagraph(page: PDFPage, font: PDFFont, value: string, x: number, y: number, width: number, size: number, color = gray) {
  wrapText(value, width).slice(0, 3).forEach((line, index) => drawText(page, font, line, x, y - index * 13, size, color));
}

function issuer(document: InvoicePdfDocument, key: string) {
  return scalar(document.issuer_snapshot_json[key]);
}

function recipient(document: InvoicePdfDocument, key: string) {
  return scalar(document.recipient_snapshot_json[key]);
}

function scalar(value: unknown) {
  return typeof value === "string" ? value : "";
}

function formatMoney(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toLocaleString("nl-NL", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}-${month}-${year}`;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}

function wrapText(value: string, maxCharacters: number) {
  const words = toWinAnsi(value).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function toWinAnsi(value: string) {
  return value.normalize("NFC").replace(/[^\u0020-\u007e\u00a0-\u00ff]/g, "?");
}
