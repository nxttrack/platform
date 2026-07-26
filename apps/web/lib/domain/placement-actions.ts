"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { findUserIdByEmail } from "@/lib/auth/user-security";
import { sendTransactionalEmail } from "@/lib/email/transactional";
import { renderSlotOfferEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant, summarizeGroupCapacity, type GroupMembershipRow, type GroupRow } from "./core";
import { computePlacementScores, type WaitlistEntryRow, type WaitlistPreferenceRow } from "./placement";
import {
  generateOfferSessionToken,
  generateOfferVerificationCode,
  hashOfferSessionToken,
  hashOfferVerificationCode,
  slotOfferCookieName
} from "./placement-token";
import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";

const weekdayMap: Record<string, number> = {
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
  zondag: 7
};

export async function createWaitlistEntryFromIntakeAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const intakeSubmissionId = readRequired(formData, "intakeSubmissionId");
  const submissionResult = await admin
    .from("intake_submissions")
    .select("id, program_id, selected_option, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, preferred_days, preferred_dayparts, preferred_notes, selected_group_id")
    .eq("tenant_id", tenant.id)
    .eq("id", intakeSubmissionId)
    .single();

  if (submissionResult.error || !submissionResult.data) {
    redirect("/admin/wachtlijst?error=intake");
  }

  const submission = submissionResult.data as {
    id: string;
    program_id: string | null;
    selected_option: string;
    parent_name: string;
    parent_email: string;
    parent_phone: string | null;
    participant_name: string;
    participant_birth_date: string | null;
    preferred_days: string[];
    preferred_dayparts: unknown;
    preferred_notes: string | null;
    selected_group_id: string | null;
  };

  if (!submission.program_id) {
    redirect("/admin/wachtlijst?error=program");
  }

  const stage = submission.selected_group_id
    ? await getStageForSelectedGroup(tenant.id, submission.program_id, submission.selected_group_id)
    : await getFirstStageForProgram(tenant.id, submission.program_id);
  const entryResult = await admin
    .from("waitlist_entries")
    .insert({
      tenant_id: tenant.id,
      intake_submission_id: submission.id,
      program_id: submission.program_id,
      recommended_stage_id: stage?.id ?? null,
      parent_name: submission.parent_name,
      parent_email: submission.parent_email,
      parent_phone: submission.parent_phone,
      participant_name: submission.participant_name,
      participant_birth_date: submission.participant_birth_date,
      selected_option: submission.selected_option,
      status: "waiting",
      source: "intake",
      admin_notes: submission.preferred_notes
    })
    .select("id")
    .single();

  if (entryResult.error || !entryResult.data) {
    redirect("/admin/wachtlijst?error=waitlist");
  }

  const entryId = (entryResult.data as { id: string }).id;
  const dayparts = normalizeStoredDayparts(submission.preferred_dayparts);
  const preferenceRows = submission.preferred_days.flatMap((day) => {
    const weekday = weekdayMap[day.toLowerCase()];

    if (!weekday) {
      return [];
    }

    const ranges = dayparts[String(weekday)] ?? [];

    return (ranges.length > 0 ? ranges : [null]).map((daypart) => ({
      tenant_id: tenant.id,
      waitlist_entry_id: entryId,
      weekday,
      starts_after: daypart ? daypartRanges[daypart].startsAfter : null,
      ends_before: daypart ? daypartRanges[daypart].endsBefore : null,
      preference_weight: 5,
      notes: submission.preferred_notes
    }));
  });

  if (preferenceRows.length > 0) {
    await admin.from("waitlist_preferences").insert(preferenceRows);
  }

  if (stage) {
    await admin.from("placement_recommendations").insert({
      tenant_id: tenant.id,
      waitlist_entry_id: entryId,
      recommended_stage_id: stage.id,
      score: 50,
      reasons: [submission.selected_group_id ? "gekozen slim intakevoorstel" : "eerste actieve stage in programma"],
      created_by_user_id: context.user.id
    });
  }

  await Promise.all([
    admin.from("intake_submissions").update({ status: "reviewing" }).eq("tenant_id", tenant.id).eq("id", submission.id),
    writeAudit({
      tenantId: tenant.id,
      waitlistEntryId: entryId,
      actorUserId: context.user.id,
      eventType: "waitlist.created",
      message: "Intake is omgezet naar wachtlijstentry."
    }),
    stage
      ? writeAudit({
          tenantId: tenant.id,
          waitlistEntryId: entryId,
          actorUserId: context.user.id,
          eventType: "stage.recommended",
          message: `Stage aanbevolen: ${stage.name}.`,
          payload: { stageId: stage.id }
        })
      : Promise.resolve()
  ]);

  revalidatePath("/admin/wachtlijst");
  redirect("/admin/wachtlijst?saved=1");
}

export async function declineIntakeForWaitlistAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const submissionId = readRequired(formData, "intakeSubmissionId");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("intake_submissions")
    .update({ status: "closed" })
    .eq("tenant_id", tenant.id)
    .eq("id", submissionId)
    .in("status", ["received", "reviewing"])
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/admin/wachtlijst?error=decline");
  }

  revalidatePath("/admin/intake");
  revalidatePath("/admin/wachtlijst");
  redirect("/admin/wachtlijst?saved=declined");
}

export async function updateWaitlistEntryStatusAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const waitlistEntryId = readRequired(formData, "waitlistEntryId");
  const status = readRequired(formData, "status");

  if (!["waiting", "reviewing", "declined", "closed"].includes(status)) {
    redirect("/admin/wachtlijst?error=status");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("waitlist_entries")
    .update({ status })
    .eq("tenant_id", tenant.id)
    .eq("id", waitlistEntryId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/admin/wachtlijst?error=status");
  }

  await writeAudit({
    actorUserId: context.user.id,
    eventType: `waitlist.${status}`,
    message: `Wachtlijststatus gewijzigd naar ${status}.`,
    tenantId: tenant.id,
    waitlistEntryId
  });

  revalidatePath("/admin/wachtlijst");
  redirect(`/admin/wachtlijst?saved=${status}`);
}

const daypartRanges = {
  morning: { startsAfter: "06:00", endsBefore: "12:00" },
  afternoon: { startsAfter: "12:00", endsBefore: "17:00" },
  evening: { startsAfter: "17:00", endsBefore: "23:59" }
} as const;

function normalizeStoredDayparts(value: unknown): Record<string, Array<keyof typeof daypartRanges>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([weekday, candidate]) => [
      weekday,
      Array.isArray(candidate)
        ? candidate.filter((part): part is keyof typeof daypartRanges => typeof part === "string" && part in daypartRanges)
        : []
    ])
  );
}

export async function scoreWaitlistEntryAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const entryId = readRequired(formData, "waitlistEntryId");
  const { entry, preferences, groups, memberships } = await loadScoringInput(tenant.id, entryId);
  const scores = computePlacementScores({ entry, preferences, groups, memberships });

  await admin.from("placement_scores").delete().eq("tenant_id", tenant.id).eq("waitlist_entry_id", entryId);

  if (scores.length > 0) {
    await admin.from("placement_scores").insert(
      scores.map((score) => ({
        tenant_id: tenant.id,
        waitlist_entry_id: entryId,
        group_id: score.group.id,
        score: score.score,
        capacity_available: score.capacityAvailable,
        stage_match: score.stageMatch,
        preferred_day_match: score.preferredDayMatch,
        reasons: score.reasons
      }))
    );
  }

  await writeAudit({
    tenantId: tenant.id,
    waitlistEntryId: entryId,
    actorUserId: context.user.id,
    eventType: "placement.scored",
    message: `${scores.length} groepsoptie(s) gescoord.`
  });

  revalidatePath("/admin/wachtlijst");
  redirect("/admin/wachtlijst?saved=1");
}

export async function createSlotOfferAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const waitlistEntryId = readRequired(formData, "waitlistEntryId");
  const groupId = readRequired(formData, "groupId");
  const entry = await getWaitlistEntry(tenant.id, waitlistEntryId);

  if (!entry) {
    redirect("/admin/wachtlijst?error=waitlist");
  }

  const groupEligible = await groupHasCapacity(tenant.id, groupId, entry.program_id);

  if (!groupEligible) {
    redirect("/admin/wachtlijst?error=group");
  }

  const offerCode = generateOfferVerificationCode();
  const offerLink = `${await getTrustedRequestOrigin()}/plaatsing-aanbod`;
  const offerResult = await admin
    .from("slot_offers")
    .insert({
      tenant_id: tenant.id,
      waitlist_entry_id: waitlistEntryId,
      group_id: groupId,
      verification_code_hash: hashOfferVerificationCode(offerCode, entry.parent_email),
      parent_email: entry.parent_email,
      status: "sent",
      offered_at: new Date().toISOString(),
      created_by_user_id: context.user.id
    })
    .select("id")
    .single();

  if (offerResult.error || !offerResult.data) {
    redirect("/admin/wachtlijst?error=offer");
  }

  const offerId = (offerResult.data as { id: string }).id;
  const template = renderSlotOfferEmail({
    offerCode,
    offerLink,
    organizationName: tenant.name,
    parentName: entry.parent_name,
    participantName: entry.participant_name
  });
  const mail = await sendTransactionalEmail({
    ...template,
    organizationName: tenant.name,
    relatedId: offerId,
    relatedType: "slot_offer",
    templateKey: "slot_offer",
    tenantId: tenant.id,
    to: entry.parent_email,
  });

  await Promise.all([
    admin
      .from("slot_offers")
      .update({
        delivery_status: mail.delivered ? "sent" : "skipped",
        delivery_error: mail.delivered ? null : mail.reason
      })
      .eq("tenant_id", tenant.id)
      .eq("id", offerId),
    admin.from("waitlist_entries").update({ status: "offered" }).eq("tenant_id", tenant.id).eq("id", waitlistEntryId),
    writeAudit({
      tenantId: tenant.id,
      waitlistEntryId,
      slotOfferId: offerId,
      actorUserId: context.user.id,
      eventType: "slot_offer.created",
      message: "Slot offer aangemaakt.",
      payload: { groupId }
    }),
    writeAudit({
      tenantId: tenant.id,
      waitlistEntryId,
      slotOfferId: offerId,
      actorUserId: context.user.id,
      eventType: "slot_offer.sent",
      message: mail.delivered ? "Slot offer per e-mail verstuurd." : "Slot offer link aangemaakt; mailprovider niet geconfigureerd.",
      payload: { deliveryStatus: mail.delivered ? "sent" : "skipped" }
    })
  ]);

  revalidatePath("/admin/wachtlijst");
  redirect(`/admin/wachtlijst?saved=1&delivery=${mail.delivered ? "sent" : "skipped"}`);
}

export async function verifySlotOfferAction(formData: FormData) {
  const email = readRequired(formData, "email").trim().toLowerCase();
  const code = readRequired(formData, "code");

  if (!/^[0-9]{8}$/.test(code)) {
    redirect("/plaatsing-aanbod?status=ongeldig");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("slot_offers")
    .select("id, expires_at, verification_attempts, verification_code_hash")
    .ilike("parent_email", email)
    .eq("status", "sent")
    .order("offered_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.verification_code_hash) {
    redirect("/plaatsing-aanbod?status=ongeldig");
  }

  if (new Date(data.expires_at).getTime() <= Date.now() || data.verification_attempts >= 5) {
    await admin.from("slot_offers").update({ status: "expired" }).eq("id", data.id).eq("status", "sent");
    redirect("/plaatsing-aanbod?status=verlopen");
  }

  if (!safeEqualHash(data.verification_code_hash, hashOfferVerificationCode(code, email))) {
    const attempts = data.verification_attempts + 1;
    await admin
      .from("slot_offers")
      .update({
        verification_attempts: attempts,
        status: attempts >= 5 ? "expired" : "sent"
      })
      .eq("id", data.id)
      .eq("status", "sent");
    redirect("/plaatsing-aanbod?status=ongeldig");
  }

  const sessionToken = generateOfferSessionToken();
  const sessionExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const update = await admin
    .from("slot_offers")
    .update({
      verified_session_expires_at: sessionExpiresAt.toISOString(),
      verified_session_hash: hashOfferSessionToken(sessionToken),
      verification_attempts: 0
    })
    .eq("id", data.id)
    .eq("status", "sent");

  if (update.error) {
    redirect("/plaatsing-aanbod?status=fout");
  }

  (await cookies()).set(slotOfferCookieName, sessionToken, {
    httpOnly: true,
    maxAge: 15 * 60,
    path: "/plaatsing-aanbod",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production"
  });
  redirect("/plaatsing-aanbod");
}

export async function acceptSlotOfferAction(formData: FormData) {
  await respondToSlotOffer("accepted");
}

export async function declineSlotOfferAction(formData: FormData) {
  await respondToSlotOffer("declined");
}

async function respondToSlotOffer(response: "accepted" | "declined") {
  const admin = createAdminClient();
  const token = (await cookies()).get(slotOfferCookieName)?.value;
  const offer = token ? await getOfferBySession(token) : null;

  if (!offer) {
    await clearOfferSession();
    redirect("/plaatsing-aanbod?status=ongeldig");
  }

  if (new Date(offer.expires_at).getTime() < Date.now()) {
    await Promise.all([
      admin.from("slot_offers").update({ status: "expired" }).eq("tenant_id", offer.tenant_id).eq("id", offer.id),
      writeAudit({
        tenantId: offer.tenant_id,
        waitlistEntryId: offer.waitlist_entry_id,
        slotOfferId: offer.id,
        eventType: "slot_offer.expired",
        message: "Offer token is verlopen."
      })
    ]);
    await clearOfferSession();
    redirect("/plaatsing-aanbod?status=verlopen");
  }

  if (offer.status !== "sent") {
    await clearOfferSession();
    redirect(`/plaatsing-aanbod?status=${offer.status}`);
  }

  if (response === "declined") {
    await Promise.all([
      admin
        .from("slot_offers")
        .update({
          status: "declined",
          responded_at: new Date().toISOString()
        })
        .eq("tenant_id", offer.tenant_id)
        .eq("id", offer.id),
      admin.from("waitlist_entries").update({ status: "declined" }).eq("tenant_id", offer.tenant_id).eq("id", offer.waitlist_entry_id),
      writeAudit({
        tenantId: offer.tenant_id,
        waitlistEntryId: offer.waitlist_entry_id,
        slotOfferId: offer.id,
        eventType: "slot_offer.declined",
        message: "Ouder heeft het aanbod geweigerd."
      })
    ]);
    await clearOfferSession();
    redirect("/plaatsing-aanbod?status=geweigerd");
  }

  const entry = await getWaitlistEntry(offer.tenant_id, offer.waitlist_entry_id);

  if (!entry) {
    redirect("/plaatsing-aanbod?status=ongeldig");
  }

  const capacityOk = await groupHasCapacity(offer.tenant_id, offer.group_id, entry.program_id);

  if (!capacityOk) {
    redirect("/plaatsing-aanbod?status=vol");
  }

  const guardianUserId = await findTenantGuardianUserId(offer.tenant_id, offer.parent_email);
  const participantResult = await admin
    .from("participants")
    .insert({
      tenant_id: offer.tenant_id,
      guardian_user_id: guardianUserId,
      display_name: entry.participant_name,
      birth_date: entry.participant_birth_date,
      status: "active"
    })
    .select("id")
    .single();

  if (participantResult.error || !participantResult.data) {
    redirect("/plaatsing-aanbod?status=fout");
  }

  const participantId = (participantResult.data as { id: string }).id;
  const enrollmentResult = await admin
    .from("enrollments")
    .insert({
      tenant_id: offer.tenant_id,
      participant_id: participantId,
      guardian_user_id: guardianUserId,
      program_id: entry.program_id,
      current_stage_id: entry.recommended_stage_id,
      status: "active",
      source: "intake",
      starts_on: new Date().toISOString().slice(0, 10)
    })
    .select("id")
    .single();

  if (enrollmentResult.error || !enrollmentResult.data) {
    redirect("/plaatsing-aanbod?status=fout");
  }

  const enrollmentId = (enrollmentResult.data as { id: string }).id;
  const membershipResult = await admin
    .from("group_memberships")
    .insert({
      tenant_id: offer.tenant_id,
      group_id: offer.group_id,
      enrollment_id: enrollmentId,
      participant_id: participantId,
      status: "active",
      starts_on: new Date().toISOString().slice(0, 10),
      capacity_weight: 1
    })
    .select("id")
    .single();

  if (membershipResult.error || !membershipResult.data) {
    redirect("/plaatsing-aanbod?status=fout");
  }

  const groupMembershipId = (membershipResult.data as { id: string }).id;

  if (guardianUserId) {
    await admin.from("participant_guardians").upsert(
      {
        tenant_id: offer.tenant_id,
        participant_id: participantId,
        guardian_user_id: guardianUserId,
        relationship: "parent",
        access_level: "primary",
        status: "active"
      },
      { onConflict: "tenant_id,participant_id,guardian_user_id" }
    );
  }

  await Promise.all([
    admin
      .from("slot_offers")
      .update({
        status: "accepted",
        responded_at: new Date().toISOString(),
        accepted_participant_id: participantId,
        accepted_enrollment_id: enrollmentId,
        accepted_group_membership_id: groupMembershipId
      })
      .eq("tenant_id", offer.tenant_id)
      .eq("id", offer.id),
    admin.from("waitlist_entries").update({ status: "placed" }).eq("tenant_id", offer.tenant_id).eq("id", offer.waitlist_entry_id),
    entry.intake_submission_id
      ? admin
          .from("intake_submissions")
          .update({ status: "converted", reviewed_at: new Date().toISOString() })
          .eq("tenant_id", offer.tenant_id)
          .eq("id", entry.intake_submission_id)
      : Promise.resolve(),
    writeAudit({
      tenantId: offer.tenant_id,
      waitlistEntryId: offer.waitlist_entry_id,
      slotOfferId: offer.id,
      eventType: "slot_offer.accepted",
      message: "Ouder heeft het aanbod geaccepteerd.",
      payload: { participantId, enrollmentId, groupMembershipId }
    })
  ]);

  await clearOfferSession();
  redirect("/plaatsing-aanbod?status=geaccepteerd");
}

async function loadScoringInput(tenantId: string, entryId: string) {
  const admin = createAdminClient();
  const [entryResult, preferencesResult, groupsResult, membershipsResult] = await Promise.all([
    admin
      .from("waitlist_entries")
      .select("id, intake_submission_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, admin_notes")
      .eq("tenant_id", tenantId)
      .eq("id", entryId)
      .single(),
    admin.from("waitlist_preferences").select("id, waitlist_entry_id, weekday, starts_after, ends_before, preference_weight").eq("tenant_id", tenantId).eq("waitlist_entry_id", entryId),
    admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenantId),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenantId)
  ]);

  if (entryResult.error || !entryResult.data || preferencesResult.error || groupsResult.error || membershipsResult.error) {
    redirect("/admin/wachtlijst?error=scoring");
  }

  return {
    entry: entryResult.data as WaitlistEntryRow,
    preferences: (preferencesResult.data ?? []) as WaitlistPreferenceRow[],
    groups: (groupsResult.data ?? []) as GroupRow[],
    memberships: (membershipsResult.data ?? []) as GroupMembershipRow[]
  };
}

async function getFirstStageForProgram(tenantId: string, programId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("program_stages").select("id, name").eq("tenant_id", tenantId).eq("program_id", programId).eq("status", "active").order("sort_order").limit(1);

  if (error) {
    return null;
  }

  return (data?.[0] as { id: string; name: string } | undefined) ?? null;
}

async function getStageForSelectedGroup(tenantId: string, programId: string, groupId: string) {
  const admin = createAdminClient();
  const groupResult = await admin
    .from("groups")
    .select("stage_id")
    .eq("tenant_id", tenantId)
    .eq("program_id", programId)
    .eq("id", groupId)
    .eq("status", "active")
    .maybeSingle();

  if (groupResult.error || !groupResult.data?.stage_id) {
    return getFirstStageForProgram(tenantId, programId);
  }

  const stageResult = await admin
    .from("program_stages")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("program_id", programId)
    .eq("id", groupResult.data.stage_id)
    .eq("status", "active")
    .maybeSingle();

  return (stageResult.data as { id: string; name: string } | null) ?? getFirstStageForProgram(tenantId, programId);
}

async function getWaitlistEntry(tenantId: string, entryId: string): Promise<WaitlistEntryRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("waitlist_entries")
    .select("id, intake_submission_id, program_id, recommended_stage_id, parent_name, parent_email, parent_phone, participant_name, participant_birth_date, selected_option, status, priority_date, admin_notes")
    .eq("tenant_id", tenantId)
    .eq("id", entryId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return (data as WaitlistEntryRow | null) ?? null;
}

async function getOfferBySession(token: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("slot_offers")
    .select("id, tenant_id, waitlist_entry_id, group_id, parent_email, status, expires_at")
    .eq("verified_session_hash", hashOfferSessionToken(token))
    .gt("verified_session_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as {
    id: string;
    tenant_id: string;
    waitlist_entry_id: string;
    group_id: string;
    parent_email: string;
    status: string;
    expires_at: string;
  };
}

async function clearOfferSession() {
  (await cookies()).delete(slotOfferCookieName);
}

function safeEqualHash(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function findTenantGuardianUserId(tenantId: string, email: string) {
  const admin = createAdminClient();
  let userId: string | null = null;

  try {
    userId = await findUserIdByEmail(email);
  } catch {
    return null;
  }

  if (!userId) {
    return null;
  }

  const { data, error } = await admin
    .from("tenant_memberships")
    .select("user_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("status", "active")
    .in("role", ["parent", "athlete"])
    .limit(1);

  if (error) {
    return null;
  }

  return ((data ?? []) as { user_id: string }[])[0]?.user_id ?? null;
}

async function groupHasCapacity(tenantId: string, groupId: string, expectedProgramId?: string) {
  const admin = createAdminClient();
  const [groupsResult, membershipsResult] = await Promise.all([
    admin.from("groups").select("id, program_id, stage_id, default_resource_id, name, code, status, capacity, default_weekday, default_start_time, default_end_time").eq("tenant_id", tenantId).eq("id", groupId).single(),
    admin.from("group_memberships").select("id, group_id, enrollment_id, participant_id, status, capacity_weight").eq("tenant_id", tenantId).eq("group_id", groupId)
  ]);

  if (groupsResult.error || !groupsResult.data || membershipsResult.error) {
    return false;
  }

  const group = groupsResult.data as GroupRow;

  if (group.status !== "active" || (expectedProgramId && group.program_id !== expectedProgramId)) {
    return false;
  }

  const [capacity] = summarizeGroupCapacity([group], (membershipsResult.data ?? []) as GroupMembershipRow[]);

  return !!capacity && capacity.available >= 1;
}

async function writeAudit(input: {
  tenantId: string;
  waitlistEntryId?: string | null;
  slotOfferId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  message?: string;
  payload?: Record<string, unknown>;
}) {
  const admin = createAdminClient();

  await admin.from("placement_audit_events").insert({
    tenant_id: input.tenantId,
    waitlist_entry_id: input.waitlistEntryId ?? null,
    slot_offer_id: input.slotOfferId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    message: input.message ?? null,
    payload: input.payload ?? {}
  });
}

function readRequired(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required.`);
  }

  return value.trim();
}
