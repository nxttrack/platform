import { normalizeHostname, type TenantHostResolutionOptions } from "./resolution";

export type TenantRoutingConfig = Required<TenantHostResolutionOptions>;

const defaultTenantBaseDomains = ["localhost"] as const;
const defaultPlatformHostnames = ["localhost", "127.0.0.1", "::1"] as const;
const defaultReservedSubdomains = ["admin", "api", "app", "platform", "staging", "www"] as const;

export function getTenantRoutingConfig(env: Record<string, string | undefined> = process.env): TenantRoutingConfig {
  return {
    tenantBaseDomains: parseCsvEnv(env.TENANT_BASE_DOMAINS ?? env.TENANT_DOMAIN_SUFFIX, defaultTenantBaseDomains),
    platformHostnames: parseCsvEnv(env.PLATFORM_HOSTNAMES, defaultPlatformHostnames),
    reservedSubdomains: parseCsvEnv(env.RESERVED_TENANT_SUBDOMAINS, defaultReservedSubdomains)
  };
}

function parseCsvEnv(value: string | undefined, fallback: readonly string[]): string[] {
  const values = value
    ?.split(",")
    .map((item) => normalizeHostname(normalizeRoutingDomain(item)))
    .filter(Boolean);

  return values && values.length > 0 ? values : [...fallback];
}

function normalizeRoutingDomain(value: string): string {
  const trimmed = value.trim();

  if (trimmed.startsWith("*.")) {
    return trimmed.slice(2);
  }

  if (trimmed.startsWith(".")) {
    return trimmed.slice(1);
  }

  return trimmed;
}
