export const platformRoles = ["platform_owner", "platform_admin", "platform_support"] as const;
export const tenantRoles = ["tenant_owner", "tenant_admin", "tenant_staff", "instructor", "parent", "athlete"] as const;

export type PlatformRole = (typeof platformRoles)[number];
export type TenantRole = (typeof tenantRoles)[number];
export type AppRole = PlatformRole | TenantRole;

export const roleLabels: Record<AppRole, string> = {
  platform_owner: "Platform eigenaar",
  platform_admin: "Platformbeheerder",
  platform_support: "Platform support",
  tenant_owner: "Tenant eigenaar",
  tenant_admin: "Tenantbeheerder",
  tenant_staff: "Medewerker",
  instructor: "Instructeur",
  parent: "Ouder",
  athlete: "Leerling"
};

export function isPlatformRole(role: string): role is PlatformRole {
  return platformRoles.includes(role as PlatformRole);
}

export function isTenantRole(role: string): role is TenantRole {
  return tenantRoles.includes(role as TenantRole);
}
