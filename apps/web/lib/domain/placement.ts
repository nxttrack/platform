import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant, summarizeGroupCapacity, type GroupMembershipRow, type GroupRow, type ProgramRow, type ProgramStageRow } from "./core";
import type { IntakeSubmissionRow } from "./intake";

export type WaitlistEntryRow = {
  id: string;
  intake_submission_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  program_id: string;
  recommended_stage_id: string | null;
  parent_name: string;
  parent_email: string;
  parent_phone: string | null;
  participant_name: string;
  participant_birth_date: string | null;
  selected_option: string;
  status: string;
  priority_date: string;
  created_at: string;
  admin_notes: string | null;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
  test_metadata_json: Record<string, unknown>;
  eligible_from: string | null;
  minimum_age_blocked: boolean;
  waitlist_reason: string | null;
};

export type WaitlistPreferenceRow = {
  id: string;
  waitlist_entry_id: string;
  weekday: number;
  starts_after: string | null;
  ends_before: string | null;
  preference_weight: number;
};

export type PlacementScoreRow = {
  id: string;
  waitlist_entry_id: string;
  group_id: string;
  score: number;
  capacity_available: number;
  stage_match: boolean;
  preferred_day_match: boolean;
  reasons: string[];
};

export type SlotOfferRow = {
  id: string;
  waitlist_entry_id: string;
  group_id: string;
  status: string;
  delivery_status: string;
  delivery_error: string | null;
  parent_email: string;
  expires_at: string;
  responded_at: string | null;
};

export type PlacementAuditRow = {
  id: string;
  waitlist_entry_id: string | null;
  slot_offer_id: string | null;
  event_type: string;
  message: string | null;
  created_at: string;
};

export type PlacementDashboardData = {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  programs: ProgramRow[];
  stages: ProgramStageRow[];
  groups: GroupRow[];
  groupMemberships: GroupMembershipRow[];
  intakeSubmissions: IntakeSubmissionRow[];
  waitlistEntries: WaitlistEntryRow[];
  waitlistPreferences: WaitlistPreferenceRow[];
  placementScores: PlacementScoreRow[];
  slotOffers: SlotOfferRow[];
  auditEvents: PlacementAuditRow[];
};

export type ComputedPlacementScore = {
  group: GroupRow;
  score: number;
  capacityAvailable: number;
  stageMatch: boolean;
  preferredDayMatch: boolean;
  reasons: string[];
};

export async function getPlacementDashboardData(): Promise<PlacementDashboardData> {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [programsResult, stagesResult, groupsResult, membershipsResult, intakeResult, waitlistResult, preferencesResult, scoresResult, offersResult, auditResult] = await Promise.all([
    admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).order("sort_order").order("name"),
    admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", tenant.id).order("sort_order").order("name"),
    admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenant.id).order("name"),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenant.id),
    admin
      .from("intake_submissions")
      .select("id, program_id, selected_option, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, preferred_days, preferred_notes, message, status, received_at, source, is_test, journey_run_id")
      .eq("tenant_id", tenant.id)
      .order("received_at", { ascending: false }),
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, participant_id, guardian_user_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, created_at, admin_notes, source, is_test, journey_run_id, test_metadata_json, eligible_from, minimum_age_blocked, waitlist_reason")
      .eq("tenant_id", tenant.id)
      .order("priority_date"),
    admin.from("waitlist_preferences").select("id, waitlist_entry_id, weekday, starts_after, ends_before, preference_weight").eq("tenant_id", tenant.id),
    admin.from("placement_scores").select("id, waitlist_entry_id, group_id, score, capacity_available, stage_match, preferred_day_match, reasons").eq("tenant_id", tenant.id).order("score", { ascending: false }),
    admin.from("slot_offers").select("id, waitlist_entry_id, group_id, status, delivery_status, delivery_error, parent_email, expires_at, responded_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }),
    admin.from("placement_audit_events").select("id, waitlist_entry_id, slot_offer_id, event_type, message, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false })
  ]);

  assertPlacementResult(programsResult.error, "programs");
  assertPlacementResult(stagesResult.error, "program stages");
  assertPlacementResult(groupsResult.error, "groups");
  assertPlacementResult(membershipsResult.error, "group memberships");
  assertPlacementResult(intakeResult.error, "intake submissions");
  assertPlacementResult(waitlistResult.error, "waitlist entries");
  assertPlacementResult(preferencesResult.error, "waitlist preferences");
  assertPlacementResult(scoresResult.error, "placement scores");
  assertPlacementResult(offersResult.error, "slot offers");
  assertPlacementResult(auditResult.error, "placement audit events");

  return {
    tenant,
    programs: (programsResult.data ?? []) as ProgramRow[],
    stages: (stagesResult.data ?? []) as ProgramStageRow[],
    groups: (groupsResult.data ?? []) as GroupRow[],
    groupMemberships: (membershipsResult.data ?? []) as GroupMembershipRow[],
    intakeSubmissions: (intakeResult.data ?? []) as IntakeSubmissionRow[],
    waitlistEntries: (waitlistResult.data ?? []) as WaitlistEntryRow[],
    waitlistPreferences: (preferencesResult.data ?? []) as WaitlistPreferenceRow[],
    placementScores: (scoresResult.data ?? []) as PlacementScoreRow[],
    slotOffers: (offersResult.data ?? []) as SlotOfferRow[],
    auditEvents: (auditResult.data ?? []) as PlacementAuditRow[]
  };
}

export function computePlacementScores(input: {
  entry: WaitlistEntryRow;
  preferences: readonly WaitlistPreferenceRow[];
  groups: readonly GroupRow[];
  memberships: readonly GroupMembershipRow[];
}): ComputedPlacementScore[] {
  const capacityByGroup = new Map(summarizeGroupCapacity(input.groups, input.memberships).map((capacity) => [capacity.groupId, capacity]));
  const preferredWeekdays = new Set(input.preferences.map((preference) => preference.weekday));

  return input.groups
    .filter((group) => group.program_id === input.entry.program_id && group.status === "active")
    .map((group) => {
      const capacity = capacityByGroup.get(group.id);
      const capacityAvailable = Math.max(0, capacity?.available ?? group.capacity);
      const stageMatch = !!input.entry.recommended_stage_id && group.stage_id === input.entry.recommended_stage_id;
      const preferredDayMatch = !!group.default_weekday && preferredWeekdays.has(group.default_weekday);
      const reasons: string[] = [];
      let score = 0;

      if (capacityAvailable > 0) {
        score += 50 + Math.min(20, capacityAvailable * 5);
        reasons.push(`${capacityAvailable} vrije plek(ken)`);
      } else {
        reasons.push("geen vrije capaciteit");
      }

      if (stageMatch) {
        score += 25;
        reasons.push("stage match");
      }

      if (preferredDayMatch) {
        score += 15;
        reasons.push("voorkeursdag match");
      }

      return {
        group,
        score,
        capacityAvailable,
        stageMatch,
        preferredDayMatch,
        reasons
      };
    })
    .sort((a, b) => b.score - a.score);
}

function assertPlacementResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
