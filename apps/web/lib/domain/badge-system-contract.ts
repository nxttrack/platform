export const badgeGenders = ["boy", "girl", "unknown"] as const;
export const badgeAudiences = ["all", "boys", "girls"] as const;
export const badgeFormats = ["square", "story", "landscape", "certificate"] as const;

export type BadgeGender = (typeof badgeGenders)[number];
export type BadgeAudience = (typeof badgeAudiences)[number];
export type BadgeFormat = (typeof badgeFormats)[number];

export type GenderedCopy = {
  default: string;
  boy?: string | null;
  girl?: string | null;
};

export type BadgeLayer = {
  id: string;
  type: "text" | "shape" | "badge" | "logo" | "decoration" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  assetId?: string;
  alt?: string;
  objectFit?: "contain" | "cover";
  text?: string;
  fill?: string;
  opacity?: number;
  fontSize?: number;
  fontWeight?: number;
  align?: "left" | "center" | "right";
  locked?: boolean;
  hidden?: boolean;
};

export type BadgeStudioAsset = {
  id: string;
  mimeType: "image/jpeg" | "image/png";
  name: string;
  signedUrl: string;
  sizeBytes: number;
};

export type BadgeTriggerDefinition = {
  badgeKey: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
};

export const badgeFormatDimensions: Record<BadgeFormat, { height: number; label: string; width: number }> = {
  square: { height: 1080, label: "Vierkant", width: 1080 },
  story: { height: 1920, label: "Story", width: 1080 },
  landscape: { height: 630, label: "Liggend", width: 1200 },
  certificate: { height: 1131, label: "Certificaat", width: 1600 }
};

export function normalizeBadgeGender(value: unknown): BadgeGender {
  return badgeGenders.includes(value as BadgeGender) ? (value as BadgeGender) : "unknown";
}

export function badgeMatchesAudience(gender: BadgeGender, audience: BadgeAudience) {
  if (audience === "all") return true;
  if (gender === "unknown") return false;
  return audience === "boys" ? gender === "boy" : gender === "girl";
}

export function resolveGenderedCopy(copy: GenderedCopy, gender: BadgeGender) {
  if (gender === "boy" && copy.boy?.trim()) return copy.boy.trim();
  if (gender === "girl" && copy.girl?.trim()) return copy.girl.trim();
  return copy.default.trim();
}

export function resolveBadgeShortcodes(
  template: string,
  input: {
    badgeDescription: string;
    badgeName: string;
    childFirstName: string;
    gender: BadgeGender;
    organizationName?: string;
  }
) {
  const genderLabel = input.gender === "boy" ? "jongen" : input.gender === "girl" ? "meisje" : "kind";
  const values: Record<string, string> = {
    badge_description_gendered: input.badgeDescription,
    badge_name_gendered: input.badgeName,
    child_first_name: firstNameOnly(input.childFirstName),
    child_gender_label: genderLabel,
    organization_name: input.organizationName ?? "de zwemschool",
    subject_pronoun: input.gender === "boy" ? "hij" : input.gender === "girl" ? "zij" : "die",
    possessive_pronoun: input.gender === "boy" ? "zijn" : input.gender === "girl" ? "haar" : "diens"
  };

  return template.replace(/\{([a-z0-9_]+)\}/g, (match, key: string) => values[key] ?? match);
}

export function firstNameOnly(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || "Kind";
}

export function validateBadgeLayers(value: unknown): BadgeLayer[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((layer) => {
    if (!layer || typeof layer !== "object") return [];
    const record = layer as Record<string, unknown>;
    const type = record.type;
    if (!["text", "shape", "badge", "logo", "decoration", "image"].includes(String(type))) return [];
    const assetId = optionalUuid(record.assetId);
    if (type === "image" && !assetId) return [];

    return [{
      id: cleanText(record.id, "layer"),
      type: type as BadgeLayer["type"],
      x: clampNumber(record.x, 0, 2400),
      y: clampNumber(record.y, 0, 2400),
      width: clampNumber(record.width, 24, 2400),
      height: clampNumber(record.height, 24, 2400),
      assetId,
      alt: optionalText(record.alt, 200),
      objectFit: ["contain", "cover"].includes(String(record.objectFit)) ? record.objectFit as BadgeLayer["objectFit"] : "contain",
      text: optionalText(record.text),
      fill: optionalText(record.fill),
      opacity: clampNumber(record.opacity ?? 1, 0, 1),
      fontSize: clampNumber(record.fontSize ?? 32, 10, 240),
      fontWeight: clampNumber(record.fontWeight ?? 600, 100, 900),
      align: ["left", "center", "right"].includes(String(record.align)) ? record.align as BadgeLayer["align"] : "center",
      locked: record.locked === true,
      hidden: record.hidden === true
    }];
  });
}

export function badgeAwardKey(input: {
  badgeKey: string;
  eventEntityId?: string | null;
  participantId: string;
}) {
  const eventScope = input.eventEntityId?.trim() || "lifetime";
  return `${input.participantId}:${input.badgeKey}:${eventScope}`.slice(0, 240);
}

export function selectTriggerCandidates(
  definitions: BadgeTriggerDefinition[],
  eventType: string,
  eventContext: Record<string, unknown>
) {
  return definitions.filter((definition) => {
    if (definition.triggerType !== eventType) return false;
    const requiredCount = readNumber(definition.triggerConfig.count);
    const actualCount = readNumber(eventContext.count);
    if (requiredCount !== null && (actualCount === null || actualCount < requiredCount)) return false;
    const requiredSkill = optionalText(definition.triggerConfig.skill);
    if (requiredSkill && requiredSkill !== optionalText(eventContext.skill)) return false;
    const requiredStage = readNumber(definition.triggerConfig.stage);
    if (requiredStage !== null && requiredStage !== readNumber(eventContext.stage)) return false;
    const requiredCertificate = optionalText(definition.triggerConfig.certificate);
    if (requiredCertificate && requiredCertificate !== optionalText(eventContext.certificate)) return false;
    return true;
  });
}

function clampNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return minimum;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function readNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalText(value: unknown, maxLength = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function optionalUuid(value: unknown) {
  const normalized = optionalText(value, 36);
  return normalized && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : undefined;
}

function cleanText(value: unknown, fallback: string) {
  return optionalText(value) ?? fallback;
}
