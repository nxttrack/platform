import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";

export type ProgramRow = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  sort_order: number;
};

export type ProgramStageRow = {
  id: string;
  program_id: string;
  name: string;
  code: string | null;
  badge_label: string | null;
  color_hex: string | null;
  status: string;
  sort_order: number;
};

export type ResourceRow = {
  id: string;
  parent_resource_id: string | null;
  kind: string;
  name: string;
  code: string | null;
  capacity: number | null;
  safety_capacity: number | null;
  status: string;
  sort_order: number;
};

export type GroupRow = {
  id: string;
  program_id: string;
  stage_id: string | null;
  default_resource_id: string | null;
  name: string;
  code: string | null;
  status: string;
  capacity: number;
  offering_type: "regular" | "vacation_course" | "turbo_course" | "temporary_series";
  regular_capacity: number;
  flex_capacity: number;
  trial_capacity: number;
  hard_capacity: number;
  capacity_borrowing: "none" | "flex_from_regular" | "bidirectional";
  default_weekday: number | null;
  default_start_time: string | null;
  default_end_time: string | null;
};

export type SessionRow = {
  id: string;
  group_id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  capacity_override: number | null;
  notes: string | null;
};

export type ParticipantRow = {
  id: string;
  guardian_user_id: string | null;
  display_name: string;
  birth_date: string | null;
  gender: "boy" | "girl" | "unknown_legacy";
  status: string;
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
};

export type EnrollmentRow = {
  id: string;
  participant_id: string;
  guardian_user_id: string | null;
  program_id: string;
  current_stage_id: string | null;
  curriculum_version_id: string | null;
  status: string;
  source: string;
  starts_on: string;
  is_test: boolean;
  journey_run_id: string | null;
};

export type GroupMembershipRow = {
  id: string;
  group_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  capacity_weight: number;
  capacity_bucket: "regular" | "flex" | "trial";
  source: string;
  is_test: boolean;
  journey_run_id: string | null;
};

export type InstructorAssignmentRow = {
  id: string;
  group_id: string;
  instructor_user_id: string;
  role: string;
  status: string;
};

export type SessionInstructorAssignmentRow = {
  id: string;
  session_id: string;
  instructor_user_id: string;
  role: string;
  status: string;
};

export type TenantUserOption = {
  userId: string;
  label: string;
  email: string | null;
};

export type GroupCapacity = {
  groupId: string;
  used: number;
  capacity: number;
  available: number;
  status: "available" | "full" | "over_capacity";
};

export type TenantCoreData = {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  programs: ProgramRow[];
  stages: ProgramStageRow[];
  resources: ResourceRow[];
  groups: GroupRow[];
  sessions: SessionRow[];
  participants: ParticipantRow[];
  enrollments: EnrollmentRow[];
  groupMemberships: GroupMembershipRow[];
  groupInstructorAssignments: InstructorAssignmentRow[];
  sessionInstructorAssignments: SessionInstructorAssignmentRow[];
  instructors: TenantUserOption[];
  guardians: TenantUserOption[];
  groupCapacity: GroupCapacity[];
};

export async function getTenantCoreData(): Promise<TenantCoreData> {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();

  const [
    programsResult,
    stagesResult,
    resourcesResult,
    groupsResult,
    sessionsResult,
    participantsResult,
    enrollmentsResult,
    membershipsResult,
    assignmentsResult,
    sessionAssignmentsResult,
    tenantMembershipsResult
  ] = await Promise.all([
    admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).order("sort_order").order("name"),
    admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", tenant.id).order("sort_order").order("name"),
    admin.from("resources").select("id, parent_resource_id, kind, name, code, capacity, safety_capacity, status, sort_order").eq("tenant_id", tenant.id).order("sort_order").order("name"),
    admin
      .from("groups")
      .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, offering_type, regular_capacity, flex_capacity, trial_capacity, hard_capacity, capacity_borrowing, default_weekday, default_start_time, default_end_time")
      .eq("tenant_id", tenant.id)
      .order("name"),
    admin.from("sessions").select("id, group_id, resource_id, starts_at, ends_at, status, capacity_override, notes").eq("tenant_id", tenant.id).order("starts_at"),
    admin.from("participants").select("id, guardian_user_id, display_name, birth_date, status, source, is_test, journey_run_id").eq("tenant_id", tenant.id).order("display_name"),
    admin.from("enrollments").select("id, participant_id, guardian_user_id, program_id, current_stage_id, curriculum_version_id, status, source, starts_on, is_test, journey_run_id").eq("tenant_id", tenant.id).order("starts_on", { ascending: false }),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight, capacity_bucket, source, is_test, journey_run_id").eq("tenant_id", tenant.id),
    admin.from("group_instructor_assignments").select("id, group_id, instructor_user_id, role, status").eq("tenant_id", tenant.id),
    admin.from("session_instructor_assignments").select("id, session_id, instructor_user_id, role, status").eq("tenant_id", tenant.id),
    admin.from("tenant_memberships").select("user_id, role").eq("tenant_id", tenant.id).eq("status", "active")
  ]);

  assertSupabaseResult(programsResult.error, "programs");
  assertSupabaseResult(stagesResult.error, "program stages");
  assertSupabaseResult(resourcesResult.error, "resources");
  assertSupabaseResult(groupsResult.error, "groups");
  assertSupabaseResult(sessionsResult.error, "sessions");
  assertSupabaseResult(participantsResult.error, "participants");
  assertSupabaseResult(enrollmentsResult.error, "enrollments");
  assertSupabaseResult(membershipsResult.error, "group memberships");
  assertSupabaseResult(assignmentsResult.error, "instructor assignments");
  assertSupabaseResult(sessionAssignmentsResult.error, "session instructor assignments");
  assertSupabaseResult(tenantMembershipsResult.error, "tenant memberships");

  const tenantUsers = await loadTenantUsers(
    ((tenantMembershipsResult.data ?? []) as { user_id: string; role: string }[]).filter((membership) => membership.role === "instructor" || membership.role === "parent")
  );
  const groups = (groupsResult.data ?? []) as GroupRow[];
  const groupMemberships = (membershipsResult.data ?? []) as GroupMembershipRow[];

  return {
    tenant,
    programs: (programsResult.data ?? []) as ProgramRow[],
    stages: (stagesResult.data ?? []) as ProgramStageRow[],
    resources: (resourcesResult.data ?? []) as ResourceRow[],
    groups,
    sessions: (sessionsResult.data ?? []) as SessionRow[],
    participants: (participantsResult.data ?? []) as ParticipantRow[],
    enrollments: (enrollmentsResult.data ?? []) as EnrollmentRow[],
    groupMemberships,
    groupInstructorAssignments: (assignmentsResult.data ?? []) as InstructorAssignmentRow[],
    sessionInstructorAssignments: (sessionAssignmentsResult.data ?? []) as SessionInstructorAssignmentRow[],
    instructors: tenantUsers.instructors,
    guardians: tenantUsers.guardians,
    groupCapacity: summarizeGroupCapacity(groups, groupMemberships)
  };
}

export function getActiveTenant(context: AuthenticatedTrustedAuthContext) {
  if (!context.activeTenant) {
    throw new Error("No active tenant context is available.");
  }

  return {
    id: context.activeTenant.tenantId,
    slug: context.activeTenant.slug,
    name: context.activeTenant.name
  };
}

export function summarizeGroupCapacity(groups: readonly GroupRow[], memberships: readonly GroupMembershipRow[]): GroupCapacity[] {
  const usedByGroup = new Map<string, number>();

  for (const membership of memberships) {
    if (membership.status !== "active" && membership.status !== "trial") {
      continue;
    }

    usedByGroup.set(membership.group_id, (usedByGroup.get(membership.group_id) ?? 0) + Number(membership.capacity_weight));
  }

  return groups.map((group) => {
    const used = usedByGroup.get(group.id) ?? 0;
    const available = group.capacity - used;

    return {
      groupId: group.id,
      used,
      capacity: group.capacity,
      available,
      status: available < 0 ? "over_capacity" : available === 0 ? "full" : "available"
    };
  });
}

async function loadTenantUsers(memberships: { user_id: string; role: string }[]) {
  const admin = createAdminClient();
  const userIds = [...new Set(memberships.map((membership) => membership.user_id))];

  if (userIds.length === 0) {
    return { instructors: [], guardians: [] };
  }

  const { data, error } = await admin.from("profiles").select("id, full_name, email").in("id", userIds);

  assertSupabaseResult(error, "profiles");

  const profileById = new Map(
    ((data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((profile) => [
      profile.id,
      {
        userId: profile.id,
        label: profile.full_name || profile.email || profile.id,
        email: profile.email
      } satisfies TenantUserOption
    ])
  );

  const optionsByRole = {
    instructors: new Map<string, TenantUserOption>(),
    guardians: new Map<string, TenantUserOption>()
  };

  for (const membership of memberships) {
    const option =
      profileById.get(membership.user_id) ??
      ({
        userId: membership.user_id,
        label: membership.user_id,
        email: null
      } satisfies TenantUserOption);

    if (membership.role === "instructor") {
      optionsByRole.instructors.set(option.userId, option);
    }

    if (membership.role === "parent") {
      optionsByRole.guardians.set(option.userId, option);
    }
  }

  return {
    instructors: [...optionsByRole.instructors.values()].sort((a, b) => a.label.localeCompare(b.label)),
    guardians: [...optionsByRole.guardians.values()].sort((a, b) => a.label.localeCompare(b.label))
  };
}

function assertSupabaseResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
