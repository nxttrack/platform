import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ParentGuardianRow = {
  id: string;
  participant_id: string;
  relationship: string;
  status: string;
};

export type ParentParticipantRow = {
  id: string;
  display_name: string;
  birthdate: string | null;
  status: string;
};

export type ParentEnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  subscription_plan_id: string | null;
  status: string;
  started_on: string;
  ended_on: string | null;
};

export type ParentProgramRow = {
  id: string;
  name: string;
  code: string;
};

export type ParentStageRow = {
  id: string;
  program_id: string;
  name: string;
  code: string;
  sort_order: number;
};

export type ParentStageModuleRow = {
  id: string;
  program_id: string;
  stage_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  status: string;
};

export type ParentSubscriptionPlanRow = {
  id: string;
  name: string;
  billing_interval: string;
  price_cents: number;
  currency: string;
  lesson_frequency_per_week: number;
};

export type ParentGroupMembershipRow = {
  id: string;
  enrollment_id: string;
  group_id: string;
  status: string;
  starts_on: string;
  ends_on: string | null;
};

export type ParentGroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  name: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type ParentSessionRow = {
  id: string;
  group_id: string;
  resource_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type ParentResourceRow = {
  id: string;
  name: string;
  location_name: string | null;
};

export type ParentProgressRow = {
  id: string;
  enrollment_id: string;
  stage_id: string | null;
  status: string;
  score: number | null;
  note: string | null;
  assessed_at: string;
};

export type ParentStageModuleProgressRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  stage_id: string;
  stage_module_id: string;
  status: string;
  score: number | null;
  note: string | null;
  assessed_at: string;
};

export type ParentBadgeRow = {
  id: string;
  program_id: string | null;
  stage_id: string | null;
  code: string;
  name: string;
  description: string | null;
  status: string;
};

export type ParentBadgeAwardRow = {
  id: string;
  badge_id: string;
  participant_id: string;
  enrollment_id: string | null;
  source: string;
  note: string | null;
  status: string;
  awarded_at: string;
};

export type ParentAchievementCardRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  badge_award_id: string | null;
  progress_id: string | null;
  stage_module_progress_id: string | null;
  card_type: string;
  title: string;
  body: string | null;
  status: string;
  visibility: string;
  published_at: string;
};

export type ParentStageTransitionProposalRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  reason: string | null;
  status: string;
  proposed_at: string;
  reviewed_at: string | null;
};

export type ParentCertificateRow = {
  id: string;
  enrollment_id: string | null;
  participant_id: string;
  program_id: string;
  certificate_number: string | null;
  title: string;
  status: string;
  issued_on: string | null;
  source_event_id: string | null;
  source_result_id: string | null;
  file_path: string | null;
  download_status: string;
  share_token: string | null;
  share_enabled: boolean;
  share_expires_at: string | null;
  vault_status: string;
};

export type ParentDocumentRow = {
  id: string;
  participant_id: string;
  enrollment_id: string | null;
  certificate_id: string | null;
  title: string;
  document_type: string;
  status: string;
  file_path: string | null;
  available_on: string | null;
  share_enabled: boolean;
  share_token: string | null;
  share_created_at: string | null;
  share_expires_at: string | null;
  share_revoked_at: string | null;
  download_count: number;
  last_downloaded_at: string | null;
  created_at: string;
};

export type ParentNotificationRow = {
  id: string;
  participant_id: string | null;
  enrollment_id: string | null;
  title: string;
  body: string | null;
  notification_type: string;
  status: string;
  read_at: string | null;
  created_at: string;
};

export type ParentCatchUpRequestRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  missed_session_id: string;
  makeup_credit_id: string | null;
  target_session_id: string | null;
  candidate_session_id: string | null;
  approval_mode: string;
  decision_reason: string | null;
  preferred_time_windows: string[];
  reason: string | null;
  status: string;
  requested_at: string;
  resolved_at: string | null;
};

export type ParentMakeupCreditRow = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  source_session_id: string | null;
  source_request_id: string | null;
  credit_code: string;
  status: string;
  reason: string | null;
  granted_by: string;
  granted_at: string;
  expires_at: string;
  used_session_id: string | null;
};

export type ParentMakeupCandidateSessionRow = {
  id: string;
  makeup_credit_id: string;
  session_id: string;
  group_id: string;
  score: number;
  status: string;
  reasons: Array<Record<string, string>>;
  blockers: Array<Record<string, string>>;
  capacity_snapshot: Record<string, unknown>;
  expires_at: string | null;
  selected_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export type ParentInvoiceRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  subscription_plan_id: string | null;
  invoice_number: string;
  title: string;
  description: string | null;
  period_start: string | null;
  period_end: string | null;
  issued_on: string;
  due_on: string | null;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  status: string;
  collection_method: string;
};

export type ParentPaymentRecordRow = {
  id: string;
  invoice_id: string;
  enrollment_id: string;
  participant_id: string;
  provider: string;
  provider_payment_id: string | null;
  provider_checkout_url: string | null;
  payment_method: string;
  amount_cents: number;
  currency: string;
  status: string;
  received_on: string | null;
  note: string | null;
  created_at: string;
};

export type ParentMilestoneEventRow = {
  id: string;
  program_id: string;
  stage_id: string | null;
  resource_id: string | null;
  event_type: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

export type ParentMilestoneEventParticipantRow = {
  id: string;
  milestone_event_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  invited_at: string;
  responded_at: string | null;
  note: string | null;
};

export type ParentMilestoneResultRow = {
  id: string;
  milestone_event_participant_id: string;
  milestone_event_id: string;
  enrollment_id: string;
  participant_id: string;
  program_id: string;
  result_status: string;
  score: number | null;
  note: string | null;
  registered_at: string;
  certificate_id: string | null;
};

export type ParentPortalData = {
  guardians: ParentGuardianRow[];
  participants: ParentParticipantRow[];
  enrollments: ParentEnrollmentRow[];
  programs: ParentProgramRow[];
  stages: ParentStageRow[];
  stageModules: ParentStageModuleRow[];
  subscriptionPlans: ParentSubscriptionPlanRow[];
  groupMemberships: ParentGroupMembershipRow[];
  groups: ParentGroupRow[];
  sessions: ParentSessionRow[];
  resources: ParentResourceRow[];
  progress: ParentProgressRow[];
  stageModuleProgress: ParentStageModuleProgressRow[];
  badges: ParentBadgeRow[];
  badgeAwards: ParentBadgeAwardRow[];
  achievementCards: ParentAchievementCardRow[];
  stageTransitionProposals: ParentStageTransitionProposalRow[];
  milestoneEvents: ParentMilestoneEventRow[];
  milestoneEventParticipants: ParentMilestoneEventParticipantRow[];
  milestoneResults: ParentMilestoneResultRow[];
  certificates: ParentCertificateRow[];
  documents: ParentDocumentRow[];
  notifications: ParentNotificationRow[];
  catchUpRequests: ParentCatchUpRequestRow[];
  makeupCredits: ParentMakeupCreditRow[];
  makeupCandidates: ParentMakeupCandidateSessionRow[];
  invoices: ParentInvoiceRow[];
  paymentRecords: ParentPaymentRecordRow[];
};

export type ParentPortalSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  user: {
    id: string;
    displayName: string | null;
    email: string | null;
  } | null;
  data: ParentPortalData;
  errors: string[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getParentPortalSnapshot(): Promise<ParentPortalSnapshot> {
  const emptyData = createEmptyData();
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      user: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor het ouderportaal."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };
  const user = {
    id: context.user.id,
    displayName: context.user.displayName,
    email: context.user.email
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      user,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;
  const profileId = user.id;
  const guardiansResult = await supabase
    .from("participant_guardians")
    .select("id, participant_id, relationship, status")
    .eq("tenant_id", tenantId)
    .eq("profile_id", profileId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  const notificationsResult = await supabase
    .from("parent_notifications")
    .select("id, participant_id, enrollment_id, title, body, notification_type, status, read_at, created_at")
    .eq("tenant_id", tenantId)
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(50);

  const guardians = asRows<ParentGuardianRow>(guardiansResult.data);
  const participantIds = unique(guardians.map((guardian) => guardian.participant_id));

  const participantsResult = await rowsByIds<ParentParticipantRow>(supabase, "participants", "id, display_name, birthdate, status", tenantId, "id", participantIds, "display_name");
  const enrollmentsResult = await rowsByIds<ParentEnrollmentRow>(
    supabase,
    "enrollments",
    "id, participant_id, program_id, current_stage_id, subscription_plan_id, status, started_on, ended_on",
    tenantId,
    "participant_id",
    participantIds,
    "started_on",
    false
  );
  const enrollments = enrollmentsResult.rows;
  const enrollmentIds = unique(enrollments.map((enrollment) => enrollment.id));
  const programIds = unique(enrollments.map((enrollment) => enrollment.program_id));
  const subscriptionPlanIds = unique(enrollments.flatMap((enrollment) => (enrollment.subscription_plan_id ? [enrollment.subscription_plan_id] : [])));

  const [
    membershipsResult,
    progressResult,
    moduleProgressResult,
    badgeAwardsResult,
    achievementCardsResult,
    transitionProposalsResult,
    milestoneEventParticipantsResult,
    milestoneResultsResult,
    certificatesResult,
    documentsResult,
    catchUpRequestsResult,
    makeupCreditsResult,
    invoicesResult,
    paymentRecordsResult,
    programsResult,
    stagesResult,
    subscriptionPlansResult
  ] = await Promise.all([
    rowsByIds<ParentGroupMembershipRow>(supabase, "group_memberships", "id, enrollment_id, group_id, status, starts_on, ends_on", tenantId, "enrollment_id", enrollmentIds, "starts_on", false),
    rowsByIds<ParentProgressRow>(supabase, "progress", "id, enrollment_id, stage_id, status, score, note, assessed_at", tenantId, "enrollment_id", enrollmentIds, "assessed_at", false, 25),
    rowsByIds<ParentStageModuleProgressRow>(
      supabase,
      "stage_module_progress",
      "id, enrollment_id, participant_id, stage_id, stage_module_id, status, score, note, assessed_at",
      tenantId,
      "enrollment_id",
      enrollmentIds,
      "assessed_at",
      false,
      80
    ),
    rowsByIds<ParentBadgeAwardRow>(supabase, "badge_awards", "id, badge_id, participant_id, enrollment_id, source, note, status, awarded_at", tenantId, "participant_id", participantIds, "awarded_at", false),
    rowsByIds<ParentAchievementCardRow>(
      supabase,
      "achievement_cards",
      "id, participant_id, enrollment_id, badge_award_id, progress_id, stage_module_progress_id, card_type, title, body, status, visibility, published_at",
      tenantId,
      "participant_id",
      participantIds,
      "published_at",
      false
    ),
    rowsByIds<ParentStageTransitionProposalRow>(
      supabase,
      "stage_transition_proposals",
      "id, enrollment_id, participant_id, from_stage_id, to_stage_id, reason, status, proposed_at, reviewed_at",
      tenantId,
      "enrollment_id",
      enrollmentIds,
      "proposed_at",
      false
    ),
    rowsByIds<ParentMilestoneEventParticipantRow>(
      supabase,
      "milestone_event_participants",
      "id, milestone_event_id, enrollment_id, participant_id, status, invited_at, responded_at, note",
      tenantId,
      "participant_id",
      participantIds,
      "invited_at",
      false
    ),
    rowsByIds<ParentMilestoneResultRow>(
      supabase,
      "milestone_results",
      "id, milestone_event_participant_id, milestone_event_id, enrollment_id, participant_id, program_id, result_status, score, note, registered_at, certificate_id",
      tenantId,
      "participant_id",
      participantIds,
      "registered_at",
      false
    ),
    rowsByIds<ParentCertificateRow>(
      supabase,
      "certificates",
      "id, enrollment_id, participant_id, program_id, certificate_number, title, status, issued_on, source_event_id, source_result_id, file_path, download_status, share_token, share_enabled, share_expires_at, vault_status",
      tenantId,
      "participant_id",
      participantIds,
      "created_at",
      false
    ),
    rowsByIds<ParentDocumentRow>(
      supabase,
      "parent_documents",
      "id, participant_id, enrollment_id, certificate_id, title, document_type, status, file_path, available_on, share_enabled, share_token, share_created_at, share_expires_at, share_revoked_at, download_count, last_downloaded_at, created_at",
      tenantId,
      "participant_id",
      participantIds,
      "created_at",
      false
    ),
    rowsByIds<ParentCatchUpRequestRow>(
      supabase,
      "lesson_catch_up_requests",
      "id, participant_id, enrollment_id, missed_session_id, makeup_credit_id, target_session_id, candidate_session_id, approval_mode, decision_reason, preferred_time_windows, reason, status, requested_at, resolved_at",
      tenantId,
      "participant_id",
      participantIds,
      "requested_at",
      false
    ),
    rowsByIds<ParentMakeupCreditRow>(
      supabase,
      "makeup_credits",
      "id, participant_id, enrollment_id, source_session_id, source_request_id, credit_code, status, reason, granted_by, granted_at, expires_at, used_session_id",
      tenantId,
      "participant_id",
      participantIds,
      "expires_at"
    ),
    rowsByIds<ParentInvoiceRow>(
      supabase,
      "invoices",
      "id, enrollment_id, participant_id, subscription_plan_id, invoice_number, title, description, period_start, period_end, issued_on, due_on, amount_due_cents, amount_paid_cents, currency, status, collection_method",
      tenantId,
      "enrollment_id",
      enrollmentIds,
      "issued_on",
      false
    ),
    rowsByIds<ParentPaymentRecordRow>(
      supabase,
      "payment_records",
      "id, invoice_id, enrollment_id, participant_id, provider, provider_payment_id, provider_checkout_url, payment_method, amount_cents, currency, status, received_on, note, created_at",
      tenantId,
      "enrollment_id",
      enrollmentIds,
      "created_at",
      false
    ),
    rowsByIds<ParentProgramRow>(supabase, "programs", "id, name, code", tenantId, "id", programIds, "name"),
    rowsByIds<ParentStageRow>(supabase, "stages", "id, program_id, name, code, sort_order", tenantId, "program_id", programIds, "sort_order"),
    rowsByIds<ParentSubscriptionPlanRow>(
      supabase,
      "subscription_plans",
      "id, name, billing_interval, price_cents, currency, lesson_frequency_per_week",
      tenantId,
      "id",
      subscriptionPlanIds,
      "name"
    )
  ]);
  const stages = stagesResult.rows;
  const makeupCreditIds = unique(makeupCreditsResult.rows.map((credit) => credit.id));
  const makeupCandidatesResult = await rowsByIds<ParentMakeupCandidateSessionRow>(
    supabase,
    "makeup_candidate_sessions",
    "id, makeup_credit_id, session_id, group_id, score, status, reasons, blockers, capacity_snapshot, expires_at, selected_at, reviewed_at, review_note",
    tenantId,
    "makeup_credit_id",
    makeupCreditIds,
    "score",
    false,
    80
  );
  const stageIds = unique(stages.map((stage) => stage.id));
  const stageModulesResult = await rowsByIds<ParentStageModuleRow>(
    supabase,
    "stage_modules",
    "id, program_id, stage_id, code, name, description, sort_order, status",
    tenantId,
    "stage_id",
    stageIds,
    "sort_order"
  );
  const badgeDefinitionsResult = await rowsByIds<ParentBadgeRow>(
    supabase,
    "badges",
    "id, program_id, stage_id, code, name, description, status",
    tenantId,
    "program_id",
    programIds,
    "name"
  );
  const milestoneEventIds = unique([
    ...milestoneEventParticipantsResult.rows.map((eventParticipant) => eventParticipant.milestone_event_id),
    ...milestoneResultsResult.rows.map((result) => result.milestone_event_id)
  ]);
  const milestoneEventsResult = await rowsByIds<ParentMilestoneEventRow>(
    supabase,
    "milestone_events",
    "id, program_id, stage_id, resource_id, event_type, title, description, starts_at, ends_at, status",
    tenantId,
    "id",
    milestoneEventIds,
    "starts_at",
    false
  );

  const memberships = membershipsResult.rows;
  const groupIds = unique([...memberships.map((membership) => membership.group_id), ...makeupCandidatesResult.rows.map((candidate) => candidate.group_id)]);
  const groupsResult = await rowsByIds<ParentGroupRow>(supabase, "groups", "id, program_id, stage_id, resource_id, name, weekday, starts_at, ends_at, status", tenantId, "id", groupIds, "weekday");
  const groups = groupsResult.rows;
  const resourceIds = unique(groups.flatMap((group) => (group.resource_id ? [group.resource_id] : [])));
  const sessionsResult = await rowsByIds<ParentSessionRow>(supabase, "sessions", "id, group_id, resource_id, starts_at, ends_at, status", tenantId, "group_id", groupIds, "starts_at", true, 80);
  const resourcesResult = await rowsByIds<ParentResourceRow>(supabase, "resources", "id, name, location_name", tenantId, "id", resourceIds, "name");

  const errors = collectErrors({
    participant_guardians: guardiansResult.error,
    parent_notifications: notificationsResult.error,
    participants: participantsResult.error,
    enrollments: enrollmentsResult.error,
    group_memberships: membershipsResult.error,
    progress: progressResult.error,
    stage_module_progress: moduleProgressResult.error,
    badge_awards: badgeAwardsResult.error,
    achievement_cards: achievementCardsResult.error,
    stage_transition_proposals: transitionProposalsResult.error,
    milestone_event_participants: milestoneEventParticipantsResult.error,
    milestone_results: milestoneResultsResult.error,
    milestone_events: milestoneEventsResult.error,
    certificates: certificatesResult.error,
    parent_documents: documentsResult.error,
    lesson_catch_up_requests: catchUpRequestsResult.error,
    makeup_credits: makeupCreditsResult.error,
    makeup_candidate_sessions: makeupCandidatesResult.error,
    invoices: invoicesResult.error,
    payment_records: paymentRecordsResult.error,
    programs: programsResult.error,
    stages: stagesResult.error,
    stage_modules: stageModulesResult.error,
    badges: badgeDefinitionsResult.error,
    subscription_plans: subscriptionPlansResult.error,
    groups: groupsResult.error,
    sessions: sessionsResult.error,
    resources: resourcesResult.error
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    user,
    errors,
    data: {
      guardians,
      participants: participantsResult.rows,
      enrollments,
      programs: programsResult.rows,
      stages,
      stageModules: stageModulesResult.rows,
      subscriptionPlans: subscriptionPlansResult.rows,
      groupMemberships: memberships,
      groups,
      sessions: sessionsResult.rows,
      resources: resourcesResult.rows,
      progress: progressResult.rows,
      stageModuleProgress: moduleProgressResult.rows,
      badges: badgeDefinitionsResult.rows,
      badgeAwards: badgeAwardsResult.rows,
      achievementCards: achievementCardsResult.rows,
      stageTransitionProposals: transitionProposalsResult.rows,
      milestoneEvents: milestoneEventsResult.rows,
      milestoneEventParticipants: milestoneEventParticipantsResult.rows,
      milestoneResults: milestoneResultsResult.rows,
      certificates: certificatesResult.rows,
      documents: documentsResult.rows,
      notifications: asRows<ParentNotificationRow>(notificationsResult.data),
      catchUpRequests: catchUpRequestsResult.rows,
      makeupCredits: makeupCreditsResult.rows,
      makeupCandidates: makeupCandidatesResult.rows,
      invoices: invoicesResult.rows,
      paymentRecords: paymentRecordsResult.rows
    }
  };
}

async function rowsByIds<Row>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  tenantId: string,
  column: string,
  ids: string[],
  orderColumn: string,
  ascending = true,
  limit?: number
): Promise<{ rows: Row[]; error: { message: string } | null }> {
  if (ids.length === 0) {
    return { rows: [], error: null };
  }

  let query = supabase.from(table).select(select).eq("tenant_id", tenantId).in(column, ids).order(orderColumn, { ascending });

  if (limit) {
    query = query.limit(limit);
  }

  const result = await query;

  return {
    rows: asRows<Row>(result.data),
    error: result.error
  };
}

function createEmptyData(): ParentPortalData {
  return {
    guardians: [],
    participants: [],
    enrollments: [],
    programs: [],
    stages: [],
    stageModules: [],
    subscriptionPlans: [],
    groupMemberships: [],
    groups: [],
    sessions: [],
    resources: [],
    progress: [],
    stageModuleProgress: [],
    badges: [],
    badgeAwards: [],
    achievementCards: [],
    stageTransitionProposals: [],
    milestoneEvents: [],
    milestoneEventParticipants: [],
    milestoneResults: [],
    certificates: [],
    documents: [],
    notifications: [],
    catchUpRequests: [],
    makeupCredits: [],
    makeupCandidates: [],
    invoices: [],
    paymentRecords: []
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
