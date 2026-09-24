import "server-only";

import { redirect } from "next/navigation";

export function redirectCompatibilityRoute(
  canonicalPath: string,
  searchParams?: Record<string, string | string[] | undefined>,
  fragment?: string
): never {
  const params = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(searchParams ?? {})) {
    for (const value of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      if (typeof value === "string" && key.length <= 80 && value.length <= 2_000) {
        params.append(key, value);
      }
    }
  }
  const query = params.toString();
  redirect(`${canonicalPath}${query ? `?${query}` : ""}${fragment ? `#${fragment}` : ""}`);
}
