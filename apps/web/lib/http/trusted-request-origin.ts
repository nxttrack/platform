import "server-only";

import { headers } from "next/headers";
import { resolveTenantHost } from "@/lib/tenant/resolution";
import { getTenantRoutingConfig } from "@/lib/tenant/routing-config";

export async function getTrustedRequestOrigin() {
  const fallback = configuredOrigin();
  const headerStore = await headers();
  const candidate = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "";
  const resolution = resolveTenantHost(candidate, getTenantRoutingConfig());

  if (resolution.kind === "unknown" || resolution.kind === "custom_domain") {
    return fallback;
  }

  if (resolution.kind === "platform" && isLocalHostname(resolution.hostname)) {
    return fallback;
  }

  return `https://${resolution.hostname}`;
}

function configuredOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000";

  try {
    return new URL(configured).origin;
  } catch {
    return "http://localhost:3000";
  }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
