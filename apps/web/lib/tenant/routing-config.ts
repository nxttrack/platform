import { normalizeHostname, type TenantHostResolutionOptions } from "./resolution";

export type TenantRoutingConfig = Required<TenantHostResolutionOptions>;

const defaultTenantBaseDomains = ["nxttrack.nl", "localhost"] as const;
const defaultPlatformHostnames = ["localhost", "127.0.0.1", "::1"] as const;
const defaultPlatformMarketingHostnames = ["www.nxttrack.nl", "nxttrack.nl"] as const;
const defaultPlatformAdminHostnames = ["admin.nxttrack.nl"] as const;
const defaultStagingHostnames = ["staging.nxttrack.nl"] as const;
const defaultReservedSubdomains = ["admin", "api", "app", "platform", "staging", "www"] as const;

export function getTenantRoutingConfig(env: Record<string, string | undefined> = process.env): TenantRoutingConfig {
  return {
    tenantBaseDomains: parseCsvEnv(env.TENANT_BASE_DOMAINS, defaultTenantBaseDomains),
    platformHostnames: parseCsvEnv(env.PLATFORM_HOSTNAMES, defaultPlatformHostnames),
    platformMarketingHostnames: parseCsvEnv(env.PLATFORM_MARKETING_HOSTNAMES, defaultPlatformMarketingHostnames),
    platformAdminHostnames: parseCsvEnv(env.PLATFORM_ADMIN_HOSTNAMES, defaultPlatformAdminHostnames),
    stagingHostnames: parseCsvEnv(env.STAGING_HOSTNAMES, defaultStagingHostnames),
    reservedSubdomains: parseCsvEnv(env.RESERVED_TENANT_SUBDOMAINS, defaultReservedSubdomains)
  };
}

function parseCsvEnv(value: string | undefined, fallback: readonly string[]): string[] {
  const values = value
    ?.split(",")
    .map((item) => normalizeHostname(item))
    .filter(Boolean);

  return values && values.length > 0 ? values : [...fallback];
}
