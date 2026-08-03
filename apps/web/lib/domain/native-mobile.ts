import "server-only";

import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { getPortalTerminology } from "@/lib/theme/portal-terminology";
import { toNativeThemeTokenExport } from "@/lib/theme/portal-theme-web";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getParentBadgeWallDataForContext
} from "./badge-system";
import {
  getInstructorCommunicationHubForContext,
  getParentCommunicationHubForContext,
  type ScopedCommunicationHubData
} from "./communication-hub";
import {
  getInstructorDocumentsForTenant,
  getParentDocumentsForTenant
} from "./documents";
import { getParentFeedbackDataForContext } from "./feedback";
import {
  getInstructorDataForContext,
  getSessionRoster,
  type InstructorData
} from "./instructor";
import {
  getActiveEnrollmentForParticipant,
  getActiveMembershipsForParticipant,
  getNextLesson,
  getParentPortalDataForContext,
  type ParentPortalData
} from "./parent-portal";
import {
  getParentParticipantMediaDataForContext
} from "./participant-media";
import {
  PARTICIPANT_MEDIA_POLICY_VERSION
} from "./participant-media-contract";

export const NATIVE_MOBILE_CONTRACT_VERSION = 1;

export async function buildParentNativeBootstrap(
  context: AuthenticatedTrustedAuthContext & {
    activeTenant: NonNullable<AuthenticatedTrustedAuthContext["activeTenant"]>;
  }
) {
  const tenantId = context.activeTenant.tenantId;
  const [
    data,
    badgeData,
    hub,
    documents,
    announcements,
    mediaData,
    feedbackData
  ] =
    await Promise.all([
      getParentPortalDataForContext(context),
      getParentBadgeWallDataForContext(context),
      getParentCommunicationHubForContext(context),
      getParentDocumentsForTenant(tenantId),
      loadAnnouncements(tenantId, "parent"),
      getParentParticipantMediaDataForContext(context),
      getParentFeedbackDataForContext(context)
    ]);
  const resolvedTheme = data.portalTheme;
  const terminology = getPortalTerminology(resolvedTheme.manifest);
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const enrollmentById = new Map(
    data.enrollments.map((enrollment) => [enrollment.id, enrollment])
  );
  const stageById = new Map(data.stages.map((stage) => [stage.id, stage]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const mediaConsentByParticipantId = new Map(
    mediaData.consents.map((consent) => [consent.participant_id, consent])
  );
  const feedbackCampaignById = new Map(
    feedbackData.campaigns.map((campaign) => [campaign.id, campaign])
  );
  const feedbackParticipantById = new Map(
    feedbackData.participants.map((participant) => [
      participant.id,
      participant.display_name
    ])
  );
  const feedbackResponseByRequestId = new Map(
    feedbackData.responses.map((response) => [response.request_id, response])
  );
  const lessons = data.sessions.map((session) => {
    const group = groupById.get(session.group_id);
    const resource = session.resource_id
      ? resourceById.get(session.resource_id)
      : group?.default_resource_id
        ? resourceById.get(group.default_resource_id)
        : null;
    return {
      endsAt: session.ends_at,
      groupId: session.group_id,
      groupName: group?.name ?? "Groep",
      id: session.id,
      notes: session.notes,
      resourceName: resource?.name ?? null,
      startsAt: session.starts_at,
      status: session.status
    };
  });

  return {
    contractVersion: NATIVE_MOBILE_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    client: "parent",
    tenant: {
      id: data.tenant.id,
      name: data.tenant.name,
      slug: data.tenant.slug,
      timeZone: data.settings.timezone
    },
    user: {
      displayName: data.user.displayName,
      email: data.user.email,
      id: data.user.id
    },
    assessment: {
      display: data.settings.assessment_rating_display,
      scaleVersion: "five_point_v1",
      values: [1, 2, 3, 4, 5],
      unratedValue: null
    },
    theme: {
      ...toNativeThemeTokenExport(resolvedTheme.manifest),
      fallbackReason: resolvedTheme.fallbackReason,
      source: resolvedTheme.source
    },
    capabilities: {
      badgeShare: "native_system_share_with_copy_fallback",
      directProviderPosting: false,
      invoiceDownload: true,
      lessonCancellation: true,
      messageReply: true,
      offlineReadCache: true
    },
    children: data.participants.map((participant) => {
      const activeEnrollment = getActiveEnrollmentForParticipant(data, participant.id);
      const journey = activeEnrollment
        ? data.swimJourneys.byEnrollmentId.get(activeEnrollment.id)
        : null;
      const nextLesson = getNextLesson(data, participant.id);
      return {
        id: participant.id,
        displayName: participant.display_name,
        canMutate: data.mutableParticipantIds.includes(participant.id),
        activeEnrollment: activeEnrollment
          ? {
              id: activeEnrollment.id,
              programId: activeEnrollment.program_id,
              programName:
                programById.get(activeEnrollment.program_id)?.name ?? "Programma",
              stageId: activeEnrollment.current_stage_id,
              stageName: activeEnrollment.current_stage_id
                ? stageById.get(activeEnrollment.current_stage_id)?.name ?? null
                : null
            }
          : null,
        nextLessonId: nextLesson?.id ?? null,
        groupIds: getActiveMembershipsForParticipant(data, participant.id).map(
          (membership) => membership.group_id
        ),
        journey: journey
          ? {
              curriculumVersion: {
                id: journey.version.id,
                name: journey.version.name,
                version: journey.version.version_number
              },
              currentStage: journey.currentStage
                ? {
                    id: journey.currentStage.id,
                    key: journey.currentStage.stable_key,
                    name: journey.currentStage.name
                  }
                : null,
              rings: journey.rings.map((ring) => ({
                assessedCount: ring.assessedCount,
                contributingCount: ring.contributingCount,
                coveragePercent: ring.coveragePercent,
                formulaVersion: ring.formulaVersion,
                key: ring.key,
                kind: ring.kind,
                label: ring.label,
                progressPercent: ring.progressPercent
              })),
              completedChapters: journey.chapterSnapshots.map((snapshot) => ({
                artworkPath: snapshot.artwork_id,
                badgeAwardIds: snapshot.badge_award_ids,
                completedAt: snapshot.completed_at,
                completion: snapshot.completion_data_json,
                id: snapshot.id,
                itemOrder: snapshot.route_order_json,
                stageId: snapshot.curriculum_stage_id,
                themeKey: snapshot.theme_key,
                themeRelease: snapshot.theme_release
              })),
              items: journey.currentStageItems.map((item) => {
                const observation = journey.effectiveObservations.find(
                  (candidate) => candidate.curriculum_item_id === item.id
                );
                const carryover = journey.carryovers.find(
                  (candidate) =>
                    candidate.curriculum_item_identity_id === item.identity_id &&
                    candidate.status === "open"
                );
                return {
                  carryover: Boolean(carryover),
                  description: item.description,
                  id: item.id,
                  key: item.stable_key,
                  name: item.name,
                  observedAt: observation?.observed_at ?? null,
                  positiveLabel: observation?.positive_label ?? null,
                  rating: observation?.rating ?? null
                };
              })
            }
          : null,
        badges: parentBadgesForParticipant(badgeData, participant.id)
      };
    }),
    lessons,
    announcements,
    inbox: serializeHub(hub),
    payments: {
      invoices: data.invoices.map((invoice) => ({
        createdAt: invoice.created_at,
        currency: invoice.currency,
        documentType: invoice.document_type,
        downloadPath:
          invoice.finalized_at && invoice.invoice_number
            ? `/api/files/invoice/${invoice.id}`
            : null,
        dueOn: invoice.due_on,
        finalizedAt: invoice.finalized_at,
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        issuedOn: invoice.issued_on,
        originalInvoiceId: invoice.original_invoice_id,
        status: invoice.status,
        totalCents: invoice.total_cents,
        vatRateBasisPoints: invoice.default_vat_rate_basis_points
      })),
      openPayments: data.manualPayments
        .filter((payment) =>
          ["open", "pending", "overdue", "failed"].includes(payment.status)
        )
        .map((payment) => ({
          amountCents: payment.amount_cents,
          currency: payment.currency,
          dueOn: payment.due_on,
          id: payment.id,
          status: payment.status
        })),
      mandates: data.mandates.map((mandate) => ({
        accountLast4: mandate.account_last4,
        id: mandate.id,
        method: mandate.method,
        status: mandate.status
      }))
    },
    diplomas: data.certificates.map((certificate) => ({
      downloadPath: certificate.file_path
        ? `/api/files/certificate/${certificate.id}`
        : null,
      id: certificate.id,
      issuedOn: certificate.issued_on,
      number: certificate.certificate_number,
      status: certificate.status,
      title: certificate.title,
      verificationId: certificate.verification_public_id
    })),
    graduation: data.graduationParticipants.map((participant) => ({
      eventId: participant.event_id,
      id: participant.id,
      inviteStatus: participant.invite_status,
      participantId: participant.participant_id,
      result: participant.result,
      status: participant.status
    })),
    terminology,
    documents: documents.map((document) => ({
      createdAt: document.created_at,
      description: document.description,
      downloadPath: document.file_path
        ? `/api/files/tenant-document/${document.id}`
        : null,
      fileName: document.file_name,
      id: document.id,
      mimeType: document.mime_type,
      sizeBytes: document.size_bytes,
      title: document.title
    })),
    media: {
      policyVersion: PARTICIPANT_MEDIA_POLICY_VERSION,
      consents: mediaData.participants.map((participant) => {
        const consent = mediaConsentByParticipantId.get(participant.id);
        const effective = mediaData.consentStates[participant.id];
        return {
          canDecide: participant.accessLevel !== "view_only",
          effectiveReason: effective?.reason ?? "consent_missing",
          effectiveValid: effective?.valid ?? false,
          participantId: participant.id,
          participantName: participant.display_name,
          status: consent?.status ?? "pending",
          updatedAt: consent?.updated_at ?? null
        };
      }),
      items: mediaData.media.map((item) => ({
        caption: item.caption,
        downloadAllowed: item.download_allowed,
        downloadPath: item.download_allowed
          ? `/api/files/participant-media/${item.id}?download=1`
          : null,
        expiresAt: item.expires_at,
        id: item.id,
        mimeType: item.mime_type,
        participantId: item.participant_id,
        publishedAt: item.published_at,
        viewPath: `/api/files/participant-media/${item.id}`
      }))
    },
    feedback: feedbackData.requests.map((request) => {
      const campaign = feedbackCampaignById.get(request.campaign_id);
      const response = feedbackResponseByRequestId.get(request.id);
      return {
        campaignName: campaign?.name ?? "Korte evaluatie",
        completedAt: request.completed_at,
        expiresAt: request.expires_at,
        followUpQuestion:
          campaign?.follow_up_question ?? "Wil je nog iets met ons delen?",
        id: request.id,
        participantId: request.participant_id,
        participantName:
          feedbackParticipantById.get(request.participant_id) ?? "Jouw kind",
        prompt:
          campaign?.prompt ??
          "Hoe waarschijnlijk is het dat je ons aanbeveelt?",
        score: response?.score ?? null,
        status: request.status
      };
    })
  };
}

export async function buildInstructorNativeBootstrap(
  context: AuthenticatedTrustedAuthContext & {
    activeTenant: NonNullable<AuthenticatedTrustedAuthContext["activeTenant"]>;
  }
) {
  const tenantId = context.activeTenant.tenantId;
  const [data, hub, documents, announcements, tasks] = await Promise.all([
    getInstructorDataForContext(context),
    getInstructorCommunicationHubForContext(context),
    getInstructorDocumentsForTenant(tenantId),
    loadAnnouncements(tenantId, "instructor"),
    loadInstructorTasks(context)
  ]);
  const groupById = new Map(data.groups.map((group) => [group.id, group]));
  const resourceById = new Map(data.resources.map((resource) => [resource.id, resource]));
  const attendanceBySessionParticipant = new Map(
    data.attendance.map((attendance) => [
      `${attendance.session_id}:${attendance.participant_id}`,
      attendance
    ])
  );

  return {
    contractVersion: NATIVE_MOBILE_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    client: "instructor",
    tenant: data.tenant,
    user: data.user,
    assessment: {
      display: await loadAssessmentDisplay(tenantId),
      scaleVersion: "five_point_v1",
      values: [1, 2, 3, 4, 5],
      unratedValue: null
    },
    capabilities: {
      assessmentOfflineQueue: true,
      attendanceOfflineQueue: true,
      backgroundSync: true,
      encryptedDeviceCache: true,
      messageReply: hub.canReplyToParents,
      noAutomaticProgression: true
    },
    sessions: data.sessions.map((session) => {
      const group = groupById.get(session.group_id);
      const resource = session.resource_id
        ? resourceById.get(session.resource_id)
        : group?.default_resource_id
          ? resourceById.get(group.default_resource_id)
          : null;
      const roster = getSessionRoster(data, session.id);
      return {
        endsAt: session.ends_at,
        groupId: session.group_id,
        groupName: group?.name ?? "Lesgroep",
        id: session.id,
        resourceName: resource?.name ?? null,
        startsAt: session.starts_at,
        status: session.status,
        roster: roster.map(({ enrollment, participant }) => ({
          attendance:
            attendanceBySessionParticipant.get(
              `${session.id}:${participant.id}`
            )?.status ?? null,
          enrollmentId: enrollment.id,
          participantId: participant.id,
          participantName: participant.display_name
        }))
      };
    }),
    groups: data.groups.map((group) => ({
      capacity: group.capacity,
      id: group.id,
      name: group.name,
      programId: group.program_id,
      roster: getRosterForNativeGroup(data, group.id),
      stageId: group.stage_id,
      status: group.status
    })),
    learners: data.participants.map((participant) => {
      const enrollment = data.enrollments.find(
        (candidate) =>
          candidate.participant_id === participant.id &&
          candidate.status === "active"
      );
      const journey = enrollment
        ? data.swimJourneys.byEnrollmentId.get(enrollment.id)
        : null;
      return {
        displayName: participant.display_name,
        enrollmentId: enrollment?.id ?? null,
        id: participant.id,
        journey: journey
          ? {
              currentStage: journey.currentStage
                ? {
                    id: journey.currentStage.id,
                    key: journey.currentStage.stable_key,
                    name: journey.currentStage.name
                  }
                : null,
              items: journey.currentStageItems.map((item) => {
                const observation = journey.effectiveObservations.find(
                  (candidate) => candidate.curriculum_item_id === item.id
                );
                return {
                  description: item.description,
                  id: item.id,
                  key: item.stable_key,
                  name: item.name,
                  observedAt: observation?.observed_at ?? null,
                  positiveLabel: observation?.positive_label ?? null,
                  rating: observation?.rating ?? null
                };
              }),
              rings: journey.rings
            }
          : null
      };
    }),
    announcements,
    inbox: serializeHub(hub),
    tasks,
    documents: documents.map((document) => ({
      createdAt: document.created_at,
      description: document.description,
      downloadPath: document.file_path
        ? `/api/files/tenant-document/${document.id}`
        : null,
      fileName: document.file_name,
      id: document.id,
      mimeType: document.mime_type,
      sizeBytes: document.size_bytes,
      title: document.title
    }))
  };
}

function parentBadgesForParticipant(
  data: Awaited<ReturnType<typeof getParentBadgeWallDataForContext>>,
  participantId: string
) {
  const awards = (data.awards ?? []).filter(
    (award) => award.participant_id === participantId
  );
  const catalog = data.catalog ?? [];
  const custom = data.customBadges ?? [];
  const awardByCatalog = new Map(
    awards.flatMap((award) =>
      award.catalog_definition_id
        ? [[award.catalog_definition_id, award] as const]
        : []
    )
  );
  const awardByCustom = new Map(
    awards.flatMap((award) =>
      award.custom_badge_id ? [[award.custom_badge_id, award] as const] : []
    )
  );
  const catalogRows = catalog.map((definition) => {
    const award = awardByCatalog.get(definition.id);
    const override = (data.overrides ?? []).find(
      (candidate) => candidate.catalog_definition_id === definition.id
    );
    return {
      artworkPath: definition.artwork_asset_id
        ? `/api/files/badge-studio-asset/${definition.artwork_asset_id}`
        : null,
      awardId: award?.id ?? null,
      awardedAt: award?.awarded_at ?? null,
      category: definition.category,
      description:
        award?.resolved_description ??
        override?.description_default ??
        definition.description_default,
      earned: Boolean(award),
      id: definition.id,
      key: definition.badge_key,
      name:
        award?.resolved_name ??
        override?.name_default ??
        definition.name_default,
      shareCaption: award?.resolved_share_text ?? null
    };
  });
  const customRows = custom.map((definition) => {
    const award = awardByCustom.get(definition.id);
    return {
      artworkPath: definition.artwork_asset_id
        ? `/api/files/badge-studio-asset/${definition.artwork_asset_id}`
        : null,
      awardId: award?.id ?? null,
      awardedAt: award?.awarded_at ?? null,
      category: definition.category,
      description:
        award?.resolved_description ?? definition.description_default,
      earned: Boolean(award),
      id: definition.id,
      key: definition.badge_key,
      name: award?.resolved_name ?? definition.name_default,
      shareCaption: award?.resolved_share_text ?? null
    };
  });
  return [...catalogRows, ...customRows].sort((left, right) =>
    `${left.category}:${left.name}`.localeCompare(
      `${right.category}:${right.name}`,
      "nl"
    )
  );
}

function serializeHub(hub: ScopedCommunicationHubData) {
  return {
    canReply: hub.canReplyToParents,
    messages: hub.messages.map((message) => ({
      body: message.plain_text,
      createdAt: message.created_at,
      id: message.id,
      mine: message.sender_user_id === hub.currentUserId,
      senderName: message.sender_user_id
        ? hub.people.get(message.sender_user_id)?.name ?? "NXTTRACK"
        : "NXTTRACK",
      status: message.status,
      threadId: message.thread_id
    })),
    notifications: hub.notifications.map((notification) => ({
      actionPath: safeInternalPath(notification.action_href),
      createdAt: notification.created_at,
      id: notification.id,
      message: notification.message,
      priority: notification.priority,
      status: notification.status,
      title: notification.title
    })),
    threads: hub.threads.map((thread) => ({
      id: thread.id,
      lastMessageAt: thread.last_message_at,
      participantId: thread.participant_id,
      status: thread.status,
      subject: thread.subject,
      unread: hub.unreadThreadIds.includes(thread.id)
    }))
  };
}

async function loadAnnouncements(
  tenantId: string,
  scope: "instructor" | "parent"
) {
  const audiences =
    scope === "parent"
      ? ["parents", "all_tenant"]
      : ["instructors", "all_tenant"];
  const result = await createAdminClient()
    .from("tenant_messages")
    .select("id, title, body, published_at")
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .in("audience", audiences)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(50);
  if (result.error) {
    throw new Error(`Could not load native announcements: ${result.error.message}`);
  }
  return (result.data ?? []).map((message) => ({
    body: message.body,
    id: message.id,
    publishedAt: message.published_at,
    title: message.title
  }));
}

async function loadInstructorTasks(
  context: AuthenticatedTrustedAuthContext & {
    activeTenant: NonNullable<AuthenticatedTrustedAuthContext["activeTenant"]>;
  }
) {
  const tenantId = context.activeTenant.tenantId;
  const canManage = context.activeTenant.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)
  );
  let query = createAdminClient()
    .from("tenant_tasks")
    .select(
      "id, assigned_to_user_id, related_participant_id, title, description, priority, status, due_on, updated_at"
    )
    .eq("tenant_id", tenantId)
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(200);
  if (!canManage) {
    query = query.eq("assigned_to_user_id", context.user.id);
  }
  const result = await query;
  if (result.error) {
    throw new Error(`Could not load native instructor tasks: ${result.error.message}`);
  }
  return (result.data ?? []).map((task) => ({
    description: task.description,
    dueOn: task.due_on,
    id: task.id,
    participantId: task.related_participant_id,
    priority: task.priority,
    status: task.status,
    title: task.title,
    updatedAt: task.updated_at
  }));
}

async function loadAssessmentDisplay(tenantId: string) {
  const result = await createAdminClient()
    .from("tenant_settings")
    .select("assessment_rating_display")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return result.data?.assessment_rating_display === "stars"
    ? "stars"
    : "smileys";
}

function getRosterForNativeGroup(data: InstructorData, groupId: string) {
  const participantById = new Map(
    data.participants.map((participant) => [participant.id, participant])
  );
  return data.groupMemberships
    .filter(
      (membership) =>
        membership.group_id === groupId &&
        ["active", "trial"].includes(membership.status)
    )
    .flatMap((membership) => {
      const participant = participantById.get(membership.participant_id);
      return participant
        ? [
            {
              enrollmentId: membership.enrollment_id,
              participantId: participant.id,
              participantName: participant.display_name,
              status: membership.status
            }
          ]
        : [];
    })
    .sort((left, right) =>
      left.participantName.localeCompare(right.participantName, "nl")
    );
}

function safeInternalPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : null;
}
