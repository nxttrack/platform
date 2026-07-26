export type ContentClassification = "operational" | "personal" | "sensitive" | "restricted";

export type ContentClassificationResult = {
  classification: ContentClassification;
  reasons: string[];
};

const rank: Record<ContentClassification, number> = {
  operational: 0,
  personal: 1,
  sensitive: 2,
  restricted: 3
};

const sensitivePatterns: Array<[RegExp, string]> = [
  [/\b(allerg(?:ie|isch)|medicat(?:ie|ijn)|diagnose|epilepsie|diabetes|astma)\b/i, "health_information"],
  [/\b(autisme|adhd|beperking|handicap|therapie|psycholoog|zorgverlener)\b/i, "health_or_support_information"],
  [/\b(religie|geloof|moslim|christen|joods|seksuele?\s+ori[eë]ntatie)\b/i, "special_category_information"]
];

const restrictedPatterns: Array<[RegExp, string]> = [
  [/\bNL\d{2}[A-Z]{4}\d{10}\b/i, "bank_account_number"],
  [/\b\d{9}\b/, "possible_government_identifier"],
  [/\b(?:sk|SG\.)[A-Za-z0-9._-]{20,}\b/, "possible_secret"]
];

const personalPatterns: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, "email_address"],
  [/\b(?:\+31|0)\s?6(?:[\s-]?\d){8}\b/, "phone_number"],
  [/\b\d{4}-\d{2}-\d{2}\b/, "date_of_birth_or_event"]
];

export function classifyContent(
  value: unknown,
  baseline: ContentClassification = "operational"
): ContentClassificationResult {
  let classification = baseline;
  const reasons = new Set<string>(baseline === "operational" ? [] : [`baseline_${baseline}`]);

  visitStrings(value, (text) => {
    for (const [pattern, reason] of restrictedPatterns) {
      if (pattern.test(text)) {
        classification = maxClassification(classification, "restricted");
        reasons.add(reason);
      }
    }
    for (const [pattern, reason] of sensitivePatterns) {
      if (pattern.test(text)) {
        classification = maxClassification(classification, "sensitive");
        reasons.add(reason);
      }
    }
    for (const [pattern, reason] of personalPatterns) {
      if (pattern.test(text)) {
        classification = maxClassification(classification, "personal");
        reasons.add(reason);
      }
    }
  });

  return { classification, reasons: [...reasons].sort() };
}

export function parseContentClassification(value: FormDataEntryValue | null, fallback: ContentClassification) {
  return value === "operational" || value === "personal" || value === "sensitive" || value === "restricted"
    ? value
    : fallback;
}

export function sanitizeImportedCell(value: string, maximumLength = 2_000) {
  if (value.includes("\0")) {
    throw new Error("Importcellen mogen geen NUL-tekens bevatten.");
  }

  const normalized = value.replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();

  if (normalized.length > maximumLength) {
    throw new Error(`Importcel is langer dan ${maximumLength} tekens.`);
  }

  return normalized;
}

function visitStrings(value: unknown, visitor: (value: string) => void, depth = 0) {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === "string") {
    visitor(value.slice(0, 100_000));
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 10_000)) visitStrings(entry, visitor, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 10_000)) {
      visitor(key);
      visitStrings(entry, visitor, depth + 1);
    }
  }
}

function maxClassification(left: ContentClassification, right: ContentClassification) {
  return rank[right] > rank[left] ? right : left;
}
