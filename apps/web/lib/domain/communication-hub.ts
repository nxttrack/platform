import "server-only";

import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export type CommunicationNotification = {
  id: string;
  title: string;
  message: string;
  status: "unread" | "read" | "archived";
  priority: "low" | "normal" | "high" | "urgent";
  action_href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

export type NotificationCenterData = {
  href: string;
  unreadCount: number;
  items: Array<{
    id: string;
    title: string;
    body: string;
    href: string | null;
    createdAt: string;
    priority: CommunicationNotification["priority"];
    unread: boolean;
  }>;
};

export type MessageThreadRow = {
  id: string;
  subject: string;
  thread_type: string;
  status: string;
  participant_id: string | null;
  guardian_user_id: string | null;
  group_id: string | null;
  intake_submission_id: string | null;
  waitlist_entry_id: string | null;
  manual_payment_id: string | null;
  graduation_event_id: string | null;
  assigned_staff_user_id: string | null;
  assigned_instructor_user_id: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
  is_test: boolean;
};

export type ThreadMessageRow = {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_user_id: string | null;
  body_json: Record<string, unknown>;
  body_html: string | null;
  plain_text: string;
  visibility: string;
  status: string;
  content_classification: string;
  classification_reasons: string[];
  created_at: string;
};

export type CommunicationTemplateRow = {
  id: string;
  template_key: string;
  name: string;
  channel: string;
  subject: string | null;
  content_json: Record<string, unknown>;
  content_html: string | null;
  variables_json: string[];
  status: string;
  created_at: string;
  updated_at: string;
};

export type NewsletterCampaignRow = {
  id: string;
  title: string;
  subject: string;
  preheader: string | null;
  content_json: Record<string, unknown>;
  content_html: string | null;
  status: string;
  segment_filters_json: Record<string, unknown>;
  scheduled_at: string | null;
  sent_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type NewsletterRecipientRow = {
  id: string;
  campaign_id: string;
  guardian_user_id: string | null;
  recipient_user_id: string | null;
  email: string;
  status: string;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  error_message: string | null;
  created_at: string;
};

export type CommunicationDeliveryRow = {
  id: string;
  channel: string;
  recipient: string;
  related_type: string;
  related_id: string;
  status: string;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
};

export type CommunicationPersonOption = {
  id: string;
  name: string;
  email: string | null;
  role?: string;
};

export type CommunicationEntityOption = {
  id: string;
  label: string;
};

export type TenantCommunicationSettings = {
  instructors_can_reply_to_parents: boolean;
  instructors_can_view_parent_threads: "assigned_only" | "own_groups";
  whatsapp_urgent_enabled: boolean;
  sms_fallback_enabled: boolean;
};

export type AdminCommunicationHubData = {
  currentUserId: string;
  tenant: { id: string; name: string; slug: string };
  threads: MessageThreadRow[];
  messages: ThreadMessageRow[];
  templates: CommunicationTemplateRow[];
  campaigns: NewsletterCampaignRow[];
  recipients: NewsletterRecipientRow[];
  deliveries: CommunicationDeliveryRow[];
  notifications: CommunicationNotification[];
  unreadThreadIds: string[];
  people: Map<string, CommunicationPersonOption>;
  guardians: CommunicationPersonOption[];
  staff: CommunicationPersonOption[];
  instructors: CommunicationPersonOption[];
  participants: CommunicationEntityOption[];
  programs: CommunicationEntityOption[];
  stages: CommunicationEntityOption[];
  groups: CommunicationEntityOption[];
  intakes: CommunicationEntityOption[];
  waitlistEntries: CommunicationEntityOption[];
  payments: CommunicationEntityOption[];
  graduationEvents: CommunicationEntityOption[];
  settings: TenantCommunicationSettings;
};

export type ScopedCommunicationHubData = {
  currentUserId: string;
  tenant: { id: string; name: string; slug: string };
  threads: MessageThreadRow[];
  messages: ThreadMessageRow[];
  notifications: CommunicationNotification[];
  unreadThreadIds: string[];
  people: Map<string, CommunicationPersonOption>;
  participants: CommunicationEntityOption[];
  canReplyToParents: boolean;
};

const notificationSelect =
  "id, title, message, status, priority, action_href, entity_type, entity_id, created_at";
const threadSelect =
  "id, subject, thread_type, status, participant_id, guardian_user_id, group_id, intake_submission_id, waitlist_entry_id, manual_payment_id, graduation_event_id, assigned_staff_user_id, assigned_instructor_user_id, last_message_at, created_at, updated_at, is_test";
const threadMessageSelect =
  "id, thread_id, sender_type, sender_user_id, body_json, body_html, plain_text, visibility, status, content_classification, classification_reasons, created_at";

export async function getNotificationCenter(
  context: AuthenticatedTrustedAuthContext,
  href: string
): Promise<NotificationCenterData> {
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [itemsResult, countResult] = await Promise.all([
    admin
      .from("tenant_notifications")
      .select(notificationSelect)
      .eq("tenant_id", tenant.id)
      .eq("recipient_user_id", context.user.id)
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("tenant_notifications")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("recipient_user_id", context.user.id)
      .eq("status", "unread")
  ]);

  if (itemsResult.error || countResult.error) {
    return { href, unreadCount: 0, items: [] };
  }

  const notifications = (itemsResult.data ?? []) as CommunicationNotification[];

  return {
    href,
    unreadCount: countResult.count ?? 0,
    items: notifications.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.message,
      href: safeNotificationHref(item.action_href, href),
      createdAt: item.created_at,
      priority: item.priority,
      unread: item.status === "unread"
    }))
  };
}

export async function getAdminCommunicationHub(): Promise<AdminCommunicationHubData> {
  const context = await requirePrivateShellContext("/admin/berichten");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const [
    threadsResult,
    messagesResult,
    templatesResult,
    campaignsResult,
    recipientsResult,
    deliveriesResult,
    notificationsResult,
    membershipsResult,
    participantsResult,
    programsResult,
    stagesResult,
    groupsResult,
    intakesResult,
    waitlistResult,
    paymentsResult,
    graduationEventsResult,
    settingsResult,
    threadReadsResult
  ] = await Promise.all([
    admin.from("message_threads").select(threadSelect).eq("tenant_id", tenant.id).order("last_message_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(250),
    admin.from("messages").select(threadMessageSelect).eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(2_000),
    admin.from("communication_templates").select("id, template_key, name, channel, subject, content_json, content_html, variables_json, status, created_at, updated_at").eq("tenant_id", tenant.id).order("updated_at", { ascending: false }),
    admin.from("newsletter_campaigns").select("id, title, subject, preheader, content_json, content_html, status, segment_filters_json, scheduled_at, sent_at, created_by_user_id, created_at, updated_at").eq("tenant_id", tenant.id).order("updated_at", { ascending: false }),
    admin.from("newsletter_recipients").select("id, campaign_id, guardian_user_id, recipient_user_id, email, status, sent_at, opened_at, clicked_at, error_message, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(1_000),
    admin.from("communication_deliveries").select("id, channel, recipient, related_type, related_id, status, provider_message_id, error_message, sent_at, created_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(250),
    admin.from("tenant_notifications").select(notificationSelect).eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(250),
    admin.from("tenant_memberships").select("user_id, role").eq("tenant_id", tenant.id).eq("status", "active"),
    admin.from("participants").select("id, display_name").eq("tenant_id", tenant.id).eq("is_test", false).order("display_name"),
    admin.from("programs").select("id, name").eq("tenant_id", tenant.id).eq("status", "active").order("name"),
    admin.from("program_stages").select("id, name").eq("tenant_id", tenant.id).eq("status", "active").order("sort_order"),
    admin.from("groups").select("id, name").eq("tenant_id", tenant.id).eq("status", "active").order("name"),
    admin.from("intake_submissions").select("id, participant_name, parent_name").eq("tenant_id", tenant.id).eq("is_test", false).order("received_at", { ascending: false }).limit(250),
    admin.from("waitlist_entries").select("id, participant_name, parent_name").eq("tenant_id", tenant.id).eq("is_test", false).order("priority_date").limit(250),
    admin.from("manual_payments").select("id, reference, status, amount_cents, currency").eq("tenant_id", tenant.id).order("due_on", { ascending: false }).limit(250),
    admin.from("graduation_events").select("id, title, starts_at, status").eq("tenant_id", tenant.id).eq("is_test", false).order("starts_at", { ascending: false }).limit(250),
    admin.from("tenant_settings").select("instructors_can_reply_to_parents, instructors_can_view_parent_threads, whatsapp_urgent_enabled, sms_fallback_enabled").eq("tenant_id", tenant.id).maybeSingle(),
    admin.from("message_thread_participants").select("thread_id, last_read_at").eq("tenant_id", tenant.id).eq("user_id", context.user.id).eq("status", "active")
  ]);

  assertCommunicationQuery(threadsResult.error, "message threads");
  assertCommunicationQuery(messagesResult.error, "thread messages");
  assertCommunicationQuery(templatesResult.error, "communication templates");
  assertCommunicationQuery(campaignsResult.error, "newsletter campaigns");
  assertCommunicationQuery(recipientsResult.error, "newsletter recipients");
  assertCommunicationQuery(deliveriesResult.error, "communication deliveries");
  assertCommunicationQuery(notificationsResult.error, "notifications");
  assertCommunicationQuery(membershipsResult.error, "tenant memberships");
  assertCommunicationQuery(participantsResult.error, "participants");
  assertCommunicationQuery(programsResult.error, "programs");
  assertCommunicationQuery(stagesResult.error, "program stages");
  assertCommunicationQuery(groupsResult.error, "groups");
  assertCommunicationQuery(intakesResult.error, "intakes");
  assertCommunicationQuery(waitlistResult.error, "waitlist");
  assertCommunicationQuery(paymentsResult.error, "payments");
  assertCommunicationQuery(graduationEventsResult.error, "graduation events");
  assertCommunicationQuery(settingsResult.error, "communication settings");
  assertCommunicationQuery(threadReadsResult.error, "thread read status");

  const memberships = (membershipsResult.data ?? []) as Array<{ user_id: string; role: string }>;
  const people = await loadPeople(memberships.map((item) => item.user_id));
  const roleById = new Map(memberships.map((item) => [item.user_id, item.role]));
  const peopleWithRoles = new Map(
    [...people.entries()].map(([id, person]) => [id, { ...person, role: roleById.get(id) }])
  );

  return {
    currentUserId: context.user.id,
    tenant,
    threads: (threadsResult.data ?? []) as MessageThreadRow[],
    messages: ([...(messagesResult.data ?? [])].reverse()) as ThreadMessageRow[],
    templates: (templatesResult.data ?? []) as CommunicationTemplateRow[],
    campaigns: (campaignsResult.data ?? []) as NewsletterCampaignRow[],
    recipients: (recipientsResult.data ?? []) as NewsletterRecipientRow[],
    deliveries: (deliveriesResult.data ?? []) as CommunicationDeliveryRow[],
    notifications: (notificationsResult.data ?? []) as CommunicationNotification[],
    unreadThreadIds: unreadThreadIds(
      (threadsResult.data ?? []) as MessageThreadRow[],
      (threadReadsResult.data ?? []) as Array<{ thread_id: string; last_read_at: string | null }>
    ),
    people: peopleWithRoles,
    guardians: peopleForRoles(peopleWithRoles, ["parent"]),
    staff: peopleForRoles(peopleWithRoles, ["tenant_owner", "tenant_admin", "tenant_staff"]),
    instructors: peopleForRoles(peopleWithRoles, ["instructor"]),
    participants: ((participantsResult.data ?? []) as Array<{ id: string; display_name: string }>).map((item) => ({ id: item.id, label: item.display_name })),
    programs: ((programsResult.data ?? []) as Array<{ id: string; name: string }>).map((item) => ({ id: item.id, label: item.name })),
    stages: ((stagesResult.data ?? []) as Array<{ id: string; name: string }>).map((item) => ({ id: item.id, label: item.name })),
    groups: ((groupsResult.data ?? []) as Array<{ id: string; name: string }>).map((item) => ({ id: item.id, label: item.name })),
    intakes: ((intakesResult.data ?? []) as Array<{ id: string; participant_name: string; parent_name: string }>).map((item) => ({ id: item.id, label: `${item.participant_name} · ${item.parent_name}` })),
    waitlistEntries: ((waitlistResult.data ?? []) as Array<{ id: string; participant_name: string; parent_name: string }>).map((item) => ({ id: item.id, label: `${item.participant_name} · ${item.parent_name}` })),
    payments: ((paymentsResult.data ?? []) as Array<{ id: string; reference: string | null; status: string; amount_cents: number; currency: string }>).map((item) => ({
      id: item.id,
      label: `${item.reference || "Betaling"} · ${formatMoney(item.amount_cents, item.currency)} · ${item.status}`
    })),
    graduationEvents: ((graduationEventsResult.data ?? []) as Array<{ id: string; title: string; starts_at: string; status: string }>).map((item) => ({
      id: item.id,
      label: `${item.title} · ${new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(item.starts_at))}`
    })),
    settings: normalizeSettings(settingsResult.data)
  };
}

export async function getParentCommunicationHub(): Promise<ScopedCommunicationHubData> {
  const context = await requirePrivateShellContext("/portaal/berichten");
  return getParentCommunicationHubForContext(context);
}

export async function getInstructorCommunicationHub(): Promise<ScopedCommunicationHubData> {
  const context = await requirePrivateShellContext("/instructor/berichten");
  return getInstructorCommunicationHubForContext(context);
}

export function getParentCommunicationHubForContext(
  context: AuthenticatedTrustedAuthContext
) {
  return getScopedCommunicationHub(context, "parent");
}

export function getInstructorCommunicationHubForContext(
  context: AuthenticatedTrustedAuthContext
) {
  return getScopedCommunicationHub(context, "instructor");
}

async function getScopedCommunicationHub(
  context: AuthenticatedTrustedAuthContext,
  scope: "parent" | "instructor"
): Promise<ScopedCommunicationHubData> {
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const settingsResult = await admin
    .from("tenant_settings")
    .select("instructors_can_reply_to_parents, instructors_can_view_parent_threads, whatsapp_urgent_enabled, sms_fallback_enabled")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  assertCommunicationQuery(settingsResult.error, "communication settings");
  const settings = normalizeSettings(settingsResult.data);
  let threadQuery = admin.from("message_threads").select(threadSelect).eq("tenant_id", tenant.id);

  if (scope === "parent") {
    threadQuery = threadQuery.eq("guardian_user_id", context.user.id);
  } else {
    const groupIds =
      settings.instructors_can_view_parent_threads === "own_groups"
        ? await instructorGroupIds(tenant.id, context.user.id)
        : [];
    const filters = [
      `assigned_instructor_user_id.eq.${context.user.id}`,
      `assigned_staff_user_id.eq.${context.user.id}`,
      ...(groupIds.length ? [`group_id.in.(${groupIds.join(",")})`] : [])
    ];
    threadQuery = threadQuery.or(filters.join(","));
  }

  const [threadsResult, notificationsResult, participantsResult] = await Promise.all([
    threadQuery.order("last_message_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }),
    admin.from("tenant_notifications").select(notificationSelect).eq("tenant_id", tenant.id).eq("recipient_user_id", context.user.id).neq("status", "archived").order("created_at", { ascending: false }).limit(100),
    scope === "parent"
      ? admin.from("participants").select("id, display_name").eq("tenant_id", tenant.id).or(`guardian_user_id.eq.${context.user.id},id.in.(${await guardianParticipantIds(tenant.id, context.user.id)})`).eq("is_test", false).order("display_name")
      : Promise.resolve({ data: [], error: null })
  ]);

  assertCommunicationQuery(threadsResult.error, "scoped message threads");
  assertCommunicationQuery(notificationsResult.error, "scoped notifications");
  assertCommunicationQuery(participantsResult.error, "guardian participants");
  const threads = (threadsResult.data ?? []) as MessageThreadRow[];
  const threadIds = threads.map((thread) => thread.id);
  const messagesResult = threadIds.length
    ? await admin.from("messages").select(threadMessageSelect).eq("tenant_id", tenant.id).in("thread_id", threadIds).order("created_at")
    : { data: [], error: null };
  assertCommunicationQuery(messagesResult.error, "scoped messages");
  const rawMessages = (messagesResult.data ?? []) as ThreadMessageRow[];
  const internalAccessResult =
    threadIds.length
      ? await admin
          .from("message_thread_participants")
          .select("thread_id, can_view_internal, last_read_at")
          .eq("tenant_id", tenant.id)
          .eq("user_id", context.user.id)
          .eq("status", "active")
          .in("thread_id", threadIds)
      : { data: [], error: null };
  assertCommunicationQuery(internalAccessResult.error, "message thread permissions");
  const internalThreadIds = new Set(
    (internalAccessResult.data ?? [])
      .filter((item) => item.can_view_internal)
      .map((item) => item.thread_id)
  );
  const canManageTenant =
    context.activeTenant?.roles.some((role) =>
      ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)
    ) === true;
  const messages =
    scope === "parent"
      ? rawMessages.filter((message) => message.visibility === "public_to_thread")
      : rawMessages.filter(
          (message) =>
            message.visibility === "public_to_thread" ||
            canManageTenant ||
            internalThreadIds.has(message.thread_id)
        );
  const senderIds = messages.map((message) => message.sender_user_id).filter((id): id is string => Boolean(id));

  return {
    currentUserId: context.user.id,
    tenant,
    threads,
    messages,
    notifications: (notificationsResult.data ?? []) as CommunicationNotification[],
    unreadThreadIds: unreadThreadIds(
      threads,
      (internalAccessResult.data ?? []) as Array<{ thread_id: string; last_read_at: string | null }>
    ),
    people: await loadPeople(senderIds.concat(context.user.id)),
    participants: ((participantsResult.data ?? []) as Array<{ id: string; display_name: string }>).map((item) => ({ id: item.id, label: item.display_name })),
    canReplyToParents: scope === "parent" || settings.instructors_can_reply_to_parents
  };
}

function unreadThreadIds(
  threads: MessageThreadRow[],
  reads: Array<{ thread_id: string; last_read_at: string | null }>
) {
  const readAtByThread = new Map(reads.map((item) => [item.thread_id, item.last_read_at]));
  return threads
    .filter((thread) => {
      const lastReadAt = readAtByThread.get(thread.id);
      if (!thread.last_message_at) return false;
      return !lastReadAt || new Date(thread.last_message_at).getTime() > new Date(lastReadAt).getTime();
    })
    .map((thread) => thread.id);
}

async function guardianParticipantIds(tenantId: string, guardianId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("participant_guardians")
    .select("participant_id")
    .eq("tenant_id", tenantId)
    .eq("guardian_user_id", guardianId)
    .eq("status", "active");
  const ids = (data ?? []).map((item) => item.participant_id);

  return ids.length ? ids.join(",") : "00000000-0000-0000-0000-000000000000";
}

async function instructorGroupIds(tenantId: string, instructorId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("group_instructor_assignments")
    .select("group_id")
    .eq("tenant_id", tenantId)
    .eq("instructor_user_id", instructorId)
    .eq("status", "active");

  return [...new Set((data ?? []).map((item) => item.group_id))];
}

async function loadPeople(ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, CommunicationPersonOption>();
  const admin = createAdminClient();
  const { data, error } = await admin.from("profiles").select("id, full_name, email").in("id", uniqueIds);
  assertCommunicationQuery(error, "communication profiles");

  return new Map(
    ((data ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map((profile) => [
      profile.id,
      {
        id: profile.id,
        name: profile.full_name || profile.email || "Onbekende gebruiker",
        email: profile.email
      }
    ])
  );
}

function peopleForRoles(
  people: Map<string, CommunicationPersonOption>,
  roles: string[]
) {
  return [...people.values()].filter((person) => person.role && roles.includes(person.role));
}

function normalizeSettings(value: unknown): TenantCommunicationSettings {
  const row = (value ?? {}) as Partial<TenantCommunicationSettings>;

  return {
    instructors_can_reply_to_parents: row.instructors_can_reply_to_parents === true,
    instructors_can_view_parent_threads:
      row.instructors_can_view_parent_threads === "own_groups" ? "own_groups" : "assigned_only",
    whatsapp_urgent_enabled: row.whatsapp_urgent_enabled === true,
    sms_fallback_enabled: row.sms_fallback_enabled === true
  };
}

function safeNotificationHref(value: string | null, fallback: string) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

function assertCommunicationQuery(error: { message: string } | null, label: string) {
  if (error) {
    throw new Error(`Could not load ${label}: ${error.message}`);
  }
}

function formatMoney(amountCents: number, currency: string) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency }).format(amountCents / 100);
}
