import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ProgramRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
};

export type StageRow = {
  id: string;
  program_id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  sort_order: number;
};

export type SubscriptionPlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing_interval: string;
  price_cents: number;
  currency: string;
  lesson_frequency_per_week: number;
  status: string;
};

export type ResourceRow = {
  id: string;
  code: string;
  name: string;
  resource_type: string;
  location_name: string | null;
  capacity: number;
  status: string;
};

export type InstructorRow = {
  id: string;
  display_name: string;
  email: string | null;
  status: string;
};

export type GroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  code: string;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  capacity: number;
  status: string;
};

export type SessionRow = {
  id: string;
  group_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type ParticipantRow = {
  id: string;
  external_reference: string | null;
  display_name: string;
  birthdate: string | null;
  status: string;
};

export type EnrollmentRow = {
  id: string;
  external_reference: string | null;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  subscription_plan_id: string | null;
  status: string;
  started_on: string;
  ended_on: string | null;
};

export type GroupMembershipRow = {
  id: string;
  enrollment_id: string;
  group_id: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
};

export type SessionAttendanceRow = {
  id: string;
  session_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  note: string | null;
  recorded_at: string;
  recorded_by_profile_id: string | null;
};

export type ParticipantGuardianRow = {
  id: string;
  participant_id: string;
  profile_id: string;
  relationship: string;
  display_name: string | null;
  email: string | null;
  status: string;
};

export type TenantMemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  invited_email: string | null;
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
};

export type TenantAccountInvitationRow = {
  id: string;
  participant_id: string | null;
  user_id: string | null;
  email: string;
  full_name: string | null;
  role: string;
  status: string;
  delivery_provider: string | null;
  last_sent_at: string | null;
  expires_at: string;
  error_message: string | null;
  created_at: string;
};

export type PeopleAuditEventRow = {
  id: string;
  actor_profile_id: string | null;
  participant_id: string | null;
  enrollment_id: string | null;
  group_membership_id: string | null;
  event_type: string;
  summary: string;
  created_at: string;
};

export type LessonCatchUpRequestRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  missed_session_id: string;
  requested_by_profile_id: string;
  preferred_time_windows: string[];
  reason: string | null;
  status: string;
  requested_at: string;
  resolved_at: string | null;
};

export type ProgressRow = {
  id: string;
  enrollment_id: string;
  stage_id: string | null;
  status: string;
  score: number | null;
  note: string | null;
  assessed_at: string;
};

export type BadgeRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string;
  name: string;
  description: string | null;
  status: string;
};

export type CertificateRow = {
  id: string;
  enrollment_id: string | null;
  participant_id: string;
  program_id: string;
  certificate_number: string | null;
  title: string;
  status: string;
  issued_on: string | null;
};

export type AdminDomainData = {
  programs: ProgramRow[];
  stages: StageRow[];
  subscriptionPlans: SubscriptionPlanRow[];
  resources: ResourceRow[];
  instructors: InstructorRow[];
  groups: GroupRow[];
  sessions: SessionRow[];
  participants: ParticipantRow[];
  enrollments: EnrollmentRow[];
  groupMemberships: GroupMembershipRow[];
  attendance: SessionAttendanceRow[];
  participantGuardians: ParticipantGuardianRow[];
  tenantMembers: TenantMemberRow[];
  profiles: ProfileRow[];
  tenantAccountInvitations: TenantAccountInvitationRow[];
  peopleAuditEvents: PeopleAuditEventRow[];
  catchUpRequests: LessonCatchUpRequestRow[];
  progress: ProgressRow[];
  badges: BadgeRow[];
  certificates: CertificateRow[];
};

export type AdminDomainSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminDomainData;
  errors: string[];
};

export async function getAdminDomainSnapshot(): Promise<AdminDomainSnapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor deze adminroute."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = context.activeTenant.tenantId;

  const [
    programsResult,
    stagesResult,
    subscriptionPlansResult,
    resourcesResult,
    instructorsResult,
    groupsResult,
    sessionsResult,
    participantsResult,
    enrollmentsResult,
    groupMembershipsResult,
    attendanceResult,
    participantGuardiansResult,
    tenantMembersResult,
    tenantAccountInvitationsResult,
    peopleAuditEventsResult,
    catchUpRequestsResult,
    progressResult,
    badgesResult,
    certificatesResult
  ] = await Promise.all([
    supabase.from("programs").select("id, code, name, description, status, sort_order").eq("tenant_id", tenantId).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("stages").select("id, program_id, code, name, description, status, sort_order").eq("tenant_id", tenantId).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase
      .from("subscription_plans")
      .select("id, code, name, description, billing_interval, price_cents, currency, lesson_frequency_per_week, status")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true }),
    supabase.from("resources").select("id, code, name, resource_type, location_name, capacity, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("instructors").select("id, display_name, email, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase
      .from("groups")
      .select("id, program_id, stage_id, resource_id, instructor_id, code, name, weekday, starts_at, ends_at, capacity, status")
      .eq("tenant_id", tenantId)
      .order("weekday", { ascending: true })
      .order("starts_at", { ascending: true }),
    supabase
      .from("sessions")
      .select("id, group_id, resource_id, instructor_id, starts_at, ends_at, status")
      .eq("tenant_id", tenantId)
      .order("starts_at", { ascending: true })
      .limit(120),
    supabase.from("participants").select("id, external_reference, display_name, birthdate, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase
      .from("enrollments")
      .select("id, external_reference, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on, ended_on")
      .eq("tenant_id", tenantId)
      .order("started_on", { ascending: false }),
    supabase.from("group_memberships").select("id, enrollment_id, group_id, status, starts_on, ends_on").eq("tenant_id", tenantId).order("starts_on", { ascending: false }),
    supabase
      .from("session_attendance")
      .select("id, session_id, enrollment_id, participant_id, status, note, recorded_at, recorded_by_profile_id")
      .eq("tenant_id", tenantId)
      .order("recorded_at", { ascending: false })
      .limit(240),
    supabase.from("participant_guardians").select("id, participant_id, profile_id, relationship, display_name, email, status").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
    supabase.from("tenant_memberships").select("id, user_id, role, status, invited_email").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
    supabase
      .from("tenant_account_invitations")
      .select("id, participant_id, user_id, email, full_name, role, status, delivery_provider, last_sent_at, expires_at, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("people_audit_events")
      .select("id, actor_profile_id, participant_id, enrollment_id, group_membership_id, event_type, summary, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase
      .from("lesson_catch_up_requests")
      .select("id, participant_id, enrollment_id, missed_session_id, requested_by_profile_id, preferred_time_windows, reason, status, requested_at, resolved_at")
      .eq("tenant_id", tenantId)
      .order("requested_at", { ascending: false })
      .limit(120),
    supabase.from("progress").select("id, enrollment_id, stage_id, status, score, note, assessed_at").eq("tenant_id", tenantId).order("assessed_at", { ascending: false }).limit(25),
    supabase.from("badges").select("id, program_id, stage_id, code, name, description, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase
      .from("certificates")
      .select("id, enrollment_id, participant_id, program_id, certificate_number, title, status, issued_on")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
  ]);
  const tenantMembers = asRows<TenantMemberRow>(tenantMembersResult.data);
  const profileIds = unique([
    ...tenantMembers.map((member) => member.user_id),
    ...asRows<ParticipantGuardianRow>(participantGuardiansResult.data).map((guardian) => guardian.profile_id),
    ...asRows<TenantAccountInvitationRow>(tenantAccountInvitationsResult.data).flatMap((invitation) => (invitation.user_id ? [invitation.user_id] : [])),
    ...asRows<PeopleAuditEventRow>(peopleAuditEventsResult.data).flatMap((event) => (event.actor_profile_id ? [event.actor_profile_id] : []))
  ]);
  const profilesResult =
    profileIds.length === 0
      ? { data: [], error: null }
      : await supabase.from("profiles").select("id, full_name").in("id", profileIds).order("full_name", { ascending: true });

  const errors = collectErrors({
    programs: programsResult.error,
    stages: stagesResult.error,
    subscription_plans: subscriptionPlansResult.error,
    resources: resourcesResult.error,
    instructors: instructorsResult.error,
    groups: groupsResult.error,
    sessions: sessionsResult.error,
    participants: participantsResult.error,
    enrollments: enrollmentsResult.error,
    group_memberships: groupMembershipsResult.error,
    session_attendance: attendanceResult.error,
    participant_guardians: participantGuardiansResult.error,
    tenant_memberships: tenantMembersResult.error,
    tenant_account_invitations: tenantAccountInvitationsResult.error,
    people_audit_events: peopleAuditEventsResult.error,
    lesson_catch_up_requests: catchUpRequestsResult.error,
    profiles: profilesResult.error,
    progress: progressResult.error,
    badges: badgesResult.error,
    certificates: certificatesResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      programs: asRows<ProgramRow>(programsResult.data),
      stages: asRows<StageRow>(stagesResult.data),
      subscriptionPlans: asRows<SubscriptionPlanRow>(subscriptionPlansResult.data),
      resources: asRows<ResourceRow>(resourcesResult.data),
      instructors: asRows<InstructorRow>(instructorsResult.data),
      groups: asRows<GroupRow>(groupsResult.data),
      sessions: asRows<SessionRow>(sessionsResult.data),
      participants: asRows<ParticipantRow>(participantsResult.data),
      enrollments: asRows<EnrollmentRow>(enrollmentsResult.data),
      groupMemberships: asRows<GroupMembershipRow>(groupMembershipsResult.data),
      attendance: asRows<SessionAttendanceRow>(attendanceResult.data),
      participantGuardians: asRows<ParticipantGuardianRow>(participantGuardiansResult.data),
      tenantMembers,
      profiles: asRows<ProfileRow>(profilesResult.data),
      tenantAccountInvitations: asRows<TenantAccountInvitationRow>(tenantAccountInvitationsResult.data),
      peopleAuditEvents: asRows<PeopleAuditEventRow>(peopleAuditEventsResult.data),
      catchUpRequests: asRows<LessonCatchUpRequestRow>(catchUpRequestsResult.data),
      progress: asRows<ProgressRow>(progressResult.data),
      badges: asRows<BadgeRow>(badgesResult.data),
      certificates: asRows<CertificateRow>(certificatesResult.data)
    }
  };
}

export function createEmptyData(): AdminDomainData {
  return {
    programs: [],
    stages: [],
    subscriptionPlans: [],
    resources: [],
    instructors: [],
    groups: [],
    sessions: [],
    participants: [],
    enrollments: [],
    groupMemberships: [],
    attendance: [],
    participantGuardians: [],
    tenantMembers: [],
    profiles: [],
    tenantAccountInvitations: [],
    peopleAuditEvents: [],
    catchUpRequests: [],
    progress: [],
    badges: [],
    certificates: []
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

function unique(values: string[]) {
  return [...new Set(values)];
}
