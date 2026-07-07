import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveTenant,
  type EnrollmentRow,
  type GroupMembershipRow,
  type GroupRow,
  type ParticipantRow,
  type ProgramRow,
  type ProgramStageRow,
  type ResourceRow,
  type SessionRow
} from "./core";

export type ParentProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

export type ParentAccessRow = {
  id: string;
  participant_id: string;
  relationship: string;
  access_level: string;
  status: string;
};

export type ParentPortalSettings = {
  locale: string;
  timezone: string;
  lesson_cancellation_cutoff_hours: number;
  lesson_cancellation_credit_window_days: number;
  lesson_cancellation_grants_credit: boolean;
};

export type LessonCancellationRow = {
  id: string;
  session_id: string;
  participant_id: string;
  enrollment_id: string;
  parent_user_id: string;
  status: string;
  policy_status: string;
  reason: string | null;
  eligible_for_credit: boolean;
  requested_at: string;
};

export type CatchUpCreditRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  source_cancellation_id: string | null;
  status: string;
  credit_type: string;
  granted_at: string;
  expires_on: string | null;
  used_session_id: string | null;
  notes: string | null;
};

export type ParentProgressModuleRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  template_key: string | null;
  status: string;
  sort_order: number;
};

export type ParentProgressItemRow = {
  id: string;
  module_id: string;
  code: string | null;
  name: string;
  description: string | null;
  positive_goal: string | null;
  status: string;
  sort_order: number;
};

export type ParentProgressScoreRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  module_id: string;
  item_id: string;
  session_id: string | null;
  score: number;
  positive_label: string;
  note: string | null;
  visibility: string;
  status: string;
  scored_at: string;
};

export type ParentBadgeAwardRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  badge_definition_id: string | null;
  title: string;
  note: string | null;
  visibility: string;
  status: string;
  awarded_at: string;
};

export type ParentBadgeDefinitionRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  icon_name: string | null;
  status: string;
  sort_order: number;
};

export type ParentNotificationRow = {
  id: string;
  participant_id: string | null;
  type: string;
  title: string;
  message: string;
  status: string;
  related_progress_score_id: string | null;
  related_badge_award_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type ParentGraduationEventRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  resource_id: string | null;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
  capacity: number | null;
  notes: string | null;
};

export type ParentGraduationParticipantRow = {
  id: string;
  event_id: string;
  participant_id: string;
  enrollment_id: string;
  readiness_id: string | null;
  invite_status: string;
  status: string;
  invited_at: string | null;
  responded_at: string | null;
  result: string;
  result_registered_at: string | null;
  result_notes: string | null;
};

export type ParentCertificateRecordRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  program_id: string;
  stage_id: string;
  event_participant_id: string | null;
  certificate_number: string | null;
  title: string;
  status: string;
  issued_on: string;
  file_path: string | null;
  notes: string | null;
};

export type ParentPaymentPlanRow = {
  id: string;
  program_id: string | null;
  code: string | null;
  name: string;
  description: string | null;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  billing_day: number | null;
  payment_terms_days: number;
  status: string;
};

export type ParentSubscriptionRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  guardian_user_id: string | null;
  payment_plan_id: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
  next_due_on: string | null;
  amount_cents: number;
  currency: string;
  billing_interval: string;
  notes: string | null;
};

export type ParentManualPaymentRow = {
  id: string;
  subscription_id: string;
  participant_id: string;
  enrollment_id: string;
  guardian_user_id: string | null;
  amount_cents: number;
  currency: string;
  due_on: string;
  paid_on: string | null;
  status: string;
  reference: string | null;
  method: string | null;
  notes: string | null;
};

export type ParentBillingEventRow = {
  id: string;
  subscription_id: string | null;
  manual_payment_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  type: string;
  status: string;
  occurred_at: string;
  message: string;
};

export type ParentPortalData = {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  user: AuthenticatedTrustedAuthContext["user"];
  profile: ParentProfileRow | null;
  settings: ParentPortalSettings;
  accessLinks: ParentAccessRow[];
  participants: ParticipantRow[];
  enrollments: EnrollmentRow[];
  groupMemberships: GroupMembershipRow[];
  groups: GroupRow[];
  programs: ProgramRow[];
  stages: ProgramStageRow[];
  resources: ResourceRow[];
  sessions: SessionRow[];
  cancellations: LessonCancellationRow[];
  catchUpCredits: CatchUpCreditRow[];
  progressModules: ParentProgressModuleRow[];
  progressItems: ParentProgressItemRow[];
  progressScores: ParentProgressScoreRow[];
  badgeAwards: ParentBadgeAwardRow[];
  badgeDefinitions: ParentBadgeDefinitionRow[];
  notifications: ParentNotificationRow[];
  graduationEvents: ParentGraduationEventRow[];
  graduationParticipants: ParentGraduationParticipantRow[];
  certificates: ParentCertificateRecordRow[];
  paymentPlans: ParentPaymentPlanRow[];
  subscriptions: ParentSubscriptionRow[];
  manualPayments: ParentManualPaymentRow[];
  billingEvents: ParentBillingEventRow[];
};

export async function getParentPortalData(): Promise<ParentPortalData> {
  const context = await requirePrivateShellContext("/portaal");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const access = await loadParentParticipantAccess(tenant.id, context.user.id);
  const participantIds = access.participantIds;
  const since = new Date();

  since.setDate(since.getDate() - 7);

  const [profileResult, settingsResult, participantsResult] = await Promise.all([
    admin.from("profiles").select("id, full_name, email, phone").eq("id", context.user.id).maybeSingle(),
    admin
      .from("tenant_settings")
      .select("locale, timezone, lesson_cancellation_cutoff_hours, lesson_cancellation_credit_window_days, lesson_cancellation_grants_credit")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
    participantIds.length > 0
      ? admin.from("participants").select("id, guardian_user_id, display_name, birth_date, status").eq("tenant_id", tenant.id).in("id", participantIds).order("display_name")
      : Promise.resolve({ data: [], error: null })
  ]);

  assertParentPortalResult(profileResult.error, "profile");
  assertParentPortalResult(settingsResult.error, "tenant settings");
  assertParentPortalResult(participantsResult.error, "participants");

  const participants = (participantsResult.data ?? []) as ParticipantRow[];
  const loadedParticipantIds = participants.map((participant) => participant.id);
  const [
    enrollmentsResult,
    membershipsResult,
    cancellationsResult,
    creditsResult,
    progressScoresResult,
    badgeAwardsResult,
    notificationsResult,
    graduationParticipantsResult,
    certificatesResult,
    subscriptionsResult,
    manualPaymentsResult,
    billingEventsResult
  ] = await Promise.all([
    loadedParticipantIds.length > 0
      ? admin
          .from("enrollments")
          .select("id, participant_id, guardian_user_id, program_id, current_stage_id, status, source, starts_on")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("starts_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenant.id).in("participant_id", loadedParticipantIds)
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("lesson_cancellations")
          .select("id, session_id, participant_id, enrollment_id, parent_user_id, status, policy_status, reason, eligible_for_credit, requested_at")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("requested_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("catch_up_credits")
          .select("id, participant_id, enrollment_id, source_cancellation_id, status, credit_type, granted_at, expires_on, used_session_id, notes")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("granted_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("participant_progress_scores")
          .select("id, participant_id, enrollment_id, module_id, item_id, session_id, score, positive_label, note, visibility, status, scored_at")
          .eq("tenant_id", tenant.id)
          .eq("visibility", "parent_visible")
          .eq("status", "active")
          .in("participant_id", loadedParticipantIds)
          .order("scored_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("participant_badge_awards")
          .select("id, participant_id, enrollment_id, badge_definition_id, title, note, visibility, status, awarded_at")
          .eq("tenant_id", tenant.id)
          .eq("visibility", "parent_visible")
          .eq("status", "awarded")
          .in("participant_id", loadedParticipantIds)
          .order("awarded_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("tenant_notifications")
      .select("id, participant_id, type, title, message, status, related_progress_score_id, related_badge_award_id, created_at, read_at")
      .eq("tenant_id", tenant.id)
      .eq("recipient_user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    loadedParticipantIds.length > 0
      ? admin
          .from("graduation_event_participants")
          .select("id, event_id, participant_id, enrollment_id, readiness_id, invite_status, status, invited_at, responded_at, result, result_registered_at, result_notes")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("certificate_records")
          .select("id, participant_id, enrollment_id, program_id, stage_id, event_participant_id, certificate_number, title, status, issued_on, file_path, notes")
          .eq("tenant_id", tenant.id)
          .eq("status", "issued")
          .in("participant_id", loadedParticipantIds)
          .order("issued_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("subscriptions")
          .select("id, participant_id, enrollment_id, guardian_user_id, payment_plan_id, status, starts_on, ends_on, next_due_on, amount_cents, currency, billing_interval, notes")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("starts_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("manual_payments")
          .select("id, subscription_id, participant_id, enrollment_id, guardian_user_id, amount_cents, currency, due_on, paid_on, status, reference, method, notes")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("due_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("billing_events")
          .select("id, subscription_id, manual_payment_id, participant_id, guardian_user_id, type, status, occurred_at, message")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("occurred_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [], error: null })
  ]);

  assertParentPortalResult(enrollmentsResult.error, "enrollments");
  assertParentPortalResult(membershipsResult.error, "group memberships");
  assertParentPortalResult(cancellationsResult.error, "lesson cancellations");
  assertParentPortalResult(creditsResult.error, "catch-up credits");
  assertParentPortalResult(progressScoresResult.error, "progress scores");
  assertParentPortalResult(badgeAwardsResult.error, "badge awards");
  assertParentPortalResult(notificationsResult.error, "notifications");
  assertParentPortalResult(graduationParticipantsResult.error, "graduation event participants");
  assertParentPortalResult(certificatesResult.error, "certificate records");
  assertParentPortalResult(subscriptionsResult.error, "subscriptions");
  assertParentPortalResult(manualPaymentsResult.error, "manual payments");
  assertParentPortalResult(billingEventsResult.error, "billing events");

  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const memberships = (membershipsResult.data ?? []) as GroupMembershipRow[];
  const graduationParticipants = (graduationParticipantsResult.data ?? []) as ParentGraduationParticipantRow[];
  const certificates = (certificatesResult.data ?? []) as ParentCertificateRecordRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as ParentSubscriptionRow[];
  const manualPayments = (manualPaymentsResult.data ?? []) as ParentManualPaymentRow[];
  const billingEvents = (billingEventsResult.data ?? []) as ParentBillingEventRow[];
  const groupIds = unique(memberships.filter((membership) => membership.status === "active" || membership.status === "trial").map((membership) => membership.group_id));
  const graduationEventIds = unique(graduationParticipants.map((participant) => participant.event_id));
  const paymentPlanIds = unique(subscriptions.map((subscription) => subscription.payment_plan_id));
  const [groupsResult, sessionsResult, graduationEventsResult] = await Promise.all([
    groupIds.length > 0
      ? admin
          .from("groups")
          .select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time")
          .eq("tenant_id", tenant.id)
          .in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length > 0
      ? admin
          .from("sessions")
          .select("id, group_id, resource_id, starts_at, ends_at, status, capacity_override, notes")
          .eq("tenant_id", tenant.id)
          .in("group_id", groupIds)
          .gte("starts_at", since.toISOString())
          .order("starts_at")
          .limit(80)
      : Promise.resolve({ data: [], error: null }),
    graduationEventIds.length > 0
      ? admin
          .from("graduation_events")
          .select("id, program_id, stage_id, resource_id, title, status, starts_at, ends_at, capacity, notes")
          .eq("tenant_id", tenant.id)
          .in("id", graduationEventIds)
          .order("starts_at", { ascending: false })
      : Promise.resolve({ data: [], error: null })
  ]);

  assertParentPortalResult(groupsResult.error, "groups");
  assertParentPortalResult(sessionsResult.error, "sessions");
  assertParentPortalResult(graduationEventsResult.error, "graduation events");

  const groups = (groupsResult.data ?? []) as GroupRow[];
  const graduationEvents = (graduationEventsResult.data ?? []) as ParentGraduationEventRow[];
  const programIds = unique(enrollments.map((enrollment) => enrollment.program_id).concat(groups.map((group) => group.program_id), certificates.map((certificate) => certificate.program_id), graduationEvents.flatMap((event) => (event.program_id ? [event.program_id] : []))));
  const stageIds = unique(
    enrollments
      .flatMap((enrollment) => (enrollment.current_stage_id ? [enrollment.current_stage_id] : []))
      .concat(groups.flatMap((group) => (group.stage_id ? [group.stage_id] : [])), certificates.map((certificate) => certificate.stage_id), graduationEvents.flatMap((event) => (event.stage_id ? [event.stage_id] : [])))
  );
  const resourceIds = unique(
    groups
      .flatMap((group) => (group.default_resource_id ? [group.default_resource_id] : []))
      .concat(((sessionsResult.data ?? []) as SessionRow[]).flatMap((session) => (session.resource_id ? [session.resource_id] : [])), graduationEvents.flatMap((event) => (event.resource_id ? [event.resource_id] : [])))
  );
  const [programsResult, stagesResult, resourcesResult, progressModulesResult, progressItemsResult, badgeDefinitionsResult, paymentPlansResult] = await Promise.all([
    programIds.length > 0 ? admin.from("programs").select("id, name, code, description, status, sort_order").eq("tenant_id", tenant.id).in("id", programIds) : Promise.resolve({ data: [], error: null }),
    stageIds.length > 0 ? admin.from("program_stages").select("id, program_id, name, code, badge_label, color_hex, status, sort_order").eq("tenant_id", tenant.id).in("id", stageIds) : Promise.resolve({ data: [], error: null }),
    resourceIds.length > 0 ? admin.from("resources").select("id, parent_resource_id, kind, name, code, capacity, status, sort_order").eq("tenant_id", tenant.id).in("id", resourceIds) : Promise.resolve({ data: [], error: null }),
    admin.from("progress_modules").select("id, program_id, stage_id, code, name, description, template_key, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order"),
    admin.from("progress_items").select("id, module_id, code, name, description, positive_goal, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order"),
    admin.from("badge_definitions").select("id, program_id, stage_id, code, name, description, icon_name, status, sort_order").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order").order("name"),
    paymentPlanIds.length > 0
      ? admin
          .from("payment_plans")
          .select("id, program_id, code, name, description, amount_cents, currency, billing_interval, billing_day, payment_terms_days, status")
          .eq("tenant_id", tenant.id)
          .in("id", paymentPlanIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  assertParentPortalResult(programsResult.error, "programs");
  assertParentPortalResult(stagesResult.error, "program stages");
  assertParentPortalResult(resourcesResult.error, "resources");
  assertParentPortalResult(progressModulesResult.error, "progress modules");
  assertParentPortalResult(progressItemsResult.error, "progress items");
  assertParentPortalResult(badgeDefinitionsResult.error, "badge definitions");
  assertParentPortalResult(paymentPlansResult.error, "payment plans");

  return {
    tenant,
    user: context.user,
    profile: (profileResult.data as ParentProfileRow | null) ?? null,
    settings: normalizeSettings(settingsResult.data),
    accessLinks: access.links,
    participants,
    enrollments,
    groupMemberships: memberships,
    groups,
    programs: (programsResult.data ?? []) as ProgramRow[],
    stages: (stagesResult.data ?? []) as ProgramStageRow[],
    resources: (resourcesResult.data ?? []) as ResourceRow[],
    sessions: (sessionsResult.data ?? []) as SessionRow[],
    cancellations: (cancellationsResult.data ?? []) as LessonCancellationRow[],
    catchUpCredits: (creditsResult.data ?? []) as CatchUpCreditRow[],
    progressModules: (progressModulesResult.data ?? []) as ParentProgressModuleRow[],
    progressItems: (progressItemsResult.data ?? []) as ParentProgressItemRow[],
    progressScores: (progressScoresResult.data ?? []) as ParentProgressScoreRow[],
    badgeAwards: (badgeAwardsResult.data ?? []) as ParentBadgeAwardRow[],
    badgeDefinitions: (badgeDefinitionsResult.data ?? []) as ParentBadgeDefinitionRow[],
    notifications: (notificationsResult.data ?? []) as ParentNotificationRow[],
    graduationEvents,
    graduationParticipants,
    certificates,
    paymentPlans: (paymentPlansResult.data ?? []) as ParentPaymentPlanRow[],
    subscriptions,
    manualPayments,
    billingEvents
  };
}

export async function loadParentParticipantAccess(tenantId: string, userId: string): Promise<{ participantIds: string[]; links: ParentAccessRow[] }> {
  const admin = createAdminClient();
  const [directParticipantsResult, guardianLinksResult] = await Promise.all([
    admin.from("participants").select("id").eq("tenant_id", tenantId).eq("guardian_user_id", userId),
    admin.from("participant_guardians").select("id, participant_id, relationship, access_level, status").eq("tenant_id", tenantId).eq("guardian_user_id", userId).eq("status", "active")
  ]);

  assertParentPortalResult(directParticipantsResult.error, "direct participants");
  assertParentPortalResult(guardianLinksResult.error, "participant guardian links");

  const directIds = ((directParticipantsResult.data ?? []) as { id: string }[]).map((participant) => participant.id);
  const links = (guardianLinksResult.data ?? []) as ParentAccessRow[];

  return {
    participantIds: unique([...directIds, ...links.map((link) => link.participant_id)]),
    links
  };
}

export function getNextLesson(data: ParentPortalData, participantId?: string) {
  const now = Date.now();
  const participantGroupIds = participantId ? getActiveMembershipsForParticipant(data, participantId).map((membership) => membership.group_id) : data.groupMemberships.map((membership) => membership.group_id);

  return data.sessions.find((session) => participantGroupIds.includes(session.group_id) && session.status === "scheduled" && new Date(session.starts_at).getTime() >= now) ?? null;
}

export function getActiveEnrollmentForParticipant(data: ParentPortalData, participantId: string) {
  return data.enrollments.find((enrollment) => enrollment.participant_id === participantId && enrollment.status === "active") ?? null;
}

export function getActiveMembershipsForParticipant(data: ParentPortalData, participantId: string) {
  return data.groupMemberships.filter((membership) => membership.participant_id === participantId && (membership.status === "active" || membership.status === "trial"));
}

export function canCancelSession(settings: ParentPortalSettings, startsAt: string) {
  const startsAtMs = new Date(startsAt).getTime();
  const now = Date.now();
  const cutoffMs = settings.lesson_cancellation_cutoff_hours * 60 * 60 * 1000;

  return startsAtMs > now && startsAtMs - now >= cutoffMs;
}

export function formatLessonDate(startsAt: string, endsAt?: string | null) {
  const start = new Date(startsAt);
  const date = new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long" }).format(start);
  const startTime = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(start);
  const endTime = endsAt ? new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(endsAt)) : null;

  return `${date}, ${startTime}${endTime ? ` - ${endTime}` : ""}`;
}

function normalizeSettings(value: unknown): ParentPortalSettings {
  const row = (value ?? {}) as Partial<ParentPortalSettings>;

  return {
    locale: row.locale ?? "nl-NL",
    timezone: row.timezone ?? "Europe/Amsterdam",
    lesson_cancellation_cutoff_hours: Number(row.lesson_cancellation_cutoff_hours ?? 12),
    lesson_cancellation_credit_window_days: Number(row.lesson_cancellation_credit_window_days ?? 60),
    lesson_cancellation_grants_credit: row.lesson_cancellation_grants_credit ?? true
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function assertParentPortalResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
