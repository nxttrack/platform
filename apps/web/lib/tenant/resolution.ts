export type TenantHostResolution =
  | {
      kind: "platform";
      hostname: string;
    }
  | {
      kind: "tenant_subdomain";
      hostname: string;
      slug: string;
      baseDomain: string;
    }
  | {
      kind: "custom_domain";
      hostname: string;
    }
  | {
      kind: "unknown";
      hostname: string;
      reason: string;
    };

export type TenantHostResolutionOptions = {
  tenantBaseDomains?: readonly string[];
  platformHostnames?: readonly string[];
  reservedSubdomains?: readonly string[];
};

const defaultTenantBaseDomains = ["localhost"] as const;
const defaultPlatformHostnames = ["localhost", "127.0.0.1", "::1"] as const;
const defaultReservedSubdomains = ["admin", "api", "app", "platform", "staging", "www"] as const;

export function resolveTenantHost(host: string, options: TenantHostResolutionOptions = {}): TenantHostResolution {
  const hostname = normalizeHostname(host);

  if (hostname === "") {
    return { kind: "unknown", hostname, reason: "empty_host" };
  }

  const platformHostnames = normalizeList(options.platformHostnames ?? defaultPlatformHostnames);

  if (platformHostnames.includes(hostname) || isIpAddress(hostname)) {
    return { kind: "platform", hostname };
  }

  const tenantBaseDomains = normalizeList(options.tenantBaseDomains ?? defaultTenantBaseDomains);
  const reservedSubdomains = normalizeList(options.reservedSubdomains ?? defaultReservedSubdomains);
  const baseDomain = tenantBaseDomains.find((domain) => hostname.endsWith(`.${domain}`));

  if (baseDomain) {
    const prefix = hostname.slice(0, hostname.length - baseDomain.length - 1);

    if (prefix !== "" && !prefix.includes(".") && !reservedSubdomains.includes(prefix)) {
      return {
        kind: "tenant_subdomain",
        hostname,
        slug: prefix,
        baseDomain
      };
    }

    return {
      kind: "unknown",
      hostname,
      reason: prefix === "" ? "missing_tenant_subdomain" : "reserved_or_nested_subdomain"
    };
  }

  return {
    kind: "custom_domain",
    hostname
  };
}

export function normalizeHostname(host: string): string {
  const value = host.trim().toLowerCase();

  if (value === "") {
    return "";
  }

  try {
    const url = value.includes("://") ? new URL(value) : new URL(`https://${value}`);
    return url.hostname.replace(/\.$/, "");
  } catch {
    return value.split("/")[0]?.split("?")[0]?.split("#")[0]?.replace(/:\d+$/, "").replace(/\.$/, "") ?? "";
  }
}

function normalizeList(values: readonly string[]): string[] {
  return values.map(normalizeHostname).filter(Boolean);
}

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(":");
}
