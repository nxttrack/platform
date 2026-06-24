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
      .limit(25),
    supabase.from("participants").select("id, external_reference, display_name, birthdate, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase
      .from("enrollments")
      .select("id, external_reference, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on, ended_on")
      .eq("tenant_id", tenantId)
      .order("started_on", { ascending: false }),
    supabase.from("group_memberships").select("id, enrollment_id, group_id, status, starts_on, ends_on").eq("tenant_id", tenantId).order("starts_on", { ascending: false }),
    supabase.from("progress").select("id, enrollment_id, stage_id, status, score, note, assessed_at").eq("tenant_id", tenantId).order("assessed_at", { ascending: false }).limit(25),
    supabase.from("badges").select("id, program_id, stage_id, code, name, description, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase
      .from("certificates")
      .select("id, enrollment_id, participant_id, program_id, certificate_number, title, status, issued_on")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
  ]);

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
