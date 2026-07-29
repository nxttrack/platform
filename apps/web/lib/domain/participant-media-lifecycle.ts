import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type ExpiringMediaRow = {
  id: string;
  storage_bucket: string;
  storage_path: string;
  tenant_id: string;
};

export async function expireParticipantMedia(now = new Date()) {
  const admin = createAdminClient();
  const dueResult = await admin
    .from("participant_media")
    .select("id, tenant_id, storage_bucket, storage_path")
    .in("status", ["draft", "published", "consent_blocked", "expired", "pending_deletion"])
    .or(`expires_at.lte.${now.toISOString()},status.eq.pending_deletion`)
    .limit(500);

  if (dueResult.error) {
    throw new Error(`Could not load expiring participant media: ${dueResult.error.message}`);
  }

  const due = (dueResult.data ?? []) as ExpiringMediaRow[];
  const results: Array<{ id: string; outcome: "deleted" | "failed" }> = [];

  for (const media of due) {
    const pendingResult = await admin
      .from("participant_media")
      .update({ status: "pending_deletion" })
      .eq("tenant_id", media.tenant_id)
      .eq("id", media.id)
      .neq("status", "deleted");

    if (pendingResult.error) {
      results.push({ id: media.id, outcome: "failed" });
      continue;
    }

    const storageResult = await admin.storage.from(media.storage_bucket).remove([media.storage_path]);
    if (storageResult.error) {
      await admin
        .from("participant_media")
        .update({ failure_reason: `expiry_storage:${storageResult.error.message}`.slice(0, 500) })
        .eq("tenant_id", media.tenant_id)
        .eq("id", media.id);
      results.push({ id: media.id, outcome: "failed" });
      continue;
    }

    const deletedResult = await admin
      .from("participant_media")
      .update({ status: "deleted", failure_reason: null })
      .eq("tenant_id", media.tenant_id)
      .eq("id", media.id);
    if (deletedResult.error) {
      results.push({ id: media.id, outcome: "failed" });
      continue;
    }

    await admin.from("media_access_logs").insert({
      tenant_id: media.tenant_id,
      media_id: media.id,
      action: "expired",
      metadata_json: { object_deleted: true, source: "expiry_job" }
    });
    results.push({ id: media.id, outcome: "deleted" });
  }

  return {
    attempted: due.length,
    deleted: results.filter((result) => result.outcome === "deleted").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    results
  };
}
