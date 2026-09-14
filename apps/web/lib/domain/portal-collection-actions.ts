"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { requireChildPortalSession } from "@/lib/auth/portal-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { messageComposerUuid } from "./message-composer-contract";
import { presentationId, presentationVersion, safeThemeSourcePath } from "@/lib/theme/portal-journey-presentation";
import type { PortalCollectionContext, PortalCollectionItem, PortalCollectionOffer, PortalCollectionResult, PortalCollectionView } from "./portal-collection-contract";

async function actor(raw: PortalCollectionContext) {
  if (!raw || !["parent", "child"].includes(raw.audience)) throw new Error("collection_access_denied");
  const participant = messageComposerUuid(raw.participantId), tenant = messageComposerUuid(raw.tenantId);
  const context = await requirePrivateShellContext(raw.audience === "child" ? "/kind" : "/portaal");
  if (!context.session?.id || (raw.audience === "parent" && context.user.id !== messageComposerUuid(raw.actorId))) throw new Error("collection_access_denied");
  if (raw.audience === "child") {
    const child = await requireChildPortalSession(context);
    if (child.participantId !== participant || child.tenantId !== tenant) throw new Error("collection_access_denied");
  } else if (context.activeTenant?.tenantId !== tenant) throw new Error("collection_access_denied");
  // The service-only RPC independently checks the actual current auth session,
  // guardian binding, tenant and the separate child presentation capability.
  return { admin: createAdminClient(), args: { p_actor: context.user.id, p_session: context.session.id, p_tenant: tenant, p_participant: participant } };
}
function item(row: Record<string, unknown>): PortalCollectionItem {
  const asset = row.asset_snapshot_json as { objectKey?: unknown } | null;
  const key = asset?.objectKey;
  const assetUrl = typeof key === "string" ? `/portal-themes/${safeThemeSourcePath(key)}` : null;
  return { id: String(row.id), themeKey: String(row.theme_key), release: String(row.theme_release), itemKey: String(row.item_key), title: String(row.title), assetUrl, foundAt: String(row.found_at ?? row.created_at) };
}
function failure(error: unknown): PortalCollectionResult<never> {
  unstable_rethrow(error);
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  if (/access_denied|capability_required/.test(message)) return { ok: false, message: "Je kunt deze verzameling nu niet wijzigen. Open de juiste leerling opnieuw via je ouderaccount." };
  if (/context_changed/.test(message)) return { ok: false, message: "De wereld is intussen veranderd. Je bewaarde vondsten blijven staan; open de huidige wereld opnieuw." };
  if (/offer_expired/.test(message)) return { ok: false, message: "Deze ontdekking is verlopen. Je kunt een nieuwe vondst openen." };
  if (/rate_limit/.test(message)) return { ok: false, message: "Je hebt veel ontdekt. Probeer het later opnieuw; je verzameling blijft bewaard." };
  return { ok: false, message: "De opslag is niet bevestigd. Je vondst blijft in dit venster staan; probeer opnieuw." };
}
export async function loadPortalCollectionAction(raw: PortalCollectionContext): Promise<PortalCollectionResult<PortalCollectionView>> {
  try {
    const { admin, args } = await actor(raw), readAt = new Date().toISOString();
    const rows: PortalCollectionItem[] = []; let after: string | null = null, canWrite = false;
    for (let page = 0; page < 500; page += 1) {
      const result = await admin.rpc("read_portal_collection_for_service", { ...args, p_after: after, p_read_at: readAt });
      if (result.error || !result.data) throw result.error ?? new Error("collection_read_unavailable");
      const data = result.data as { items: Record<string, unknown>[]; canWrite: boolean };
      if (!Array.isArray(data.items)) throw new Error("collection_read_unavailable");
      canWrite = data.canWrite === true; rows.push(...data.items.map(item));
      if (data.items.length < 100) return { ok: true, value: { items: rows.sort((a, b) => b.foundAt.localeCompare(a.foundAt) || a.id.localeCompare(b.id)), canWrite } };
      after = messageComposerUuid(data.items.at(-1)?.id);
    }
    throw new Error("collection_history_limit"); // Never silently display an incomplete collection.
  } catch (error) { return failure(error); }
}
export async function discoverPortalCollectionAction(raw: PortalCollectionContext, theme: string, release: string, request: string): Promise<PortalCollectionResult<PortalCollectionOffer>> {
  try {
    if (process.env.MAINTENANCE_NO_WRITE === "true") throw new Error("collection_maintenance");
    const { admin, args } = await actor(raw);
    const result = await admin.rpc("discover_portal_collection_for_service", { ...args, p_theme: presentationId(theme), p_release: presentationVersion(release), p_request: messageComposerUuid(request) });
    if (result.error || !result.data) throw result.error ?? new Error("collection_discovery_unavailable");
    const row = result.data as Record<string, unknown>;
    return { ok: true, value: { id: String(row.id), item: item(row), expiresAt: String(row.expires_at), saved: !!row.saved_item_id } };
  } catch (error) { return failure(error); }
}
export async function savePortalCollectionAction(raw: PortalCollectionContext, offer: string, confirmed: boolean): Promise<PortalCollectionResult<{ item: PortalCollectionItem; duplicate: boolean }>> {
  try {
    if (process.env.MAINTENANCE_NO_WRITE === "true") throw new Error("collection_maintenance");
    const { admin, args } = await actor(raw), result = await admin.rpc("save_portal_collection_for_service", { ...args, p_offer: messageComposerUuid(offer), p_confirmed: confirmed === true });
    if (result.error || !result.data) throw result.error ?? new Error("collection_save_unavailable");
    revalidatePath(raw.audience === "child" ? "/kind" : "/portaal", "layout");
    return { ok: true, value: { item: item(result.data.item), duplicate: result.data.duplicate === true } };
  } catch (error) { return failure(error); }
}
