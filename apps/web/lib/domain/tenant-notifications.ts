import "server-only";

import { sendTransactionalEmail } from "@/lib/email/transactional";
import { renderNotificationEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";

export type TenantNotificationType =
  | "admin_message"
  | "badge_award"
  | "certificate_issued"
  | "document_published"
  | "graduation_invite"
  | "makeup_invitation"
  | "payment_due"
  | "payment_overdue"
  | "payment_received"
  | "progress_score"
  | "report_ready"
  | "task_assigned";

type InsertedNotification = {
  id: string;
  message: string;
  recipient_user_id: string;
  title: string;
};

export async function createTenantNotifications(input: {
  message: string;
  organizationName?: string;
  participantId?: string | null;
  recipientIds: string[];
  relatedBadgeAwardId?: string | null;
  relatedProgressScoreId?: string | null;
  tenantId: string;
  title: string;
  type: TenantNotificationType;
  deliverEmail?: boolean;
}) {
  const recipientIds = unique(input.recipientIds);

  if (recipientIds.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_notifications")
    .insert(
      recipientIds.map((recipientId) => ({
        tenant_id: input.tenantId,
        recipient_user_id: recipientId,
        participant_id: input.participantId ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        status: "unread",
        related_progress_score_id: input.relatedProgressScoreId ?? null,
        related_badge_award_id: input.relatedBadgeAwardId ?? null
      }))
    )
    .select("id, recipient_user_id, title, message");

  if (error || !data) {
    return [];
  }

  const notifications = data as InsertedNotification[];

  await deliverNotificationsByEmail({
    deliverEmail: input.deliverEmail ?? true,
    notifications,
    organizationName: input.organizationName,
    tenantId: input.tenantId,
    type: input.type
  });

  return notifications;
}

async function deliverNotificationsByEmail(input: {
  deliverEmail: boolean;
  notifications: InsertedNotification[];
  organizationName?: string;
  tenantId: string;
  type: TenantNotificationType;
}) {
  const admin = createAdminClient();
  const recipientIds = unique(input.notifications.map((notification) => notification.recipient_user_id));

  if (recipientIds.length === 0) {
    return;
  }

  const { data, error } = await admin.from("profiles").select("id, email").in("id", recipientIds);

  if (error) {
    return;
  }

  const emailByUserId = new Map(((data ?? []) as { email: string | null; id: string }[]).flatMap((profile) => (profile.email ? [[profile.id, profile.email] as const] : [])));

  await Promise.all(
    input.notifications.map(async (notification) => {
      if (!input.deliverEmail) {
        await updateNotificationDelivery(notification.id, {
          deliveryError: "E-mail uitgeschakeld volgens communicatievoorkeur; in-app notificatie bewaard.",
          deliveryStatus: "skipped"
        });
        return;
      }
      const email = emailByUserId.get(notification.recipient_user_id);

      if (!email) {
        await updateNotificationDelivery(notification.id, {
          deliveryError: "Ontvanger heeft geen e-mailadres.",
          deliveryStatus: "skipped"
        });
        return;
      }

      const template = renderNotificationEmail({
        message: notification.message,
        organizationName: input.organizationName ?? "NXTTRACK",
        title: notification.title
      });
      const mail = await sendTransactionalEmail({
        ...template,
        organizationName: input.organizationName,
        recipientUserId: notification.recipient_user_id,
        relatedId: notification.id,
        relatedType: "tenant_notification",
        templateKey: `notification_${input.type}`,
        tenantId: input.tenantId,
        to: email
      });

      await updateNotificationDelivery(notification.id, {
        attemptId: mail.attemptId,
        deliveryError: mail.delivered ? null : mail.reason,
        deliveryStatus: mail.delivered ? "sent" : mail.provider === "not_configured" ? "skipped" : "failed"
      });
    })
  );
}

async function updateNotificationDelivery(
  notificationId: string,
  input: {
    attemptId?: string;
    deliveryError: string | null;
    deliveryStatus: "sent" | "failed" | "skipped";
  }
) {
  const admin = createAdminClient();

  await admin
    .from("tenant_notifications")
    .update({
      delivered_at: input.deliveryStatus === "sent" ? new Date().toISOString() : null,
      delivery_error: input.deliveryError,
      delivery_status: input.deliveryStatus,
      email_delivery_attempt_id: input.attemptId ?? null
    })
    .eq("id", notificationId);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
