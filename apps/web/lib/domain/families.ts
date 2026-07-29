import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export type TenantFamilyRow = {
  guardianId: string;
  guardianName: string;
  guardianEmail: string;
  participantIds: string[];
  participantNames: string[];
  waitingNames: string[];
};

export async function getTenantFamilies() {
  const context = await requirePrivateShellContext("/admin/gezinnen");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [relationsResult, participantsResult, parentMembershipsResult, waitlistResult] = await Promise.all([
    admin
      .from("participant_guardians")
      .select("participant_id, guardian_user_id, access_level, status")
      .eq("tenant_id", tenant.id)
      .eq("status", "active"),
    admin
      .from("participants")
      .select("id, guardian_user_id, display_name, status")
      .eq("tenant_id", tenant.id)
      .neq("status", "archived"),
    admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", tenant.id)
      .eq("role", "parent")
      .eq("status", "active"),
    admin
      .from("waitlist_entries")
      .select("guardian_user_id, parent_email, participant_name, status")
      .eq("tenant_id", tenant.id)
      .in("status", ["waiting", "reviewing"])
  ]);
  for (const [label, result] of [
    ["family relations", relationsResult],
    ["family participants", participantsResult],
    ["family memberships", parentMembershipsResult],
    ["family waitlist", waitlistResult]
  ] as const) assertFamilyResult(result.error, label);

  const guardianIds = new Set([
    ...(relationsResult.data ?? []).map((row) => row.guardian_user_id),
    ...(participantsResult.data ?? []).flatMap((row) => row.guardian_user_id ? [row.guardian_user_id] : []),
    ...(parentMembershipsResult.data ?? []).map((row) => row.user_id),
    ...(waitlistResult.data ?? []).flatMap((row) => row.guardian_user_id ? [row.guardian_user_id] : [])
  ]);
  const profilesResult = guardianIds.size
    ? await admin.from("profiles").select("id, full_name, email").in("id", [...guardianIds])
    : { data: [], error: null };
  assertFamilyResult(profilesResult.error, "family profiles");
  const profileById = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
  const participantById = new Map((participantsResult.data ?? []).map((participant) => [participant.id, participant]));
  const participantIdsByGuardian = new Map<string, Set<string>>();

  for (const relation of relationsResult.data ?? []) {
    const ids = participantIdsByGuardian.get(relation.guardian_user_id) ?? new Set<string>();
    ids.add(relation.participant_id);
    participantIdsByGuardian.set(relation.guardian_user_id, ids);
  }
  for (const participant of participantsResult.data ?? []) {
    if (!participant.guardian_user_id) continue;
    const ids = participantIdsByGuardian.get(participant.guardian_user_id) ?? new Set<string>();
    ids.add(participant.id);
    participantIdsByGuardian.set(participant.guardian_user_id, ids);
  }

  const families: TenantFamilyRow[] = [];
  for (const guardianId of guardianIds) {
    const profile = profileById.get(guardianId);
    if (!profile) continue;
    const participantIds = [...(participantIdsByGuardian.get(guardianId) ?? [])];
    const waitingNames = (waitlistResult.data ?? [])
      .filter((entry) =>
        entry.guardian_user_id === guardianId ||
        (!!profile.email && entry.parent_email.trim().toLowerCase() === profile.email.trim().toLowerCase())
      )
      .map((entry) => entry.participant_name);
    families.push({
      guardianId,
      guardianName: profile.full_name || profile.email || "Ouder/verzorger",
      guardianEmail: profile.email ?? "",
      participantIds,
      participantNames: participantIds.flatMap((participantId) => participantById.get(participantId)?.display_name ?? []),
      waitingNames
    });
  }

  return {
    tenant,
    families: families.sort((left, right) => left.guardianName.localeCompare(right.guardianName, "nl"))
  };
}

function assertFamilyResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Could not load ${label}: ${error.message}`);
}
