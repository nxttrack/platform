"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  communicationTemplateChannels,
  assessCommunicationContent,
  extractPlainText,
  isHumanConfirmed,
  messageVisibilities,
  newsletterSegments,
  newsletterStatuses,
  sanitizeCommunicationHtml,
  threadStatuses,
  threadTypes,
  validateShortcodes
} from "./communication-hub-contract";
import { getActiveTenant } from "./core";
import { createTenantNotifications } from "./tenant-notifications";

const adminRoles = new Set(["tenant_owner", "tenant_admin", "tenant_staff"]);
const templateStatuses = new Set(["active", "inactive"]);

export async function createMessageThreadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/berichten");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const isAdmin = context.activeTenant?.roles.some((role) => adminRoles.has(role)) === true;
  const isParent = context.activeTenant?.roles.includes("parent") === true;

  if (!isAdmin && !isParent) {
    redirectWithFeedback(nextPath, "error", "Je mag geen gesprek starten.");
  }
  if (!isHumanConfirmed(formData.get("humanConfirmation"))) {
    redirectWithFeedback(nextPath, "error", "Bevestig dat je dit bericht wilt versturen.");
  }

  const subject = readRequired(formData, "subject", 180);
  const plainText = readRequired(formData, "plainText", 8_000);
  const classification = classifyContent({ subject, plainText }, "personal");
  const guardianUserId = isParent ? context.user.id : readOptionalUuid(formData, "guardianUserId");
  const participantId = readOptionalUuid(formData, "participantId");
  const assignedStaffId = isAdmin ? readOptionalUuid(formData, "assignedStaffId") ?? context.user.id : null;
  const assignedInstructorId = isAdmin ? readOptionalUuid(formData, "assignedInstructorId") : null;
  const admin = createAdminClient();
  if (
    isParent &&
    participantId &&
    !(await guardianCanMessageAboutParticipant(tenant.id, participantId, context.user.id))
  ) {
    redirectWithFeedback(nextPath, "error", "Je hebt geen schrijfrecht voor deze leerling.");
  }
  if (
    isAdmin &&
    !(await communicationActorsBelongToTenant({
      guardianId: guardianUserId,
      instructorId: assignedInstructorId,
      staffId: assignedStaffId,
      tenantId: tenant.id
    }))
  ) {
    redirectWithFeedback(nextPath, "error", "Een gekozen ontvanger of behandelaar hoort niet bij deze organisatie.");
  }
  if (
    isAdmin &&
    guardianUserId &&
    participantId &&
    !(await guardianCanViewParticipant(tenant.id, participantId, guardianUserId))
  ) {
    redirectWithFeedback(
      nextPath,
      "error",
      "De gekozen ouder/verzorger heeft geen toegang tot deze leerling."
    );
  }
  const threadResult = await admin
    .from("message_threads")
    .insert({
      tenant_id: tenant.id,
      subject,
      thread_type: readEnum(formData, "threadType", threadTypes, "general"),
      status: isParent ? "waiting_for_school" : "waiting_for_parent",
      participant_id: participantId,
      guardian_user_id: guardianUserId,
      group_id: readOptionalUuid(formData, "groupId"),
      intake_submission_id: readOptionalUuid(formData, "intakeSubmissionId"),
      waitlist_entry_id: readOptionalUuid(formData, "waitlistEntryId"),
      manual_payment_id: readOptionalUuid(formData, "paymentId"),
      graduation_event_id: readOptionalUuid(formData, "graduationEventId"),
      assigned_staff_user_id: assignedStaffId,
      assigned_instructor_user_id: assignedInstructorId,
      created_by_user_id: context.user.id,
      last_message_at: new Date().toISOString(),
      is_test: false,
      source: "manual"
    })
    .select("id, guardian_user_id, assigned_staff_user_id, assigned_instructor_user_id")
    .single();

  if (threadResult.error || !threadResult.data) {
    redirectWithFeedback(nextPath, "error", "Het gesprek kon niet worden aangemaakt.");
  }

  const messageResult = await admin.from("messages").insert({
    tenant_id: tenant.id,
    thread_id: threadResult.data.id,
    sender_type: isParent ? "parent" : "staff",
    sender_user_id: context.user.id,
    body_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: plainText }] }] },
    body_html: `<p>${escapeHtml(plainText).replaceAll("\n", "<br>")}</p>`,
    plain_text: plainText,
    visibility: "public_to_thread",
    status: "sent",
    content_classification: classification.classification,
    classification_reasons: classification.reasons,
    human_confirmed_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    is_test: false,
    source: "manual"
  });

  if (messageResult.error) {
    await admin.from("message_threads").delete().eq("tenant_id", tenant.id).eq("id", threadResult.data.id);
    redirectWithFeedback(nextPath, "error", "Het eerste bericht kon niet worden opgeslagen.");
  }

  const participantWriteError = await upsertThreadParticipants({
    tenantId: tenant.id,
    threadId: threadResult.data.id,
    guardianUserId,
    staffUserId: threadResult.data.assigned_staff_user_id,
    instructorUserId: threadResult.data.assigned_instructor_user_id,
    actorUserId: context.user.id,
    actorRole: isParent ? "parent" : "staff"
  });
  if (participantWriteError) {
    await admin.from("message_threads").delete().eq("tenant_id", tenant.id).eq("id", threadResult.data.id);
    redirectWithFeedback(nextPath, "error", "De deelnemers aan het gesprek konden niet veilig worden vastgelegd.");
  }
  await notifyThreadRecipients({
    actorId: context.user.id,
    guardianId: guardianUserId,
    staffId: threadResult.data.assigned_staff_user_id,
    instructorId: threadResult.data.assigned_instructor_user_id,
    organizationName: tenant.name,
    subject,
    tenantId: tenant.id,
    threadId: threadResult.data.id
  });

  revalidateCommunicationHub();
  redirectWithFeedback(
    `${nextPath.split("?")[0]}?thread=${threadResult.data.id}` as `/${string}`,
    "success",
    "Gesprek aangemaakt."
  );
}

export async function replyToMessageThreadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/berichten");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const threadId = readRequiredUuid(formData, "threadId");
  const admin = createAdminClient();
  const threadResult = await admin
    .from("message_threads")
    .select("id, subject, participant_id, guardian_user_id, group_id, assigned_staff_user_id, assigned_instructor_user_id, status")
    .eq("tenant_id", tenant.id)
    .eq("id", threadId)
    .maybeSingle();

  if (threadResult.error || !threadResult.data) {
    redirectWithFeedback(nextPath, "error", "Gesprek niet gevonden.");
  }

  const isAdmin = context.activeTenant?.roles.some((role) => adminRoles.has(role)) === true;
  const isParent = threadResult.data.guardian_user_id === context.user.id;
  const isAssignedInstructor =
    threadResult.data.assigned_instructor_user_id === context.user.id ||
    threadResult.data.assigned_staff_user_id === context.user.id;
  const ownGroupInstructor = threadResult.data.group_id
    ? await admin
        .from("group_instructor_assignments")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("group_id", threadResult.data.group_id)
        .eq("instructor_user_id", context.user.id)
        .eq("status", "active")
        .maybeSingle()
    : { data: null, error: null };
  const threadAccessSettings = await admin
    .from("tenant_settings")
    .select("instructors_can_view_parent_threads, instructors_can_reply_to_parents")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  const canUseOwnGroups =
    threadAccessSettings.data?.instructors_can_view_parent_threads === "own_groups";
  const isInstructor =
    isAssignedInstructor || (canUseOwnGroups && Boolean(ownGroupInstructor.data));
  if (
    isParent &&
    threadResult.data.participant_id &&
    !(await guardianCanMessageAboutParticipant(tenant.id, threadResult.data.participant_id, context.user.id))
  ) {
    redirectWithFeedback(nextPath, "error", "Je hebt alleen-lezen toegang tot deze leerling.");
  }
  if (!isAdmin && !isParent && !isInstructor) {
    redirectWithFeedback(nextPath, "error", "Je hebt geen toegang tot dit gesprek.");
  }

  let visibility = readEnum(formData, "visibility", messageVisibilities, "public_to_thread");
  if (isParent) visibility = "public_to_thread";
  if (visibility === "public_to_thread" && !isHumanConfirmed(formData.get("humanConfirmation"))) {
    redirectWithFeedback(nextPath, "error", "Bevestig dat je het antwoord wilt versturen.");
  }
  if (isInstructor && !isAdmin && visibility === "public_to_thread") {
    if (threadAccessSettings.error || threadAccessSettings.data?.instructors_can_reply_to_parents !== true) {
      redirectWithFeedback(nextPath, "error", "Direct antwoorden aan ouders staat uit.");
    }
  }
  if (isInstructor && !isAdmin && !isAssignedInstructor && visibility !== "public_to_thread") {
    redirectWithFeedback(
      nextPath,
      "error",
      "Interne notities zijn alleen beschikbaar wanneer je aan dit gesprek bent toegewezen."
    );
  }

  const plainText = readRequired(formData, "plainText", 8_000);
  const classification = classifyContent(plainText, visibility === "public_to_thread" ? "personal" : "operational");
  const messageResult = await admin.from("messages").insert({
    tenant_id: tenant.id,
    thread_id: threadId,
    sender_type: isParent ? "parent" : isInstructor && !isAdmin ? "instructor" : "staff",
    sender_user_id: context.user.id,
    body_json: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: plainText }] }] },
    body_html: `<p>${escapeHtml(plainText).replaceAll("\n", "<br>")}</p>`,
    plain_text: plainText,
    visibility,
    status: "sent",
    content_classification: classification.classification,
    classification_reasons: classification.reasons,
    human_confirmed_at: new Date().toISOString(),
    sent_at: new Date().toISOString(),
    is_test: false,
    source: "manual"
  });

  if (messageResult.error) {
    redirectWithFeedback(nextPath, "error", "Het bericht kon niet worden opgeslagen.");
  }
  await admin
    .from("message_thread_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("tenant_id", tenant.id)
    .eq("thread_id", threadId)
    .eq("user_id", context.user.id)
    .eq("status", "active");

  const nextStatus =
    visibility !== "public_to_thread"
      ? threadResult.data.status
      : isParent
        ? "waiting_for_school"
        : "waiting_for_parent";
  await admin
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString(), status: nextStatus })
    .eq("tenant_id", tenant.id)
    .eq("id", threadId);

  if (visibility === "public_to_thread") {
    await notifyThreadRecipients({
      actorId: context.user.id,
      guardianId: threadResult.data.guardian_user_id,
      staffId: threadResult.data.assigned_staff_user_id,
      instructorId: threadResult.data.assigned_instructor_user_id,
      organizationName: tenant.name,
      subject: threadResult.data.subject,
      tenantId: tenant.id,
      threadId
    });
  }

  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", visibility === "internal_note" ? "Interne notitie toegevoegd." : "Antwoord verstuurd.");
}

export async function updateMessageThreadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/berichten");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  requireAdminRole(context.activeTenant?.roles ?? [], nextPath);
  if (!isHumanConfirmed(formData.get("humanConfirmation"))) {
    redirectWithFeedback(nextPath, "error", "Bevestig de wijziging aan het gesprek.");
  }

  const admin = createAdminClient();
  const assignedStaffId = readOptionalUuid(formData, "assignedStaffId");
  const assignedInstructorId = readOptionalUuid(formData, "assignedInstructorId");
  if (
    !(await communicationActorsBelongToTenant({
      guardianId: null,
      instructorId: assignedInstructorId,
      staffId: assignedStaffId,
      tenantId: tenant.id
    }))
  ) {
    redirectWithFeedback(nextPath, "error", "Een gekozen behandelaar hoort niet bij deze organisatie.");
  }
  const threadId = readRequiredUuid(formData, "threadId");
  const existingThread = await admin
    .from("message_threads")
    .select("assigned_staff_user_id, assigned_instructor_user_id")
    .eq("tenant_id", tenant.id)
    .eq("id", threadId)
    .maybeSingle();
  if (existingThread.error || !existingThread.data) {
    redirectWithFeedback(nextPath, "error", "Gesprek niet gevonden.");
  }

  const { error } = await admin
    .from("message_threads")
    .update({
      status: readEnum(formData, "status", threadStatuses, "open"),
      assigned_staff_user_id: assignedStaffId,
      assigned_instructor_user_id: assignedInstructorId,
      closed_at: readEnum(formData, "status", threadStatuses, "open") === "closed" ? new Date().toISOString() : null,
      closed_by_user_id: readEnum(formData, "status", threadStatuses, "open") === "closed" ? context.user.id : null
    })
    .eq("tenant_id", tenant.id)
    .eq("id", threadId);

  if (error) {
    redirectWithFeedback(nextPath, "error", "Het gesprek kon niet worden bijgewerkt.");
  }
  const removedUserIds = [
    existingThread.data.assigned_staff_user_id,
    existingThread.data.assigned_instructor_user_id
  ].filter(
    (userId): userId is string =>
      Boolean(userId) &&
      userId !== assignedStaffId &&
      userId !== assignedInstructorId &&
      userId !== context.user.id
  );
  if (removedUserIds.length) {
    const removalResult = await admin
      .from("message_thread_participants")
      .update({
        status: "removed",
        can_reply: false,
        can_view_internal: false
      })
      .eq("tenant_id", tenant.id)
      .eq("thread_id", threadId)
      .in("user_id", removedUserIds);
    if (removalResult.error) {
      await admin
        .from("message_threads")
        .update({
          assigned_staff_user_id: existingThread.data.assigned_staff_user_id,
          assigned_instructor_user_id: existingThread.data.assigned_instructor_user_id
        })
        .eq("tenant_id", tenant.id)
        .eq("id", threadId);
      redirectWithFeedback(nextPath, "error", "De oude gesprekstoegang kon niet veilig worden ingetrokken.");
    }
  }
  const participantWriteError = await upsertThreadParticipants({
    tenantId: tenant.id,
    threadId,
    guardianUserId: null,
    staffUserId: assignedStaffId,
    instructorUserId: assignedInstructorId,
    actorUserId: context.user.id,
    actorRole: "staff"
  });
  if (participantWriteError) {
    await admin
      .from("message_threads")
      .update({
        assigned_staff_user_id: existingThread.data.assigned_staff_user_id,
        assigned_instructor_user_id: existingThread.data.assigned_instructor_user_id
      })
      .eq("tenant_id", tenant.id)
      .eq("id", threadId);
    redirectWithFeedback(nextPath, "error", "De nieuwe gesprekstoegang kon niet veilig worden vastgelegd.");
  }
  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", "Gesprek bijgewerkt.");
}

export async function createTaskFromThreadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/berichten");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  requireAdminRole(context.activeTenant?.roles ?? [], nextPath);
  if (!isHumanConfirmed(formData.get("humanConfirmation"))) {
    redirectWithFeedback(nextPath, "error", "Bevestig dat je een taak wilt maken.");
  }

  const threadId = readRequiredUuid(formData, "threadId");
  const admin = createAdminClient();
  const thread = await admin
    .from("message_threads")
    .select("subject, participant_id, assigned_staff_user_id")
    .eq("tenant_id", tenant.id)
    .eq("id", threadId)
    .maybeSingle();
  if (thread.error || !thread.data) {
    redirectWithFeedback(nextPath, "error", "Gesprek niet gevonden.");
  }
  const { error } = await admin.from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: context.user.id,
    assigned_to_user_id: thread.data.assigned_staff_user_id ?? context.user.id,
    related_participant_id: thread.data.participant_id,
    related_message_thread_id: threadId,
    title: `Opvolgen: ${thread.data.subject}`,
    description: "Aangemaakt vanuit de Communicatiehub. Beoordeel het gesprek en bepaal handmatig de vervolgstap.",
    priority: "normal",
    status: "open",
    content_classification: thread.data.participant_id ? "personal" : "operational",
    classification_reasons: ["communication_thread_context"]
  });
  if (error) {
    redirectWithFeedback(nextPath, "error", "De taak kon niet worden aangemaakt.");
  }
  revalidatePath("/admin/taken");
  redirectWithFeedback(nextPath, "success", "Taak aangemaakt.");
}

export async function saveCommunicationTemplateAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/templates");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  requireAdminRole(context.activeTenant?.roles ?? [], nextPath);
  const contentHtml = sanitizeCommunicationHtml(readRequired(formData, "contentHtml", 50_000));
  const subject = readOptional(formData, "subject", 220);
  const plainText = extractPlainText(contentHtml);
  if (!plainText) {
    redirectWithFeedback(nextPath, "error", "Vul inhoud voor de template in.");
  }
  const shortcodeReview = validateShortcodes(`${subject ?? ""}\n${contentHtml}`);
  if (!shortcodeReview.valid) {
    redirectWithFeedback(nextPath, "error", `Onbekende variabelen: ${shortcodeReview.unknown.join(", ")}.`);
  }

  const templateId = readOptionalUuid(formData, "templateId");
  const values = {
    tenant_id: tenant.id,
    template_key: readRequired(formData, "templateKey", 100).toLowerCase().replace(/[^a-z0-9_]+/g, "_"),
    name: readRequired(formData, "name", 160),
    channel: readEnum(formData, "channel", communicationTemplateChannels, "email"),
    subject,
    content_json: parseJsonObject(formData.get("contentJson")),
    content_html: contentHtml,
    plain_text: plainText,
    variables_json: shortcodeReview.used,
    status: readEnum(formData, "status", templateStatuses, "active"),
    content_classification: classifyContent({ subject, contentHtml }).classification,
    classification_reasons: classifyContent({ subject, contentHtml }).reasons,
    created_by_user_id: context.user.id
  };
  const admin = createAdminClient();
  const result = templateId
    ? await admin.from("communication_templates").update(values).eq("tenant_id", tenant.id).eq("id", templateId)
    : await admin.from("communication_templates").insert(values);
  if (result.error) {
    redirectWithFeedback(nextPath, "error", "De template kon niet worden opgeslagen.");
  }
  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", "Template opgeslagen.");
}

export async function createNewsletterCampaignAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/nieuwsbrieven");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  requireAdminRole(context.activeTenant?.roles ?? [], nextPath);
  const status = readEnum(formData, "status", newsletterStatuses, "draft");
  if (status !== "draft" && !isHumanConfirmed(formData.get("humanConfirmation"))) {
    redirectWithFeedback(nextPath, "error", "Bevestig de planning of verzending.");
  }
  const contentHtml = sanitizeCommunicationHtml(readRequired(formData, "contentHtml", 100_000));
  const plainText = extractPlainText(contentHtml);
  if (!plainText) {
    redirectWithFeedback(nextPath, "error", "Vul inhoud voor de nieuwsbrief in.");
  }
  const shortcodeReview = validateShortcodes(`${readRequired(formData, "subject", 220)}\n${contentHtml}`);
  if (!shortcodeReview.valid) {
    redirectWithFeedback(nextPath, "error", `Onbekende variabelen: ${shortcodeReview.unknown.join(", ")}.`);
  }
  const scheduledAt = status === "scheduled" ? readOptional(formData, "scheduledAt", 40) : null;
  if (status === "scheduled" && !scheduledAt) {
    redirectWithFeedback(nextPath, "error", "Kies een geldig verzendmoment voordat je inplant.");
  }
  const assessment = assessCommunicationContent({
    subject: readRequired(formData, "subject", 220),
    contentHtml
  });
  if (status === "scheduled" && assessment.blocksExternalDelivery) {
    redirectWithFeedback(nextPath, "error", assessment.warning ?? "Gevoelige inhoud blokkeert externe verzending.");
  }
  const admin = createAdminClient();
  const campaignResult = await admin.from("newsletter_campaigns").insert({
    tenant_id: tenant.id,
    title: readRequired(formData, "title", 180),
    subject: readRequired(formData, "subject", 220),
    preheader: readOptional(formData, "preheader", 240),
    content_json: parseJsonObject(formData.get("contentJson")),
    content_html: contentHtml,
    plain_text: plainText,
    status,
    segment_filters_json: {
      segment: readEnum(formData, "segment", newsletterSegments, "all_parents"),
      referenceId: readOptionalUuid(formData, "segmentReferenceId")
    },
    content_classification: assessment.classification,
    classification_reasons: assessment.reasons,
    scheduled_at: scheduledAt,
    human_confirmed_at: status === "scheduled" ? new Date().toISOString() : null,
    confirmed_by_user_id: status === "scheduled" ? context.user.id : null,
    created_by_user_id: context.user.id,
    is_test: false,
    source: "manual"
  }).select("id").single();
  if (campaignResult.error || !campaignResult.data) {
    redirectWithFeedback(nextPath, "error", "De nieuwsbrief kon niet worden opgeslagen.");
  }
  if (status === "scheduled") {
    let recipientCount = 0;
    try {
      recipientCount = await prepareNewsletterRecipients({
        campaignId: campaignResult.data.id,
        confirmed: true,
        referenceId: readOptionalUuid(formData, "segmentReferenceId"),
        segment: readEnum(formData, "segment", newsletterSegments, "all_parents"),
        tenantId: tenant.id
      });
    } catch {
      await admin.from("newsletter_campaigns").delete().eq("tenant_id", tenant.id).eq("id", campaignResult.data.id);
      redirectWithFeedback(nextPath, "error", "De ontvangers konden niet veilig en volledig worden voorbereid.");
    }
    if (recipientCount === 0) {
      await admin.from("newsletter_campaigns").delete().eq("tenant_id", tenant.id).eq("id", campaignResult.data.id);
      redirectWithFeedback(nextPath, "error", "De gekozen doelgroep bevat geen ontvangers met geldige toestemming.");
    }
  }
  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", status === "draft" ? "Nieuwsbrief als concept opgeslagen." : "Nieuwsbrief ingepland.");
}

export async function updateCommunicationSettingsAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/communicatie-instellingen");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  requireAdminRole(context.activeTenant?.roles ?? [], nextPath);
  if (!isHumanConfirmed(formData.get("humanConfirmation"))) {
    redirectWithFeedback(nextPath, "error", "Bevestig de communicatie-instellingen.");
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("tenant_settings")
    .update({
      instructors_can_reply_to_parents: formData.get("instructorsCanReply") === "on",
      instructors_can_view_parent_threads:
        formData.get("instructorThreadVisibility") === "own_groups" ? "own_groups" : "assigned_only",
      whatsapp_urgent_enabled: false,
      sms_fallback_enabled: false
    })
    .eq("tenant_id", tenant.id);
  if (error) {
    redirectWithFeedback(nextPath, "error", "De instellingen konden niet worden opgeslagen.");
  }
  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", "Communicatie-instellingen opgeslagen.");
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/berichten");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const { error } = await admin
    .from("tenant_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("tenant_id", tenant.id)
    .eq("recipient_user_id", context.user.id)
    .eq("status", "unread");
  if (error) {
    redirectWithFeedback(nextPath, "error", "De meldingen konden niet worden bijgewerkt.");
  }
  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", "Alle meldingen zijn gelezen.");
}

export async function markMessageThreadReadAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/portaal/berichten");
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const threadId = readRequiredUuid(formData, "threadId");
  const admin = createAdminClient();
  const isAdmin = context.activeTenant?.roles.some((role) => adminRoles.has(role)) === true;
  const participant = await admin
    .from("message_thread_participants")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("thread_id", threadId)
    .eq("user_id", context.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (participant.error || (!isAdmin && !participant.data)) {
    redirectWithFeedback(nextPath, "error", "Je hebt geen toegang tot dit gesprek.");
  }

  const now = new Date().toISOString();
  const readResult = participant.data
    ? await admin
        .from("message_thread_participants")
        .update({ last_read_at: now })
        .eq("tenant_id", tenant.id)
        .eq("id", participant.data.id)
    : await admin.from("message_thread_participants").upsert(
        {
          tenant_id: tenant.id,
          thread_id: threadId,
          user_id: context.user.id,
          role: "staff",
          can_reply: true,
          can_view_internal: true,
          last_read_at: now,
          status: "active"
        },
        { onConflict: "tenant_id,thread_id,user_id" }
      );
  if (readResult.error) {
    redirectWithFeedback(nextPath, "error", "De gelezenstatus kon niet worden opgeslagen.");
  }
  await admin
    .from("tenant_notifications")
    .update({ status: "read", read_at: now })
    .eq("tenant_id", tenant.id)
    .eq("recipient_user_id", context.user.id)
    .eq("entity_type", "message_thread")
    .eq("entity_id", threadId)
    .eq("status", "unread");
  revalidateCommunicationHub();
  redirectWithFeedback(nextPath, "success", "Gesprek gemarkeerd als gelezen.");
}

async function upsertThreadParticipants(input: {
  tenantId: string;
  threadId: string;
  guardianUserId: string | null;
  staffUserId: string | null;
  instructorUserId: string | null;
  actorUserId: string;
  actorRole: "parent" | "staff";
}) {
  const actorReadAt = new Date().toISOString();
  const candidates: Array<{
    user_id: string;
    role: string;
    can_reply: boolean;
    can_view_internal: boolean;
    last_read_at: string | null;
  }> = [];
  if (input.guardianUserId) candidates.push({ user_id: input.guardianUserId, role: "parent", can_reply: true, can_view_internal: false, last_read_at: null });
  if (input.staffUserId) candidates.push({ user_id: input.staffUserId, role: "staff", can_reply: true, can_view_internal: true, last_read_at: null });
  if (input.instructorUserId) candidates.push({ user_id: input.instructorUserId, role: "instructor", can_reply: false, can_view_internal: true, last_read_at: null });
  candidates.push({ user_id: input.actorUserId, role: input.actorRole, can_reply: true, can_view_internal: input.actorRole === "staff", last_read_at: actorReadAt });
  const byUser = new Map(candidates.map((item) => [item.user_id, item]));
  if (!byUser.size) return null;
  const admin = createAdminClient();
  const result = await admin.from("message_thread_participants").upsert(
    [...byUser.values()].map((participant) => ({
      tenant_id: input.tenantId,
      thread_id: input.threadId,
      ...participant
    })),
    { onConflict: "tenant_id,thread_id,user_id" }
  );
  return result.error;
}

async function notifyThreadRecipients(input: {
  actorId: string;
  guardianId: string | null;
  staffId: string | null;
  instructorId: string | null;
  organizationName: string;
  subject: string;
  tenantId: string;
  threadId: string;
}) {
  const targetGroups = [
    { id: input.guardianId, href: `/portaal/berichten?thread=${input.threadId}` },
    { id: input.staffId, href: `/admin/berichten?thread=${input.threadId}` },
    { id: input.instructorId, href: `/instructor/berichten?thread=${input.threadId}` }
  ];

  await Promise.all(
    targetGroups
      .filter((target) => target.id && target.id !== input.actorId)
      .map((target) =>
        createTenantNotifications({
          tenantId: input.tenantId,
          recipientIds: [target.id!],
          organizationName: input.organizationName,
          title: "Nieuw bericht",
          message: input.subject,
          type: "message_received",
          deliverEmail: false,
          entityType: "message_thread",
          entityId: input.threadId,
          actionHref: target.href
        })
      )
  );
}

async function prepareNewsletterRecipients(input: {
  campaignId: string;
  confirmed: boolean;
  referenceId: string | null;
  segment: (typeof newsletterSegments)[number];
  tenantId: string;
}) {
  const admin = createAdminClient();
  const candidates: Array<{
    email: string;
    guardianId: string | null;
    recipientId: string | null;
    consent: boolean;
    consentSource: string;
  }> = [];

  if (
    input.segment === "all_parents" ||
    input.segment === "instructors" ||
    input.segment === "program_parents" ||
    input.segment === "group_parents" ||
    input.segment === "stage_parents" ||
    input.segment === "graduation_candidates" ||
    input.segment === "makeup_credit_parents" ||
    input.segment === "open_payment_parents"
  ) {
    const role = input.segment === "instructors" ? "instructor" : "parent";
    const scopedGuardianIds =
      role === "parent" && input.segment !== "all_parents"
        ? await guardianIdsForNewsletterSegment(input)
        : null;
    const memberships = await admin
      .from("tenant_memberships")
      .select("user_id")
      .eq("tenant_id", input.tenantId)
      .eq("role", role)
      .eq("status", "active");
    if (memberships.error) throw new Error("Could not load newsletter memberships.");
    const membershipIds = [...new Set((memberships.data ?? []).map((item) => item.user_id))];
    const userIds = scopedGuardianIds
      ? membershipIds.filter((userId) => scopedGuardianIds.has(userId))
      : membershipIds;
    const [profiles, preferences] = await Promise.all([
      userIds.length
        ? admin.from("profiles").select("id, email").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
      role === "parent" && userIds.length
        ? admin
            .from("guardian_communication_preferences")
            .select("guardian_user_id, newsletter_email_enabled, marketing_consent_status, marketing_unsubscribed_at")
            .eq("tenant_id", input.tenantId)
            .in("guardian_user_id", userIds)
        : Promise.resolve({ data: [], error: null })
    ]);
    if (profiles.error || preferences.error) throw new Error("Could not load newsletter consent.");
    const preferenceByUser = new Map(
      (preferences.data ?? []).map((preference) => [preference.guardian_user_id, preference])
    );
    for (const profile of profiles.data ?? []) {
      if (!profile.email || isReservedTestEmail(profile.email)) continue;
      const preference = preferenceByUser.get(profile.id);
      const consent =
        role === "instructor" ||
        (
          preference?.newsletter_email_enabled === true &&
          preference.marketing_consent_status === "granted" &&
          !preference.marketing_unsubscribed_at
        );
      candidates.push({
        email: profile.email.toLowerCase(),
        guardianId: role === "parent" ? profile.id : null,
        recipientId: profile.id,
        consent,
        consentSource: role === "parent" ? "guardian_communication_preferences" : "active_staff_membership"
      });
    }
  } else if (input.segment === "waitlist" || input.segment === "new_intakes") {
    const contacts =
      input.segment === "waitlist"
        ? await admin
            .from("waitlist_entries")
            .select("parent_email")
            .eq("tenant_id", input.tenantId)
            .eq("is_test", false)
            .in("status", ["waiting", "reviewing", "offered"])
        : await admin
            .from("intake_submissions")
            .select("parent_email")
            .eq("tenant_id", input.tenantId)
            .eq("is_test", false)
            .order("received_at", { ascending: false })
            .limit(500);
    if (contacts.error) throw new Error("Could not load newsletter contacts.");
    for (const contact of contacts.data ?? []) {
      if (!contact.parent_email || isReservedTestEmail(contact.parent_email)) continue;
      candidates.push({
        email: contact.parent_email.toLowerCase(),
        guardianId: null,
        recipientId: null,
        consent: false,
        consentSource: "no_marketing_consent_record"
      });
    }
  }

  const byEmail = new Map(candidates.map((candidate) => [candidate.email, candidate]));
  if (!byEmail.size) return 0;
  const now = new Date().toISOString();
  const recipientResult = await admin
    .from("newsletter_recipients")
    .insert(
      [...byEmail.values()].map((candidate) => ({
        tenant_id: input.tenantId,
        campaign_id: input.campaignId,
        guardian_user_id: candidate.guardianId,
        recipient_user_id: candidate.recipientId,
        email: candidate.email,
        status: candidate.consent ? "pending" : "skipped_no_consent",
        consent_snapshot_json: {
          allowed: candidate.consent,
          capturedAt: now,
          source: candidate.consentSource
        },
        is_test: false
      }))
    )
    .select("id, recipient_user_id, email, status, consent_snapshot_json");

  if (recipientResult.error) throw new Error("Could not persist newsletter recipients.");
  const deliveryResult = await admin.from("communication_deliveries").insert(
    (recipientResult.data ?? []).map((recipient) => ({
      tenant_id: input.tenantId,
      channel: "newsletter",
      recipient_user_id: recipient.recipient_user_id,
      recipient: recipient.email,
      related_type: "newsletter_campaign",
      related_id: input.campaignId,
      status: recipient.status === "pending" ? "pending" : "skipped",
      provider: "not_configured",
      error_message: recipient.status === "pending" ? null : "Nieuwsbrief overgeslagen: geen geldige marketingtoestemming.",
      consent_snapshot_json: recipient.consent_snapshot_json,
      human_confirmed_at: input.confirmed ? now : null,
      is_test: false
    }))
  );
  if (deliveryResult.error) throw new Error("Could not persist newsletter deliveries.");
  return (recipientResult.data ?? []).filter((recipient) => recipient.status === "pending").length;
}

async function guardianIdsForNewsletterSegment(input: {
  referenceId: string | null;
  segment: (typeof newsletterSegments)[number];
  tenantId: string;
}) {
  const admin = createAdminClient();
  let participantIds: string[] = [];

  if (input.segment === "program_parents" || input.segment === "stage_parents") {
    if (!input.referenceId) return new Set<string>();
    let query = admin
      .from("enrollments")
      .select("participant_id")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active");
    query =
      input.segment === "program_parents"
        ? query.eq("program_id", input.referenceId)
        : query.eq("current_stage_id", input.referenceId);
    const result = await query;
    if (result.error) throw new Error("Could not resolve program or stage recipients.");
    participantIds = (result.data ?? []).map((item) => item.participant_id);
  } else if (input.segment === "group_parents") {
    if (!input.referenceId) return new Set<string>();
    const result = await admin
      .from("group_memberships")
      .select("participant_id")
      .eq("tenant_id", input.tenantId)
      .eq("group_id", input.referenceId)
      .in("status", ["active", "trial"]);
    if (result.error) throw new Error("Could not resolve group recipients.");
    participantIds = (result.data ?? []).map((item) => item.participant_id);
  } else if (input.segment === "graduation_candidates") {
    const result = await admin
      .from("graduation_readiness")
      .select("participant_id")
      .eq("tenant_id", input.tenantId)
      .in("status", ["ready", "invited"]);
    if (result.error) throw new Error("Could not resolve graduation recipients.");
    participantIds = (result.data ?? []).map((item) => item.participant_id);
  } else if (input.segment === "makeup_credit_parents") {
    const result = await admin
      .from("catch_up_credits")
      .select("participant_id")
      .eq("tenant_id", input.tenantId)
      .eq("status", "available");
    if (result.error) throw new Error("Could not resolve make-up recipients.");
    participantIds = (result.data ?? []).map((item) => item.participant_id);
  } else if (input.segment === "open_payment_parents") {
    const result = await admin
      .from("manual_payments")
      .select("participant_id")
      .eq("tenant_id", input.tenantId)
      .in("status", ["due", "overdue"]);
    if (result.error) throw new Error("Could not resolve payment recipients.");
    participantIds = (result.data ?? []).map((item) => item.participant_id);
  }

  const uniqueParticipantIds = [...new Set(participantIds)];
  if (!uniqueParticipantIds.length) return new Set<string>();
  const [participants, delegatedGuardians] = await Promise.all([
    admin
      .from("participants")
      .select("id, guardian_user_id")
      .eq("tenant_id", input.tenantId)
      .eq("is_test", false)
      .in("id", uniqueParticipantIds),
    admin
      .from("participant_guardians")
      .select("guardian_user_id")
      .eq("tenant_id", input.tenantId)
      .eq("status", "active")
      .in("participant_id", uniqueParticipantIds)
  ]);
  if (participants.error || delegatedGuardians.error) {
    throw new Error("Could not resolve participant guardians.");
  }

  return new Set(
    [
      ...(participants.data ?? []).map((item) => item.guardian_user_id),
      ...(delegatedGuardians.data ?? []).map((item) => item.guardian_user_id)
    ].filter((value): value is string => Boolean(value))
  );
}

async function guardianCanMessageAboutParticipant(
  tenantId: string,
  participantId: string,
  guardianId: string
) {
  const admin = createAdminClient();
  const [primary, delegated] = await Promise.all([
    admin
      .from("participants")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", participantId)
      .eq("guardian_user_id", guardianId)
      .maybeSingle(),
    admin
      .from("participant_guardians")
      .select("id, access_level")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .eq("guardian_user_id", guardianId)
      .eq("status", "active")
      .maybeSingle()
  ]);

  return Boolean(primary.data) || Boolean(delegated.data && delegated.data.access_level !== "view_only");
}

async function guardianCanViewParticipant(
  tenantId: string,
  participantId: string,
  guardianId: string
) {
  const admin = createAdminClient();
  const [primary, delegated] = await Promise.all([
    admin
      .from("participants")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", participantId)
      .eq("guardian_user_id", guardianId)
      .maybeSingle(),
    admin
      .from("participant_guardians")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("participant_id", participantId)
      .eq("guardian_user_id", guardianId)
      .eq("status", "active")
      .maybeSingle()
  ]);

  return Boolean(primary.data) || Boolean(delegated.data);
}

async function communicationActorsBelongToTenant(input: {
  tenantId: string;
  guardianId: string | null;
  staffId: string | null;
  instructorId: string | null;
}) {
  const expected = [
    ...(input.guardianId ? [{ id: input.guardianId, roles: ["parent"] }] : []),
    ...(input.staffId ? [{ id: input.staffId, roles: ["tenant_owner", "tenant_admin", "tenant_staff"] }] : []),
    ...(input.instructorId ? [{ id: input.instructorId, roles: ["instructor"] }] : [])
  ];
  if (!expected.length) return true;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tenant_memberships")
    .select("user_id, role")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .in("user_id", [...new Set(expected.map((item) => item.id))]);
  if (error) return false;
  const rolesByUser = new Map<string, Set<string>>();
  for (const membership of data ?? []) {
    const roles = rolesByUser.get(membership.user_id) ?? new Set<string>();
    roles.add(membership.role);
    rolesByUser.set(membership.user_id, roles);
  }

  return expected.every((actor) =>
    actor.roles.some((role) => rolesByUser.get(actor.id)?.has(role))
  );
}

function requireAdminRole(roles: readonly string[], nextPath: `/${string}`) {
  if (!roles.some((role) => adminRoles.has(role))) {
    redirectWithFeedback(nextPath, "error", "Alleen tenantbeheerders mogen deze actie uitvoeren.");
  }
}

function revalidateCommunicationHub() {
  for (const path of [
    "/admin/berichten",
    "/admin/notificaties",
    "/admin/nieuwsbrieven",
    "/admin/templates",
    "/admin/communicatie-instellingen",
    "/portaal/berichten",
    "/instructor/berichten"
  ]) {
    revalidatePath(path);
  }
}

function readEnum<T extends string>(
  formData: FormData,
  field: string,
  allowed: readonly T[] | Set<T>,
  fallback: T
) {
  const value = readOptional(formData, field);
  const allowedValues = allowed instanceof Set ? allowed : new Set(allowed);

  return value && allowedValues.has(value as T) ? (value as T) : fallback;
}

function readRequired(formData: FormData, field: string, maximumLength: number) {
  const value = readOptional(formData, field, maximumLength);
  if (!value) throw new Error(`${field} is required.`);

  return value;
}

function readOptional(formData: FormData, field: string, maximumLength = 500) {
  const value = formData.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maximumLength) throw new Error(`${field} is too long.`);

  return trimmed;
}

function readRequiredUuid(formData: FormData, field: string) {
  const value = readOptionalUuid(formData, field);
  if (!value) throw new Error(`${field} is required.`);

  return value;
}

function readOptionalUuid(formData: FormData, field: string) {
  const value = readOptional(formData, field, 36);

  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function parseJsonObject(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isReservedTestEmail(value: string) {
  const domain = value.trim().toLowerCase().split("@").at(-1);

  return domain === "test" || domain?.endsWith(".test") === true;
}

function redirectWithFeedback(
  path: `/${string}`,
  key: "success" | "error",
  message: string
): never {
  const url = new URL(path, "https://nxttrack.local");
  url.searchParams.set(key, message);
  redirect(`${url.pathname}${url.search}`);
}
