"use server";

import { requireAuthenticatedContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SavedView, SavedViewResult, SavedViewState } from "./saved-view-contract";

const resourcePattern = /^[a-z][a-z0-9._-]{1,79}$/;
const maxViewsPerResource = 20;

export async function listSavedViewsAction(resourceKey: string): Promise<SavedViewResult> {
  const scope = await resolveScope(resourceKey);
  const admin = createAdminClient();
  let query = admin
    .from("saved_views")
    .select("id, name, view_state, is_default")
    .eq("user_id", scope.userId)
    .eq("resource_key", scope.resourceKey)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  query = scope.tenantId ? query.eq("tenant_id", scope.tenantId) : query.is("tenant_id", null);
  const { data, error } = await query;
  if (error) return { ok: false, error: "Opgeslagen weergaven konden niet worden geladen." };

  return { ok: true, views: (data ?? []).map(toSavedView) };
}

export async function saveSavedViewAction(input: {
  isDefault?: boolean;
  name: string;
  resourceKey: string;
  state: SavedViewState;
}): Promise<SavedViewResult> {
  const scope = await resolveScope(input.resourceKey);
  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Geef de weergave een naam." };
  const state = sanitizeState(input.state);
  if (!state) return { ok: false, error: "Deze weergave bevat ongeldige filters." };

  const admin = createAdminClient();
  let countQuery = admin
    .from("saved_views")
    .select("id", { count: "exact", head: true })
    .eq("user_id", scope.userId)
    .eq("resource_key", scope.resourceKey);
  countQuery = scope.tenantId ? countQuery.eq("tenant_id", scope.tenantId) : countQuery.is("tenant_id", null);
  const countResult = await countQuery;
  if ((countResult.count ?? 0) >= maxViewsPerResource) {
    return { ok: false, error: `Je kunt maximaal ${maxViewsPerResource} weergaven per overzicht bewaren.` };
  }

  if (input.isDefault) {
    let resetQuery = admin
      .from("saved_views")
      .update({ is_default: false })
      .eq("user_id", scope.userId)
      .eq("resource_key", scope.resourceKey);
    resetQuery = scope.tenantId ? resetQuery.eq("tenant_id", scope.tenantId) : resetQuery.is("tenant_id", null);
    await resetQuery;
  }

  let existingQuery = admin
    .from("saved_views")
    .select("id")
    .eq("user_id", scope.userId)
    .eq("resource_key", scope.resourceKey)
    .ilike("name", name);
  existingQuery = scope.tenantId ? existingQuery.eq("tenant_id", scope.tenantId) : existingQuery.is("tenant_id", null);
  const existing = await existingQuery.maybeSingle();

  const payload = {
    is_default: Boolean(input.isDefault),
    name,
    role_key: scope.roleKey,
    tenant_id: scope.tenantId,
    user_id: scope.userId,
    resource_key: scope.resourceKey,
    view_state: state
  };
  const write = existing.data
    ? await admin.from("saved_views").update(payload).eq("id", existing.data.id).eq("user_id", scope.userId)
    : await admin.from("saved_views").insert(payload);
  if (write.error) return { ok: false, error: "De weergave kon niet worden opgeslagen." };

  return listSavedViewsAction(scope.resourceKey);
}

export async function deleteSavedViewAction(input: { id: string; resourceKey: string }): Promise<SavedViewResult> {
  const scope = await resolveScope(input.resourceKey);
  const admin = createAdminClient();
  let query = admin
    .from("saved_views")
    .delete()
    .eq("id", input.id)
    .eq("user_id", scope.userId)
    .eq("resource_key", scope.resourceKey);
  query = scope.tenantId ? query.eq("tenant_id", scope.tenantId) : query.is("tenant_id", null);
  const { error } = await query;
  if (error) return { ok: false, error: "De weergave kon niet worden verwijderd." };
  return listSavedViewsAction(scope.resourceKey);
}

async function resolveScope(resourceKey: string) {
  if (!resourcePattern.test(resourceKey)) throw new Error("Invalid saved-view resource key.");
  const context = await requireAuthenticatedContext("/admin");
  if (resourceKey.startsWith("platform.")) {
    const allowed = context.platform?.roles.some((role) => ["platform_owner", "platform_admin", "platform_support"].includes(role));
    if (!allowed) throw new Error("Platform access required.");
    return { resourceKey, roleKey: "platform_admin", tenantId: null, userId: context.user.id };
  }
  if (!context.activeTenant) throw new Error("Active tenant required.");
  const roleKey = context.activeTenant.roles.includes("instructor")
    ? "instructor"
    : context.activeTenant.roles.includes("parent")
      ? "parent"
      : "admin";
  return { resourceKey, roleKey, tenantId: context.activeTenant.tenantId, userId: context.user.id };
}

function sanitizeState(value: SavedViewState): SavedViewState | null {
  if (!value || !Array.isArray(value.filters) || !Array.isArray(value.sorting) || !value.visibility || typeof value.visibility !== "object") return null;
  const encoded = JSON.stringify(value);
  if (encoded.length > 20_000) return null;
  return JSON.parse(encoded) as SavedViewState;
}

function toSavedView(row: { id: string; is_default: boolean; name: string; view_state: unknown }): SavedView {
  return {
    id: row.id,
    isDefault: row.is_default,
    name: row.name,
    state: sanitizeState(row.view_state as SavedViewState) ?? { filters: [], sorting: [], visibility: {} }
  };
}
