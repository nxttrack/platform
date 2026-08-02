export const swimPermissionKeys = [
  "curriculum.read",
  "curriculum.draft.manage",
  "curriculum.publish",
  "curriculum.migrate.preview",
  "curriculum.migrate.execute",
  "assessment.read",
  "assessment.record",
  "assessment.correct",
  "transition.review",
  "transition.approve",
  "transition.execute",
  "carryover.complete_previous",
  "badge.read",
  "badge.definition.manage",
  "badge.publish",
  "badge.award",
  "badge.award_remaining",
  "badge.revoke",
  "group.read",
  "group.manage",
  "group.publish",
  "planning.manage",
  "holiday.manage",
  "billing.read",
  "billing.manage",
  "invoice.issue",
  "invoice.credit",
  "analytics.read",
  "forecast.read",
  "forecast.hold.manage"
] as const;

export type SwimPermissionKey = (typeof swimPermissionKeys)[number];
export type TenantRole =
  | "tenant_owner"
  | "tenant_admin"
  | "tenant_staff"
  | "coordinator"
  | "instructor"
  | "parent"
  | "athlete";

const allPermissions = new Set<SwimPermissionKey>(swimPermissionKeys);
const readPermissions = new Set<SwimPermissionKey>([
  "curriculum.read",
  "assessment.read",
  "badge.read",
  "group.read"
]);

export function defaultPermissionsForRole(role: TenantRole): ReadonlySet<SwimPermissionKey> {
  if (role === "tenant_owner" || role === "tenant_admin") return new Set(allPermissions);
  if (role === "coordinator" || role === "tenant_staff") {
    return new Set([...allPermissions].filter((permission) => permission !== "curriculum.publish" && permission !== "badge.publish"));
  }
  if (role === "instructor") {
    return new Set([
      ...readPermissions,
      "assessment.record",
      "assessment.correct",
      "transition.review",
      "carryover.complete_previous",
      "badge.award"
    ]);
  }
  return new Set(readPermissions);
}

export function hasSwimPermission(
  role: TenantRole,
  permission: SwimPermissionKey,
  overrides: ReadonlyMap<SwimPermissionKey, boolean> = new Map()
) {
  return overrides.get(permission) ?? defaultPermissionsForRole(role).has(permission);
}
