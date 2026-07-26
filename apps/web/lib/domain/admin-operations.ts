import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantCoreData, type TenantCoreData, type TenantUserOption } from "./core";
import type { BillingEventRow, ManualPaymentRow, SubscriptionRow } from "./billing";
import type { IntakeSubmissionRow } from "./intake";
import type { SlotOfferRow, WaitlistEntryRow } from "./placement";

export type AdminMessageRow = {
  id: string;
  author_user_id: string | null;
  title: string;
  body: string;
  audience: string;
  visibility: string;
  status: string;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminTaskRow = {
  id: string;
  created_by_user_id: string | null;
  assigned_to_user_id: string | null;
  related_participant_id: string | null;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminDocumentRow = {
  id: string;
  uploaded_by_user_id: string | null;
  title: string;
  description: string | null;
  audience: string;
  visibility: string;
  status: string;
  file_name: string | null;
  file_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_bucket: string;
  storage_status: string;
  content_classification: string;
  malware_scan_status: string;
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailDeliveryAttemptRow = {
  id: string;
  recipient_user_id: string | null;
  recipient_email: string;
  provider: string;
  provider_source: string | null;
  template_key: string;
  subject: string;
  status: string;
  error_message: string | null;
  related_type: string | null;
  related_id: string | null;
  attempted_at: string;
  delivered_at: string | null;
};

export type AdminReportSnapshotRow = {
  id: string;
  report_key: string;
  title: string;
  period_start: string | null;
  period_end: string | null;
  metrics: Record<string, unknown>;
  generated_by_user_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AdminEventRow = {
  id: string;
  event_type: string;
  subject_type: string;
  subject_id: string;
  status: string;
  created_at: string;
};

export type AdminProgressScoreSummary = {
  id: string;
  participant_id: string;
  score: number;
  visibility: string;
  status: string;
  scored_at: string;
};

export type AdminAttendanceSummary = {
  id: string;
  session_id: string;
  participant_id: string;
  status: string;
  marked_at: string;
};

export type AdminGraduationReadinessSummary = {
  id: string;
  participant_id: string;
  enrollment_id: string;
  status: string;
  readiness_score: number | null;
  reviewed_at: string;
};

export type AdminGraduationEventSummary = {
  id: string;
  title: string;
  status: string;
  starts_at: string;
  ends_at: string;
};

export type AdminKpis = {
  activeEnrollments: number;
  scheduledSessions: number;
  openCapacity: number;
  receivedIntake: number;
  openWaitlist: number;
  pendingSlotOffers: number;
  overduePayments: number;
  overdueAmountCents: number;
  openTasks: number;
  urgentTasks: number;
  unreadNotifications: number;
  publishedMessages: number;
  activeDocuments: number;
  averageProgressScore: number | null;
  upcomingGraduationEvents: number;
};

export type BasicReport = {
  key: string;
  title: string;
  metrics: Array<{ label: string; value: string; tone?: "success" | "warning" | "danger" | "neutral" }>;
};

export type AdminOperationsData = TenantCoreData & {
  staffUsers: TenantUserOption[];
  messages: AdminMessageRow[];
  tasks: AdminTaskRow[];
  documents: AdminDocumentRow[];
  emailDeliveryAttempts: EmailDeliveryAttemptRow[];
  reportSnapshots: AdminReportSnapshotRow[];
  intakeSubmissions: IntakeSubmissionRow[];
  waitlistEntries: WaitlistEntryRow[];
  slotOffers: SlotOfferRow[];
  manualPayments: ManualPaymentRow[];
  subscriptions: SubscriptionRow[];
  billingEvents: BillingEventRow[];
  tenantEvents: AdminEventRow[];
  progressScores: AdminProgressScoreSummary[];
  attendance: AdminAttendanceSummary[];
  graduationReadiness: AdminGraduationReadinessSummary[];
  graduationEvents: AdminGraduationEventSummary[];
  kpis: AdminKpis;
  reports: BasicReport[];
};

export async function getAdminOperationsData(): Promise<AdminOperationsData> {
  const core = await getTenantCoreData();
  const admin = createAdminClient();
  const [
    messagesResult,
    tasksResult,
    documentsResult,
    reportSnapshotsResult,
    intakeResult,
    waitlistResult,
    slotOffersResult,
    paymentsResult,
    subscriptionsResult,
    billingEventsResult,
    tenantEventsResult,
    emailDeliveryAttemptsResult,
    progressScoresResult,
    attendanceResult,
    readinessResult,
    graduationEventsResult,
    tenantMembershipsResult,
    notificationsResult
  ] = await Promise.all([
    admin
      .from("tenant_messages")
      .select("id, author_user_id, title, body, audience, visibility, status, published_at, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("tenant_tasks")
      .select("id, created_by_user_id, assigned_to_user_id, related_participant_id, title, description, priority, status, due_on, completed_at, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("due_on", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    admin
      .from("tenant_documents")
      .select("id, uploaded_by_user_id, title, description, audience, visibility, status, file_name, file_path, mime_type, size_bytes, storage_bucket, storage_status, content_classification, malware_scan_status, uploaded_at, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("tenant_report_snapshots")
      .select("id, report_key, title, period_start, period_end, metrics, generated_by_user_id, status, created_at, updated_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("intake_submissions")
      .select("id, program_id, selected_option, parent_name, parent_email, parent_phone, secondary_parent_name, secondary_parent_email, secondary_parent_phone, participant_name, participant_birth_date, preferred_days, preferred_dayparts, preferred_notes, message, swimming_experience, recommendation_snapshot, selected_group_id, selected_wait_band, recommendation_version, status, received_at, duplicate_state, duplicate_of_submission_id, source, is_test, journey_run_id, attribution_channel, attribution_source, attribution_medium, attribution_campaign, attribution_content, attribution_term, attribution_referrer_host, attribution_landing_path, attribution_has_ad_click_id, attribution_captured_at, analytics_consent, analytics_consent_version")
      .eq("tenant_id", core.tenant.id)
      .order("received_at", { ascending: false }),
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, admin_notes")
      .eq("tenant_id", core.tenant.id)
      .order("priority_date"),
    admin
      .from("slot_offers")
      .select("id, waitlist_entry_id, group_id, status, delivery_status, delivery_error, parent_email, expires_at, responded_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false }),
    admin
      .from("manual_payments")
      .select("id, subscription_id, participant_id, enrollment_id, guardian_user_id, amount_cents, currency, due_on, paid_on, status, reference, method, notes, recorded_by_user_id")
      .eq("tenant_id", core.tenant.id)
      .order("due_on", { ascending: false }),
    admin
      .from("subscriptions")
      .select("id, participant_id, enrollment_id, guardian_user_id, payment_plan_id, status, starts_on, ends_on, next_due_on, amount_cents, currency, billing_interval, notes")
      .eq("tenant_id", core.tenant.id)
      .order("starts_on", { ascending: false }),
    admin
      .from("billing_events")
      .select("id, subscription_id, manual_payment_id, participant_id, guardian_user_id, type, status, occurred_at, message")
      .eq("tenant_id", core.tenant.id)
      .order("occurred_at", { ascending: false })
      .limit(80),
    admin
      .from("tenant_events")
      .select("id, event_type, subject_type, subject_id, status, created_at")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
      .limit(80),
    admin
      .from("email_delivery_attempts")
      .select("id, recipient_user_id, recipient_email, provider, provider_source, template_key, subject, status, error_message, related_type, related_id, attempted_at, delivered_at")
      .eq("tenant_id", core.tenant.id)
      .order("attempted_at", { ascending: false })
      .limit(80),
    admin
      .from("participant_progress_scores")
      .select("id, participant_id, score, visibility, status, scored_at")
      .eq("tenant_id", core.tenant.id)
      .order("scored_at", { ascending: false })
      .limit(200),
    admin
      .from("session_attendance")
      .select("id, session_id, participant_id, status, marked_at")
      .eq("tenant_id", core.tenant.id)
      .order("marked_at", { ascending: false })
      .limit(200),
    admin
      .from("graduation_readiness")
      .select("id, participant_id, enrollment_id, status, readiness_score, reviewed_at")
      .eq("tenant_id", core.tenant.id)
      .order("reviewed_at", { ascending: false })
      .limit(200),
    admin
      .from("graduation_events")
      .select("id, title, status, starts_at, ends_at")
      .eq("tenant_id", core.tenant.id)
      .order("starts_at", { ascending: true })
      .limit(80),
    admin.from("tenant_memberships").select("user_id, role").eq("tenant_id", core.tenant.id).eq("status", "active"),
    admin.from("tenant_notifications").select("id, status").eq("tenant_id", core.tenant.id).eq("status", "unread")
  ]);

  assertAdminOpsResult(messagesResult.error, "tenant messages");
  assertAdminOpsResult(tasksResult.error, "tenant tasks");
  assertAdminOpsResult(documentsResult.error, "tenant documents");
  assertAdminOpsResult(reportSnapshotsResult.error, "report snapshots");
  assertAdminOpsResult(intakeResult.error, "intake submissions");
  assertAdminOpsResult(waitlistResult.error, "waitlist entries");
  assertAdminOpsResult(slotOffersResult.error, "slot offers");
  assertAdminOpsResult(paymentsResult.error, "manual payments");
  assertAdminOpsResult(subscriptionsResult.error, "subscriptions");
  assertAdminOpsResult(billingEventsResult.error, "billing events");
  assertAdminOpsResult(tenantEventsResult.error, "tenant events");
  assertAdminOpsResult(emailDeliveryAttemptsResult.error, "email delivery attempts");
  assertAdminOpsResult(progressScoresResult.error, "progress scores");
  assertAdminOpsResult(attendanceResult.error, "session attendance");
  assertAdminOpsResult(readinessResult.error, "graduation readiness");
  assertAdminOpsResult(graduationEventsResult.error, "graduation events");
  assertAdminOpsResult(tenantMembershipsResult.error, "tenant memberships");
  assertAdminOpsResult(notificationsResult.error, "notifications");

  const messages = (messagesResult.data ?? []) as AdminMessageRow[];
  const tasks = (tasksResult.data ?? []) as AdminTaskRow[];
  const documents = (documentsResult.data ?? []) as AdminDocumentRow[];
  const reportSnapshots = (reportSnapshotsResult.data ?? []) as AdminReportSnapshotRow[];
  const intakeSubmissions = (intakeResult.data ?? []) as IntakeSubmissionRow[];
  const waitlistEntries = (waitlistResult.data ?? []) as WaitlistEntryRow[];
  const slotOffers = (slotOffersResult.data ?? []) as SlotOfferRow[];
  const manualPayments = (paymentsResult.data ?? []) as ManualPaymentRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as SubscriptionRow[];
  const billingEvents = (billingEventsResult.data ?? []) as BillingEventRow[];
  const tenantEvents = (tenantEventsResult.data ?? []) as AdminEventRow[];
  const emailDeliveryAttempts = (emailDeliveryAttemptsResult.data ?? []) as EmailDeliveryAttemptRow[];
  const progressScores = (progressScoresResult.data ?? []) as AdminProgressScoreSummary[];
  const attendance = (attendanceResult.data ?? []) as AdminAttendanceSummary[];
  const graduationReadiness = (readinessResult.data ?? []) as AdminGraduationReadinessSummary[];
  const graduationEvents = (graduationEventsResult.data ?? []) as AdminGraduationEventSummary[];
  const staffUsers = await loadStaffUsers(((tenantMembershipsResult.data ?? []) as { user_id: string; role: string }[]).filter(isStaffMembership));
  const kpis = buildKpis({
    core,
    messages,
    tasks,
    documents,
    intakeSubmissions,
    waitlistEntries,
    slotOffers,
    manualPayments,
    progressScores,
    graduationEvents,
    unreadNotifications: ((notificationsResult.data ?? []) as { id: string }[]).length
  });

  return {
    ...core,
    staffUsers,
    messages,
    tasks,
    documents,
    reportSnapshots,
    intakeSubmissions,
    waitlistEntries,
    slotOffers,
    manualPayments,
    subscriptions,
    billingEvents,
    tenantEvents,
    emailDeliveryAttempts,
    progressScores,
    attendance,
    graduationReadiness,
    graduationEvents,
    kpis,
    reports: buildReports({
      core,
      kpis,
      intakeSubmissions,
      waitlistEntries,
      slotOffers,
      manualPayments,
      subscriptions,
      progressScores,
      attendance,
      graduationReadiness
    })
  };
}

export function buildReportMetricsSnapshot(data: AdminOperationsData, reportKey: string) {
  const report = data.reports.find((item) => item.key === reportKey) ?? data.reports[0];

  return {
    key: report.key,
    metrics: Object.fromEntries(report.metrics.map((metric) => [metric.label, metric.value]))
  };
}

export function formatMoney(cents: number, currency = "EUR") {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(cents / 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function isTaskOverdue(task: Pick<AdminTaskRow, "status" | "due_on">) {
  return !!task.due_on && task.status !== "done" && task.status !== "cancelled" && new Date(task.due_on).getTime() < startOfToday().getTime();
}

function buildKpis(input: {
  core: TenantCoreData;
  messages: AdminMessageRow[];
  tasks: AdminTaskRow[];
  documents: AdminDocumentRow[];
  intakeSubmissions: IntakeSubmissionRow[];
  waitlistEntries: WaitlistEntryRow[];
  slotOffers: SlotOfferRow[];
  manualPayments: ManualPaymentRow[];
  progressScores: AdminProgressScoreSummary[];
  graduationEvents: AdminGraduationEventSummary[];
  unreadNotifications: number;
}): AdminKpis {
  const activeMemberships = input.core.groupMemberships.filter((membership) => membership.status === "active" || membership.status === "trial");
  const openCapacity = input.core.groups.reduce((total, group) => {
    const capacity = input.core.groupCapacity.find((item) => item.groupId === group.id);

    return total + Math.max(0, capacity?.available ?? 0);
  }, 0);
  const overduePayments = input.manualPayments.filter((payment) => isPaymentOverdue(payment));
  const activeProgressScores = input.progressScores.filter((score) => score.status === "active");
  const scoreTotal = activeProgressScores.reduce((total, score) => total + score.score, 0);

  return {
    activeEnrollments: input.core.enrollments.filter((enrollment) => enrollment.status === "active").length,
    scheduledSessions: input.core.sessions.filter((session) => session.status === "scheduled").length,
    openCapacity,
    receivedIntake: input.intakeSubmissions.filter((submission) => submission.status === "received" || submission.status === "reviewing").length,
    openWaitlist: input.waitlistEntries.filter((entry) => entry.status === "waiting" || entry.status === "reviewing").length,
    pendingSlotOffers: input.slotOffers.filter((offer) => offer.status === "sent" || offer.status === "pending").length,
    overduePayments: overduePayments.length,
    overdueAmountCents: overduePayments.reduce((total, payment) => total + payment.amount_cents, 0),
    openTasks: input.tasks.filter((task) => task.status === "open" || task.status === "in_progress").length,
    urgentTasks: input.tasks.filter((task) => task.priority === "urgent" && task.status !== "done" && task.status !== "cancelled").length,
    unreadNotifications: input.unreadNotifications,
    publishedMessages: input.messages.filter((message) => message.status === "published").length,
    activeDocuments: input.documents.filter((document) => document.status === "active").length,
    averageProgressScore: activeProgressScores.length > 0 ? Number((scoreTotal / activeProgressScores.length).toFixed(1)) : null,
    upcomingGraduationEvents: input.graduationEvents.filter((event) => (event.status === "planned" || event.status === "published") && new Date(event.starts_at).getTime() >= Date.now()).length
  };
}

function buildReports(input: {
  core: TenantCoreData;
  kpis: AdminKpis;
  intakeSubmissions: IntakeSubmissionRow[];
  waitlistEntries: WaitlistEntryRow[];
  slotOffers: SlotOfferRow[];
  manualPayments: ManualPaymentRow[];
  subscriptions: SubscriptionRow[];
  progressScores: AdminProgressScoreSummary[];
  attendance: AdminAttendanceSummary[];
  graduationReadiness: AdminGraduationReadinessSummary[];
}): BasicReport[] {
  const attended = input.attendance.filter((item) => item.status === "present" || item.status === "trial").length;
  const absent = input.attendance.filter((item) => item.status === "absent" || item.status === "excused").length;
  const attendanceTotal = attended + absent;
  const attendanceRate = attendanceTotal > 0 ? `${Math.round((attended / attendanceTotal) * 100)}%` : "n.v.t.";
  const openPayments = input.manualPayments.filter((payment) => payment.status === "due" || payment.status === "overdue");
  const paidPayments = input.manualPayments.filter((payment) => payment.status === "paid");

  return [
    {
      key: "operations",
      title: "Operations",
      metrics: [
        { label: "Actieve inschrijvingen", value: input.kpis.activeEnrollments.toString(), tone: "success" },
        { label: "Geplande lessen", value: input.kpis.scheduledSessions.toString() },
        { label: "Vrije capaciteit", value: input.kpis.openCapacity.toString(), tone: input.kpis.openCapacity > 0 ? "success" : "warning" },
        { label: "Open taken", value: input.kpis.openTasks.toString(), tone: input.kpis.urgentTasks > 0 ? "danger" : "neutral" }
      ]
    },
    {
      key: "intake",
      title: "Intake en plaatsing",
      metrics: [
        { label: "Nieuwe intake", value: input.kpis.receivedIntake.toString(), tone: input.kpis.receivedIntake > 0 ? "warning" : "neutral" },
        { label: "Wachtlijst open", value: input.kpis.openWaitlist.toString() },
        { label: "Slot offers pending", value: input.kpis.pendingSlotOffers.toString() },
        { label: "Geplaatste entries", value: input.waitlistEntries.filter((entry) => entry.status === "placed").length.toString(), tone: "success" }
      ]
    },
    {
      key: "billing",
      title: "Billing",
      metrics: [
        { label: "Actieve subscriptions", value: input.subscriptions.filter((subscription) => subscription.status === "active").length.toString(), tone: "success" },
        { label: "Open betalingen", value: openPayments.length.toString(), tone: openPayments.length > 0 ? "warning" : "neutral" },
        { label: "Overdue bedrag", value: formatMoney(input.kpis.overdueAmountCents), tone: input.kpis.overdueAmountCents > 0 ? "danger" : "success" },
        { label: "Betaald", value: formatMoney(paidPayments.reduce((total, payment) => total + payment.amount_cents, 0)), tone: "success" }
      ]
    },
    {
      key: "progress",
      title: "Progress en zwemzaal",
      metrics: [
        { label: "Gemiddelde score", value: input.kpis.averageProgressScore?.toString() ?? "n.v.t.", tone: input.kpis.averageProgressScore && input.kpis.averageProgressScore >= 4 ? "success" : "neutral" },
        { label: "Recente scores", value: input.progressScores.length.toString() },
        { label: "Aanwezigheid", value: attendanceRate, tone: attendanceRate === "n.v.t." ? "neutral" : "success" },
        { label: "Afzwem-ready", value: input.graduationReadiness.filter((item) => item.status === "ready").length.toString(), tone: "success" }
      ]
    }
  ];
}

async function loadStaffUsers(memberships: { user_id: string; role: string }[]): Promise<TenantUserOption[]> {
  const admin = createAdminClient();
  const userIds = [...new Set(memberships.map((membership) => membership.user_id))];

  if (userIds.length === 0) {
    return [];
  }

  const { data, error } = await admin.from("profiles").select("id, full_name, email").in("id", userIds);

  assertAdminOpsResult(error, "staff profiles");

  return ((data ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((profile) => ({
      userId: profile.id,
      label: profile.full_name || profile.email || profile.id,
      email: profile.email
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isStaffMembership(membership: { role: string }) {
  return membership.role === "tenant_owner" || membership.role === "tenant_admin" || membership.role === "tenant_staff" || membership.role === "instructor";
}

function isPaymentOverdue(payment: Pick<ManualPaymentRow, "status" | "due_on">) {
  return payment.status !== "paid" && payment.status !== "waived" && payment.status !== "cancelled" && new Date(payment.due_on).getTime() < startOfToday().getTime();
}

function startOfToday() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  return today;
}

function assertAdminOpsResult(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}
