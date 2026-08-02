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
import {
  loadCanonicalSwimJourneys,
  type CanonicalSwimJourneyData
} from "./swim-progress";

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

export type ParentMakeupCommunicationPreferences = {
  makeUpInAppEnabled: boolean;
  makeUpEmailEnabled: boolean;
  automaticMakeUpInvitesEnabled: boolean;
  inAppEnabled: boolean;
  transactionalEmailEnabled: boolean;
  newsletterEmailEnabled: boolean;
  marketingConsentStatus: "unknown" | "granted" | "denied" | "withdrawn";
};

export type ParentPortalSettings = {
  locale: string;
  timezone: string;
  assessment_rating_display: "smileys" | "stars";
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
  scale_version: "five_point_v1";
  source_scale_version: "five_point_v1" | "three_point_legacy";
  source_value: 1 | 2 | 3 | null;
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
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_status: string;
  notes: string | null;
  verification_public_id: string;
  verification_status: string;
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
  collection_method: string;
  provider_config_id: string | null;
  billing_provider_customer_id: string | null;
  billing_mandate_id: string | null;
  billing_anchor_day: number | null;
  current_period_start: string | null;
  current_period_end: string | null;
  lifecycle_status_reason: string | null;
  paused_at: string | null;
  cancelled_at: string | null;
  completed_at: string | null;
  notes: string | null;
};

export type ParentManualPaymentRow = {
  id: string;
  subscription_id: string;
  participant_id: string;
  enrollment_id: string;
  guardian_user_id: string | null;
  amount_cents: number;
  refunded_cents: number;
  chargeback_cents: number;
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
  payment_session_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  type: string;
  status: string;
  occurred_at: string;
  message: string;
};

export type ParentPaymentSessionRow = {
  id: string;
  provider_config_id: string | null;
  subscription_id: string | null;
  manual_payment_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  provider: string;
  provider_session_id: string | null;
  sequence_type: string;
  billing_provider_customer_id: string | null;
  billing_mandate_id: string | null;
  collection_attempt_id: string | null;
  consent_terms_version: string | null;
  consent_initiated_at: string | null;
  checkout_url: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  expires_at: string | null;
  created_at: string;
};

export type ParentBillingProviderCustomerRow = {
  id: string;
  provider_config_id: string;
  guardian_user_id: string | null;
  provider: string;
  provider_customer_id: string;
  status: string;
  last_synced_at: string | null;
};

export type ParentBillingMandateRow = {
  id: string;
  provider_config_id: string;
  provider_customer_id: string;
  guardian_user_id: string | null;
  provider: string;
  provider_mandate_id: string;
  method: string;
  status: string;
  signature_date: string | null;
  mandate_reference: string | null;
  account_holder: string | null;
  account_last4: string | null;
  consent_source: string;
  consent_terms_version: string | null;
  consent_recorded_at: string | null;
  revoked_at: string | null;
  last_synced_at: string | null;
};

export type ParentBillingCollectionAttemptRow = {
  id: string;
  provider_config_id: string;
  subscription_id: string;
  manual_payment_id: string;
  billing_provider_customer_id: string;
  billing_mandate_id: string;
  guardian_user_id: string | null;
  sequence_type: string;
  attempt_number: number;
  status: string;
  scheduled_for: string;
  prenotified_at: string | null;
  prenotification_delivery_status: string | null;
  initiated_at: string | null;
  completed_at: string | null;
  provider_payment_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
};

export type ParentBillingRefundRow = {
  id: string;
  payment_session_id: string;
  manual_payment_id: string;
  participant_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  description: string;
  requested_at: string;
  completed_at: string | null;
  failure_message: string | null;
};

export type ParentBillingChargebackRow = {
  id: string;
  payment_session_id: string;
  manual_payment_id: string;
  participant_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  reason_code: string | null;
  occurred_at: string;
  reversed_at: string | null;
};

export type ParentBillingInvoiceRow = {
  id: string;
  subscription_id: string | null;
  manual_payment_id: string | null;
  participant_id: string | null;
  guardian_user_id: string | null;
  invoice_number: string | null;
  status: string;
  issued_on: string | null;
  due_on: string | null;
  paid_on: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  currency: string;
  export_status: string;
  notes: string | null;
  created_at: string;
};

export type ParentBillingInvoiceLineRow = {
  id: string;
  invoice_id: string;
  manual_payment_id: string | null;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  tax_rate_basis_points: number;
  total_cents: number;
  sort_order: number;
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
  mutableParticipantIds: string[];
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
  swimJourneys: CanonicalSwimJourneyData;
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
  paymentSessions: ParentPaymentSessionRow[];
  providerCustomers: ParentBillingProviderCustomerRow[];
  mandates: ParentBillingMandateRow[];
  collectionAttempts: ParentBillingCollectionAttemptRow[];
  refunds: ParentBillingRefundRow[];
  chargebacks: ParentBillingChargebackRow[];
  invoices: ParentBillingInvoiceRow[];
  invoiceLines: ParentBillingInvoiceLineRow[];
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
      .select("locale, timezone, assessment_rating_display, lesson_cancellation_cutoff_hours, lesson_cancellation_credit_window_days, lesson_cancellation_grants_credit")
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
    billingEventsResult,
    paymentSessionsResult,
    providerCustomersResult,
    mandatesResult,
    collectionAttemptsResult,
    refundsResult,
    chargebacksResult,
    invoicesResult
  ] = await Promise.all([
    loadedParticipantIds.length > 0
      ? admin
          .from("enrollments")
          .select("id, participant_id, guardian_user_id, program_id, current_stage_id, curriculum_version_id, status, source, starts_on")
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
          .select("id, participant_id, enrollment_id, module_id, item_id, session_id, score, scale_version, source_scale_version, source_value, positive_label, note, visibility, status, scored_at")
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
          .select("id, participant_id, enrollment_id, program_id, stage_id, event_participant_id, certificate_number, title, status, issued_on, file_path, file_name, mime_type, size_bytes, storage_status, notes, verification_public_id, verification_status")
          .eq("tenant_id", tenant.id)
          .eq("status", "issued")
          .in("participant_id", loadedParticipantIds)
          .order("issued_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("subscriptions")
          .select("id, participant_id, enrollment_id, guardian_user_id, payment_plan_id, status, starts_on, ends_on, next_due_on, amount_cents, currency, billing_interval, collection_method, provider_config_id, billing_provider_customer_id, billing_mandate_id, billing_anchor_day, current_period_start, current_period_end, lifecycle_status_reason, paused_at, cancelled_at, completed_at, notes")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("starts_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("manual_payments")
          .select("id, subscription_id, participant_id, enrollment_id, guardian_user_id, amount_cents, refunded_cents, chargeback_cents, currency, due_on, paid_on, status, reference, method, notes")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("due_on", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("billing_events")
          .select("id, subscription_id, manual_payment_id, payment_session_id, participant_id, guardian_user_id, type, status, occurred_at, message")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("occurred_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [], error: null }),
    loadedParticipantIds.length > 0
      ? admin
          .from("payment_sessions")
          .select("id, provider_config_id, subscription_id, manual_payment_id, participant_id, guardian_user_id, provider, provider_session_id, sequence_type, billing_provider_customer_id, billing_mandate_id, collection_attempt_id, consent_terms_version, consent_initiated_at, checkout_url, amount_cents, currency, status, failure_code, failure_message, expires_at, created_at")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("created_at", { ascending: false })
          .limit(40)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("billing_provider_customers")
      .select("id, provider_config_id, guardian_user_id, provider, provider_customer_id, status, last_synced_at")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("billing_mandates")
      .select("id, provider_config_id, provider_customer_id, guardian_user_id, provider, provider_mandate_id, method, status, signature_date, mandate_reference, account_holder, account_last4, consent_source, consent_terms_version, consent_recorded_at, revoked_at, last_synced_at")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("billing_collection_attempts")
      .select("id, provider_config_id, subscription_id, manual_payment_id, billing_provider_customer_id, billing_mandate_id, guardian_user_id, sequence_type, attempt_number, status, scheduled_for, prenotified_at, prenotification_delivery_status, initiated_at, completed_at, provider_payment_id, failure_code, failure_message")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("billing_refunds")
      .select("id, payment_session_id, manual_payment_id, participant_id, amount_cents, currency, status, description, requested_at, completed_at, failure_message")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(40),
    admin
      .from("billing_chargebacks")
      .select("id, payment_session_id, manual_payment_id, participant_id, amount_cents, currency, status, reason_code, occurred_at, reversed_at")
      .eq("tenant_id", tenant.id)
      .eq("guardian_user_id", context.user.id)
      .order("occurred_at", { ascending: false })
      .limit(40),
    loadedParticipantIds.length > 0
      ? admin
          .from("billing_invoices")
          .select("id, subscription_id, manual_payment_id, participant_id, guardian_user_id, invoice_number, status, issued_on, due_on, paid_on, subtotal_cents, tax_cents, total_cents, currency, export_status, notes, created_at")
          .eq("tenant_id", tenant.id)
          .in("participant_id", loadedParticipantIds)
          .order("created_at", { ascending: false })
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
  assertParentPortalResult(paymentSessionsResult.error, "payment sessions");
  assertParentPortalResult(providerCustomersResult.error, "billing provider customers");
  assertParentPortalResult(mandatesResult.error, "billing mandates");
  assertParentPortalResult(collectionAttemptsResult.error, "billing collection attempts");
  assertParentPortalResult(refundsResult.error, "billing refunds");
  assertParentPortalResult(chargebacksResult.error, "billing chargebacks");
  assertParentPortalResult(invoicesResult.error, "billing invoices");

  const enrollments = (enrollmentsResult.data ?? []) as EnrollmentRow[];
  const memberships = (membershipsResult.data ?? []) as GroupMembershipRow[];
  const graduationParticipants = (graduationParticipantsResult.data ?? []) as ParentGraduationParticipantRow[];
  const certificates = (certificatesResult.data ?? []) as ParentCertificateRecordRow[];
  const subscriptions = (subscriptionsResult.data ?? []) as ParentSubscriptionRow[];
  const manualPayments = (manualPaymentsResult.data ?? []) as ParentManualPaymentRow[];
  const billingEvents = (billingEventsResult.data ?? []) as ParentBillingEventRow[];
  const paymentSessions = (paymentSessionsResult.data ?? []) as ParentPaymentSessionRow[];
  const providerCustomers = (providerCustomersResult.data ?? []) as ParentBillingProviderCustomerRow[];
  const mandates = (mandatesResult.data ?? []) as ParentBillingMandateRow[];
  const collectionAttempts = (collectionAttemptsResult.data ?? []) as ParentBillingCollectionAttemptRow[];
  const refunds = (refundsResult.data ?? []) as ParentBillingRefundRow[];
  const chargebacks = (chargebacksResult.data ?? []) as ParentBillingChargebackRow[];
  const invoices = (invoicesResult.data ?? []) as ParentBillingInvoiceRow[];
  const swimJourneys = await loadCanonicalSwimJourneys({
    tenantId: tenant.id,
    enrollments,
    parentVisibleOnly: true
  });
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const invoiceLinesResult =
    invoiceIds.length > 0
      ? await admin
          .from("billing_invoice_lines")
          .select("id, invoice_id, manual_payment_id, description, quantity, unit_amount_cents, tax_rate_basis_points, total_cents, sort_order")
          .eq("tenant_id", tenant.id)
          .in("invoice_id", invoiceIds)
          .order("sort_order")
      : { data: [], error: null };

  assertParentPortalResult(invoiceLinesResult.error, "billing invoice lines");
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
    mutableParticipantIds: access.mutableParticipantIds,
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
    swimJourneys,
    badgeAwards: (badgeAwardsResult.data ?? []) as ParentBadgeAwardRow[],
    badgeDefinitions: (badgeDefinitionsResult.data ?? []) as ParentBadgeDefinitionRow[],
    notifications: (notificationsResult.data ?? []) as ParentNotificationRow[],
    graduationEvents,
    graduationParticipants,
    certificates,
    paymentPlans: (paymentPlansResult.data ?? []) as ParentPaymentPlanRow[],
    subscriptions,
    manualPayments,
    billingEvents,
    paymentSessions,
    providerCustomers,
    mandates,
    collectionAttempts,
    refunds,
    chargebacks,
    invoices,
    invoiceLines: (invoiceLinesResult.data ?? []) as ParentBillingInvoiceLineRow[]
  };
}

export async function loadParentParticipantAccess(
  tenantId: string,
  userId: string
): Promise<{ mutableParticipantIds: string[]; participantIds: string[]; links: ParentAccessRow[] }> {
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
    mutableParticipantIds: unique([
      ...directIds,
      ...links
        .filter((link) => link.access_level === "primary" || link.access_level === "secondary")
        .map((link) => link.participant_id)
    ]),
    participantIds: unique([...directIds, ...links.map((link) => link.participant_id)]),
    links
  };
}

export async function getParentMakeupCommunicationPreferences(): Promise<ParentMakeupCommunicationPreferences> {
  const context = await requirePrivateShellContext("/portaal/profiel");
  const tenant = getActiveTenant(context);
  const result = await createAdminClient()
    .from("guardian_communication_preferences")
    .select("make_up_in_app_enabled, make_up_email_enabled, automatic_make_up_invites_enabled, in_app_enabled, transactional_email_enabled, newsletter_email_enabled, marketing_consent_status")
    .eq("tenant_id", tenant.id)
    .eq("guardian_user_id", context.user.id)
    .maybeSingle();

  assertParentPortalResult(result.error, "make-up communication preferences");

  return {
    makeUpInAppEnabled: result.data?.make_up_in_app_enabled ?? true,
    makeUpEmailEnabled: result.data?.make_up_email_enabled ?? true,
    automaticMakeUpInvitesEnabled: result.data?.automatic_make_up_invites_enabled ?? false,
    inAppEnabled: result.data?.in_app_enabled ?? true,
    transactionalEmailEnabled: result.data?.transactional_email_enabled ?? true,
    newsletterEmailEnabled: result.data?.newsletter_email_enabled ?? false,
    marketingConsentStatus:
      result.data?.marketing_consent_status === "granted" ||
      result.data?.marketing_consent_status === "denied" ||
      result.data?.marketing_consent_status === "withdrawn"
        ? result.data.marketing_consent_status
        : "unknown"
  };
}

export function canParentMutateParticipant(data: Pick<ParentPortalData, "mutableParticipantIds">, participantId: string) {
  return data.mutableParticipantIds.includes(participantId);
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
    assessment_rating_display: row.assessment_rating_display === "stars" ? "stars" : "smileys",
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
