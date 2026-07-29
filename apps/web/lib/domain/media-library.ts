import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type MediaLibraryRow = {
  id: string;
  participantId: string;
  participantName: string;
  caption: string;
  status: string;
  consentStatus: "active" | "blocked" | "expired";
  expiresAt: string;
  createdAt: string;
  accessCount: number;
  lastAccessAt: string | null;
  searchText: string;
};

export async function getTenantMediaLibrary(): Promise<MediaLibraryRow[]> {
  const context = await requirePrivateShellContext("/admin/media");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [media, participants, access] = await Promise.all([
    admin.from("participant_media").select("id, participant_id, caption, status, consent_checked_at, expires_at, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(1000),
    admin.from("participants").select("id, display_name").eq("tenant_id", tenant.id),
    admin.from("media_access_logs").select("media_id, occurred_at").eq("tenant_id", tenant.id).in("action", ["view", "download"]).order("occurred_at", { ascending: false }).limit(5000)
  ]);
  if (media.error || participants.error || access.error) throw new Error("Could not load media library.");
  const names = new Map((participants.data ?? []).map((row) => [row.id, row.display_name]));
  const accessByMedia = new Map<string, string[]>();
  for (const row of access.data ?? []) accessByMedia.set(row.media_id, [...(accessByMedia.get(row.media_id) ?? []), row.occurred_at]);
  return (media.data ?? []).map((row) => {
    const participantName = names.get(row.participant_id) ?? "Verwijderde leerling";
    const expired = new Date(row.expires_at).getTime() <= Date.now() || row.status === "expired";
    const blocked = ["consent_blocked", "pending_deletion", "deleted", "failed"].includes(row.status) || !row.consent_checked_at;
    const views = accessByMedia.get(row.id) ?? [];
    return {
      id: row.id,
      participantId: row.participant_id,
      participantName,
      caption: row.caption || "Voortgangsmoment",
      status: row.status,
      consentStatus: expired ? "expired" : blocked ? "blocked" : "active",
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      accessCount: views.length,
      lastAccessAt: views[0] ?? null,
      searchText: `${participantName} ${row.caption ?? ""} ${row.status}`.toLowerCase()
    };
  });
}
