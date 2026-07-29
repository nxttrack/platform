export function resolveInvitationTenantSlug(input: {
  activeTenantSlug?: string | null;
  explicitTenantSlug?: string | null;
  shell: "admin" | "platform";
}) {
  const explicitTenantSlug = normalizeOptionalSlug(input.explicitTenantSlug);

  if (explicitTenantSlug) return explicitTenantSlug;
  if (input.shell === "platform") return null;

  return normalizeOptionalSlug(input.activeTenantSlug);
}

function normalizeOptionalSlug(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();

  return normalized ? normalized : null;
}
