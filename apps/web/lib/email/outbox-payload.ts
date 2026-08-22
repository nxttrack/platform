import type { TransactionalEmailInput } from "./transactional";

export function parseTransactionalEmailPayload(value: unknown): TransactionalEmailInput | null {
  if (!isRecord(value)) return null;
  const to = requiredString(value.to, 320);
  const subject = requiredHeaderString(value.subject, 500);
  const text = requiredString(value.text, 65_536);

  if (!to || !subject || !text || !isEmail(to)) return null;

  return {
    fromName: optionalHeaderString(value.fromName, 200),
    html: optionalString(value.html, 65_536) ?? undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
    organizationName: optionalHeaderString(value.organizationName, 200),
    recipientUserId: optionalUuid(value.recipientUserId),
    relatedId: optionalUuid(value.relatedId),
    relatedType: optionalString(value.relatedType, 80),
    subject,
    templateKey: optionalString(value.templateKey, 80) ?? undefined,
    tenantId: optionalUuid(value.tenantId),
    text,
    to
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, maximumLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= maximumLength ? normalized : null;
}

function optionalString(value: unknown, maximumLength: number) {
  if (value === null || value === undefined || value === "") return null;
  return requiredString(value, maximumLength);
}

function requiredHeaderString(value: unknown, maximumLength: number) {
  const normalized = requiredString(value, maximumLength);
  return normalized && !/[\u0000-\u001f\u007f]/.test(normalized) ? normalized : null;
}

function optionalHeaderString(value: unknown, maximumLength: number) {
  if (value === null || value === undefined || value === "") return null;
  return requiredHeaderString(value, maximumLength);
}

function optionalUuid(value: unknown) {
  const normalized = optionalString(value, 36);
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function isEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}
