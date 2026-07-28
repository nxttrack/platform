"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { refreshEmptySeatRecovery } from "./empty-seat-recovery";

const path = "/admin/plekherstel";

export async function refreshEmptySeatRecoveryAction() {
  const { tenantId } = await requireRecoveryAdmin();
  let count: number;
  try {
    count = await refreshEmptySeatRecovery(tenantId);
  } catch {
    redirect(`${path}?error=refresh`);
  }
  revalidatePath(path);
  revalidatePath("/admin");
  redirect(`${path}?saved=refreshed_${count}`);
}

export async function createEmptySeatReviewTaskAction(formData: FormData) {
  const { tenantId, userId } = await requireRecoveryAdmin();
  const candidateId = readUuid(formData, "candidateId");
  if (formData.get("humanConfirmation") !== "confirmed") redirect(`${path}?error=confirmation`);
  const admin = createAdminClient();
  const result = await admin
    .from("empty_seat_recovery_candidates")
    .select("id, snapshot_id, display_name, candidate_type, suggested_action, blockers_json, is_test")
    .eq("tenant_id", tenantId)
    .eq("id", candidateId)
    .maybeSingle();
  const candidate = result.data;
  if (result.error || !candidate || candidate.is_test || toStringArray(candidate.blockers_json).length) redirect(`${path}?error=candidate`);
  const existing = await admin.from("tenant_tasks").select("id").eq("tenant_id", tenantId).eq("empty_seat_recovery_candidate_id", candidateId).in("status", ["open", "in_progress"]).maybeSingle();
  if (existing.error) redirect(`${path}?error=task`);
  if (!existing.data) {
    const task = await admin.from("tenant_tasks").insert({
      tenant_id: tenantId,
      created_by_user_id: userId,
      empty_seat_recovery_candidate_id: candidateId,
      title: `Vrije plek beoordelen voor ${candidate.display_name}`,
      description: `${candidate.suggested_action}\n\nGeen aanbod, bericht of boeking is automatisch uitgevoerd.`,
      priority: "high",
      status: "open",
      is_test: false,
      journey_run_id: null
    });
    if (task.error) redirect(`${path}?error=task`);
  }
  await admin.from("empty_seat_recovery_candidates").update({ status: "review_task_created", reviewed_at: new Date().toISOString(), reviewed_by_user_id: userId }).eq("tenant_id", tenantId).eq("id", candidateId);
  await admin.from("empty_seat_recovery_events").insert({ tenant_id: tenantId, snapshot_id: candidate.snapshot_id, candidate_id: candidateId, event_type: "task_created", actor_user_id: userId, message: "Menselijke reviewtaak aangemaakt; geen externe actie uitgevoerd." });
  refresh();
  redirect(`${path}?saved=task`);
}

export async function dismissEmptySeatCandidateAction(formData: FormData) {
  const { tenantId, userId } = await requireRecoveryAdmin();
  const candidateId = readUuid(formData, "candidateId");
  const admin = createAdminClient();
  const candidate = await admin.from("empty_seat_recovery_candidates").select("snapshot_id").eq("tenant_id", tenantId).eq("id", candidateId).maybeSingle();
  if (candidate.error || !candidate.data) redirect(`${path}?error=candidate`);
  const result = await admin.from("empty_seat_recovery_candidates").update({ status: "dismissed", reviewed_at: new Date().toISOString(), reviewed_by_user_id: userId }).eq("tenant_id", tenantId).eq("id", candidateId);
  if (result.error) redirect(`${path}?error=dismiss`);
  await admin.from("empty_seat_recovery_events").insert({ tenant_id: tenantId, snapshot_id: candidate.data.snapshot_id, candidate_id: candidateId, event_type: "dismissed", actor_user_id: userId, message: "Kandidaat handmatig genegeerd." });
  refresh();
  redirect(`${path}?saved=dismissed`);
}

export async function resolveEmptySeatSnapshotAction(formData: FormData) {
  const { tenantId, userId } = await requireRecoveryAdmin();
  const snapshotId = readUuid(formData, "snapshotId");
  if (formData.get("humanConfirmation") !== "resolved") redirect(`${path}?error=confirmation`);
  const result = await createAdminClient().from("empty_seat_recovery_snapshots").update({ status: "resolved", reviewed_at: new Date().toISOString(), reviewed_by_user_id: userId }).eq("tenant_id", tenantId).eq("id", snapshotId).in("status", ["open", "reviewed"]);
  if (result.error) redirect(`${path}?error=resolve`);
  await createAdminClient().from("empty_seat_recovery_events").insert({ tenant_id: tenantId, snapshot_id: snapshotId, event_type: "resolved", actor_user_id: userId, message: "Vrije plek handmatig als afgehandeld gemarkeerd." });
  refresh();
  redirect(`${path}?saved=resolved`);
}

async function requireRecoveryAdmin() {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role))) redirect("/admin?error=forbidden");
  return { tenantId: tenant.id, userId: context.user.id };
}

function refresh() {
  revalidatePath(path);
  revalidatePath("/admin");
  revalidatePath("/admin/taken");
}

function readUuid(formData: FormData, name: string) {
  const value = formData.get(name);
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`${name} is invalid.`);
  return value;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}
