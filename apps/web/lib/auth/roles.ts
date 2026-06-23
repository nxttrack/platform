export const platformRoles = ["platform_owner", "platform_admin", "platform_support"] as const;
export const tenantRoles = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor", "parent", "athlete"] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type TenantRole = (typeof tenantRoles)[number];
export type AppRole = PlatformRole | TenantRole;

export const roleLabels: Record<AppRole, string> = {
  platform_owner: "Platform owner",
  platform_admin: "Platform admin",
  platform_support: "Platform support",
  tenant_owner: "Tenant owner",
  tenant_admin: "Tenant admin",
  tenant_staff: "Tenant staff",
  instructor: "Instructor",
  parent: "Parent",
  athlete: "Athlete"
};

export function isPlatformRole(role: AppRole): role is PlatformRole {
  return platformRoles.includes(role as PlatformRole);
}

export function isTenantRole(role: AppRole): role is TenantRole {
  return tenantRoles.includes(role as TenantRole);
}
