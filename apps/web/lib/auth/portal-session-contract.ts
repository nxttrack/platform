export const CHILD_PORTAL_CONTEXT_VERSION = 1 as const;

export const childPortalCapabilities = [
  "today.read",
  "journey.read_child_safe",
  "badges.read_child_safe",
  "schedule.read_child_safe",
  "achievements.read_child_safe",
  "approved_media.read_child_safe",
  "child_preferences.write_safe",
  "parent_request.create_safe"
] as const;

export type ChildPortalCapability = (typeof childPortalCapabilities)[number];

export type ChildPortalSessionContext = {
  mode: "child";
  sessionId: string;
  userId: string;
  tenantId: string;
  participantId: string;
  contextVersion: typeof CHILD_PORTAL_CONTEXT_VERSION;
  capabilities: readonly ChildPortalCapability[];
  expiresAt: string;
};

export type LockedPortalSessionContext = {
  mode: "locked";
  sessionId: string;
  userId: string;
  tenantId: string;
  participantId: string;
  contextVersion: typeof CHILD_PORTAL_CONTEXT_VERSION;
  expiresAt: string;
  lockedAt: string;
  lockReason: string;
};

export type PortalSessionContext =
  | ChildPortalSessionContext
  | LockedPortalSessionContext
  | { mode: "parent" };

export function isChildPortalCapability(value: string): value is ChildPortalCapability {
  return childPortalCapabilities.includes(value as ChildPortalCapability);
}

export function parseChildPortalSessionContext(value: unknown): ChildPortalSessionContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const rawCapabilities = Array.isArray(row.capabilities) ? row.capabilities : [];
  const capabilities = rawCapabilities.every((item) =>
    typeof item === "string" && isChildPortalCapability(item))
    ? rawCapabilities as ChildPortalCapability[]
    : [];
  if (
    row.mode !== "child"
    || typeof row.sessionId !== "string"
    || typeof row.userId !== "string"
    || typeof row.tenantId !== "string"
    || typeof row.participantId !== "string"
    || row.contextVersion !== CHILD_PORTAL_CONTEXT_VERSION
    || typeof row.expiresAt !== "string"
    || rawCapabilities.length !== childPortalCapabilities.length
    || capabilities.length !== childPortalCapabilities.length
    || childPortalCapabilities.some((capability) => !capabilities.includes(capability))
  ) return null;
  return {
    mode: "child",
    sessionId: row.sessionId,
    userId: row.userId,
    tenantId: row.tenantId,
    participantId: row.participantId,
    contextVersion: CHILD_PORTAL_CONTEXT_VERSION,
    capabilities,
    expiresAt: row.expiresAt
  };
}

export function parsePortalSessionContext(value: unknown): PortalSessionContext | null {
  if (value === null || typeof value === "undefined") return { mode: "parent" };
  const child = parseChildPortalSessionContext(value);
  if (child) return child;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    row.mode !== "locked"
    || typeof row.sessionId !== "string"
    || typeof row.userId !== "string"
    || typeof row.tenantId !== "string"
    || typeof row.participantId !== "string"
    || row.contextVersion !== CHILD_PORTAL_CONTEXT_VERSION
    || typeof row.expiresAt !== "string"
    || typeof row.lockedAt !== "string"
    || typeof row.lockReason !== "string"
    || row.lockReason.length < 1
    || !Array.isArray(row.capabilities)
    || row.capabilities.length !== 0
  ) return null;
  return {
    mode: "locked",
    sessionId: row.sessionId,
    userId: row.userId,
    tenantId: row.tenantId,
    participantId: row.participantId,
    contextVersion: CHILD_PORTAL_CONTEXT_VERSION,
    expiresAt: row.expiresAt,
    lockedAt: row.lockedAt,
    lockReason: row.lockReason
  };
}
