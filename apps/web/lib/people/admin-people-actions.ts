"use server";

import { revalidatePath } from "next/cache";

import { createTemporaryPassword } from "@/lib/auth/password-policy";
import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { assertLiveEmailConfigured, sendTemporaryPasswordEmail, type LiveSmtpSettings } from "@/lib/communication/live-email";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createAdminClient } from "@/lib/supabase/admin";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;

type TenantContext = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  actorId: string;
};

type AuthUserLike = {
  id: string;
  email?: string | null;
};

type TenantDomainForInvite = {
  hostname: string;
  status: string;
  is_primary: boolean;
};

export async function createLearnerOperationsFlowAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const participantName = requiredString(formData, "participant_display_name");
  const participantBirthdate = optionalDate(formData, "participant_birthdate");
  const participantReference = optionalString(formData, "participant_external_reference");

  const participantId = await createParticipant(admin, context, {
    displayName: participantName,
    birthdate: participantBirthdate,
    externalReference: participantReference
  });

  await recordPeopleAudit(admin, context, {
    participantId,
    eventType: "participant_created",
    summary: `Leerlingprofiel aangemaakt voor ${participantName}.`,
    metadata: { birthdate: participantBirthdate, external_reference: participantReference }
  });

  const guardianEmail = optionalEmail(formData, "guardian_email");

  if (guardianEmail) {
    await inviteOrLinkGuardian(admin, context, {
      participantId,
      email: guardianEmail,
      fullName: optionalString(formData, "guardian_full_name"),
      relationship: enumValue(formData, "guardian_relationship", ["parent", "guardian", "athlete_self"], "parent")
    });
  }

  const programId = optionalString(formData, "program_id");
  let enrollmentId: string | null = null;

  if (programId) {
    enrollmentId = await createEnrollment(admin, context, {
      participantId,
      programId,
      currentStageId: optionalString(formData, "current_stage_id"),
      subscriptionPlanId: optionalString(formData, "subscription_plan_id"),
      startedOn: requiredDate(formData, "started_on"),
      status: enumValue(formData, "enrollment_status", ["pending", "active", "paused", "completed", "cancelled"], "active")
    });

    await recordPeopleAudit(admin, context, {
      participantId,
      enrollmentId,
      eventType: "enrollment_created",
      summary: `Inschrijving aangemaakt voor ${participantName}.`,
      metadata: { program_id: programId }
    });
  }

  const groupId = optionalString(formData, "group_id");

  if (groupId && enrollmentId) {
    const membershipId = await createGroupMembership(admin, context, {
      enrollmentId,
      groupId,
      startsOn: requiredDate(formData, "membership_starts_on"),
      status: enumValue(formData, "membership_status", ["planned", "active", "ended", "cancelled"], "active")
    });

    await recordPeopleAudit(admin, context, {
      participantId,
      enrollmentId,
      groupMembershipId: membershipId,
      eventType: "group_membership_created",
      summary: `Groepsplaatsing aangemaakt voor ${participantName}.`,
      metadata: { group_id: groupId }
    });
  }

  await recordPeopleAudit(admin, context, {
    participantId,
    enrollmentId,
    eventType: "coherent_flow_created",
    summary: `Nieuwe leerlingflow afgerond voor ${participantName}.`,
    metadata: { guardian_email: guardianEmail, group_id: groupId }
  });

  revalidatePeople();
}

export async function inviteParticipantGuardianAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const participantId = requiredString(formData, "participant_id");
  const email = requiredEmail(formData, "guardian_email");
  const fullName = optionalString(formData, "guardian_full_name");
  const relationship = enumValue(formData, "guardian_relationship", ["parent", "guardian", "athlete_self"], "parent");

  await inviteOrLinkGuardian(admin, context, {
    participantId,
    email,
    fullName,
    relationship
  });

  revalidatePeople();
}

export async function updateParticipantPeopleAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const participantId = requiredString(formData, "id");
  const displayName = requiredString(formData, "display_name");

  await throwOnError(
    admin
      .from("participants")
      .update({
        external_reference: optionalString(formData, "external_reference"),
        display_name: displayName,
        birthdate: optionalDate(formData, "birthdate"),
        status: enumValue(formData, "status", ["active", "inactive", "archived"], "active")
      })
      .eq("id", participantId)
      .eq("tenant_id", context.tenantId)
  );
  await recordPeopleAudit(admin, context, {
    participantId,
    eventType: "participant_updated",
    summary: `Leerlingprofiel bijgewerkt voor ${displayName}.`
  });
  revalidatePeople();
}

export async function createEnrollmentPeopleAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const participantId = requiredString(formData, "participant_id");
  const programId = requiredString(formData, "program_id");
  const enrollmentId = await createEnrollment(admin, context, {
    participantId,
    programId,
    currentStageId: optionalString(formData, "current_stage_id"),
    subscriptionPlanId: optionalString(formData, "subscription_plan_id"),
    startedOn: requiredDate(formData, "started_on"),
    status: enumValue(formData, "status", ["pending", "active", "paused", "completed", "cancelled"], "active")
  });

  await throwOnError(
    admin
      .from("enrollments")
      .update({
        external_reference: optionalString(formData, "external_reference"),
        ended_on: optionalDate(formData, "ended_on")
      })
      .eq("id", enrollmentId)
      .eq("tenant_id", context.tenantId)
  );
  await recordPeopleAudit(admin, context, {
    participantId,
    enrollmentId,
    eventType: "enrollment_created",
    summary: "Inschrijving aangemaakt vanuit leerlingdossier.",
    metadata: { program_id: programId }
  });
  revalidatePeople();
}

export async function updateEnrollmentPeopleAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const enrollmentId = requiredString(formData, "id");
  const participantId = requiredString(formData, "participant_id");
  const programId = requiredString(formData, "program_id");

  await throwOnError(
    admin
      .from("enrollments")
      .update({
        external_reference: optionalString(formData, "external_reference"),
        program_id: programId,
        current_stage_id: optionalString(formData, "current_stage_id"),
        subscription_plan_id: optionalString(formData, "subscription_plan_id"),
        status: enumValue(formData, "status", ["pending", "active", "paused", "completed", "cancelled"], "active"),
        started_on: requiredDate(formData, "started_on"),
        ended_on: optionalDate(formData, "ended_on")
      })
      .eq("id", enrollmentId)
      .eq("participant_id", participantId)
      .eq("tenant_id", context.tenantId)
  );
  await recordPeopleAudit(admin, context, {
    participantId,
    enrollmentId,
    eventType: "enrollment_updated",
    summary: "Inschrijving bijgewerkt vanuit leerlingdossier.",
    metadata: {
      program_id: programId,
      current_stage_id: optionalString(formData, "current_stage_id"),
      subscription_plan_id: optionalString(formData, "subscription_plan_id")
    }
  });
  revalidatePeople();
}

export async function createGroupMembershipPeopleAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const enrollmentId = requiredString(formData, "enrollment_id");
  const enrollment = await getEnrollment(admin, context, enrollmentId);
  const groupId = requiredString(formData, "group_id");
  const membershipId = await createGroupMembership(admin, context, {
    enrollmentId,
    groupId,
    startsOn: requiredDate(formData, "starts_on"),
    status: enumValue(formData, "status", ["planned", "active", "ended", "cancelled"], "active")
  });

  await throwOnError(
    admin
      .from("group_memberships")
      .update({ ends_on: optionalDate(formData, "ends_on") })
      .eq("id", membershipId)
      .eq("tenant_id", context.tenantId)
  );
  await recordPeopleAudit(admin, context, {
    participantId: enrollment.participant_id,
    enrollmentId,
    groupMembershipId: membershipId,
    eventType: "group_membership_created",
    summary: "Groepsplaatsing aangemaakt vanuit leerlingdossier.",
    metadata: { group_id: groupId }
  });
  revalidatePeople();
}

export async function updateGroupMembershipPeopleAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const membershipId = requiredString(formData, "id");
  const enrollmentId = requiredString(formData, "enrollment_id");
  const enrollment = await getEnrollment(admin, context, enrollmentId);
  const groupId = requiredString(formData, "group_id");

  await throwOnError(
    admin
      .from("group_memberships")
      .update({
        enrollment_id: enrollmentId,
        group_id: groupId,
        status: enumValue(formData, "status", ["planned", "active", "ended", "cancelled"], "active"),
        starts_on: requiredDate(formData, "starts_on"),
        ends_on: optionalDate(formData, "ends_on")
      })
      .eq("id", membershipId)
      .eq("tenant_id", context.tenantId)
  );
  await recordPeopleAudit(admin, context, {
    participantId: enrollment.participant_id,
    enrollmentId,
    groupMembershipId: membershipId,
    eventType: "group_membership_updated",
    summary: "Groepsplaatsing bijgewerkt vanuit leerlingdossier.",
    metadata: { group_id: groupId }
  });
  revalidatePeople();
}

async function inviteOrLinkGuardian(
  admin: ReturnType<typeof createAdminClient>,
  context: TenantContext,
  input: {
    participantId: string;
    email: string;
    fullName: string | null;
    relationship: "parent" | "guardian" | "athlete_self";
  }
) {
  const email = normalizeEmail(input.email);
  const existingUser = await findAuthUserByEmail(admin, email);
  const temporaryPassword = createTemporaryPassword();
  const userId = existingUser ? existingUser.id : await createAuthUser(admin, email, temporaryPassword);

  if (existingUser) {
    await throwOnAuthError(admin.auth.admin.updateUserById(userId, { password: temporaryPassword }));
  }

  await upsertProfile(admin, userId, input.fullName ?? email);
  await throwOnError(
    admin.from("tenant_memberships").upsert(
      {
        tenant_id: context.tenantId,
        user_id: userId,
        role: "parent",
        status: "active",
        invited_email: email
      },
      { onConflict: "tenant_id,user_id,role" }
    )
  );
  await throwOnError(
    admin.from("participant_guardians").upsert(
      {
        tenant_id: context.tenantId,
        participant_id: input.participantId,
        profile_id: userId,
        relationship: input.relationship,
        display_name: input.fullName,
        email,
        status: "active"
      },
      { onConflict: "tenant_id,participant_id,profile_id,relationship" }
    )
  );
  await requirePasswordChange(admin, userId, existingUser ? "admin_reset" : "temporary_password", context.actorId);

  const invitation = await createAccountInvitation(admin, context, {
    participantId: input.participantId,
    userId,
    email,
    fullName: input.fullName,
    role: "parent",
    metadata: {
      flow: existingUser ? "existing_parent_reset" : "new_parent_invite"
    }
  });

  try {
    const smtpSettings = await getGlobalSmtpSettings(admin);

    assertLiveEmailConfigured({ smtpSettings });

    const delivery = await sendTemporaryPasswordEmail(
      {
        to: email,
        fullName: input.fullName,
        tenantName: context.tenantName,
        accessLabel: "ouderportaal toegang",
        loginUrl: await buildTenantLoginUrl(admin, context),
        temporaryPassword,
        expiresAt: invitation.expires_at,
        reason: existingUser ? "reset" : "invite"
      },
      { smtpSettings }
    );

    await markAccountInvitation(admin, invitation.id, {
      status: "sent",
      deliveryProvider: delivery.provider,
      errorMessage: null
    });
  } catch (cause) {
    await markAccountInvitation(admin, invitation.id, {
      status: "email_failed",
      deliveryProvider: null,
      errorMessage: getErrorMessage(cause)
    });
  }

  await recordPeopleAudit(admin, context, {
    participantId: input.participantId,
    eventType: existingUser ? "guardian_linked" : "guardian_invited",
    summary: `${input.fullName ?? email} is gekoppeld als ouder/verzorger.`,
    metadata: { email, relationship: input.relationship, existing_user: Boolean(existingUser) }
  });
}

async function createParticipant(
  admin: ReturnType<typeof createAdminClient>,
  context: TenantContext,
  input: {
    displayName: string;
    birthdate: string | null;
    externalReference: string | null;
  }
) {
  const { data, error } = await admin
    .from("participants")
    .insert({
      tenant_id: context.tenantId,
      external_reference: input.externalReference,
      display_name: input.displayName,
      birthdate: input.birthdate,
      status: "active"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Leerling kon niet worden aangemaakt.");
  }

  return (data as { id: string }).id;
}

async function createEnrollment(
  admin: ReturnType<typeof createAdminClient>,
  context: TenantContext,
  input: {
    participantId: string;
    programId: string;
    currentStageId: string | null;
    subscriptionPlanId: string | null;
    status: string;
    startedOn: string;
  }
) {
  const { data, error } = await admin
    .from("enrollments")
    .insert({
      tenant_id: context.tenantId,
      participant_id: input.participantId,
      program_id: input.programId,
      current_stage_id: input.currentStageId,
      subscription_plan_id: input.subscriptionPlanId,
      status: input.status,
      started_on: input.startedOn
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Inschrijving kon niet worden aangemaakt.");
  }

  return (data as { id: string }).id;
}

async function createGroupMembership(
  admin: ReturnType<typeof createAdminClient>,
  context: TenantContext,
  input: {
    enrollmentId: string;
    groupId: string;
    startsOn: string;
    status: string;
  }
) {
  const { data, error } = await admin
    .from("group_memberships")
    .insert({
      tenant_id: context.tenantId,
      enrollment_id: input.enrollmentId,
      group_id: input.groupId,
      status: input.status,
      starts_on: input.startsOn
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Groepsplaatsing kon niet worden aangemaakt.");
  }

  return (data as { id: string }).id;
}

async function getEnrollment(admin: ReturnType<typeof createAdminClient>, context: TenantContext, enrollmentId: string) {
  const { data, error } = await admin.from("enrollments").select("id, participant_id").eq("id", enrollmentId).eq("tenant_id", context.tenantId).single();

  if (error || !data) {
    throw new Error(error?.message ?? "Inschrijving niet gevonden.");
  }

  return data as { id: string; participant_id: string };
}

async function createAuthUser(admin: ReturnType<typeof createAdminClient>, email: string, temporaryPassword: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Supabase Auth kon de ouder niet aanmaken.");
  }

  return data.user.id;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string): Promise<AuthUserLike | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });

    if (error) {
      throw new Error(error.message);
    }

    const match = data.users.find((user) => user.email?.toLowerCase() === email);

    if (match) {
      return match;
    }

    if (data.users.length < 100) {
      return null;
    }
  }

  return null;
}

async function upsertProfile(admin: ReturnType<typeof createAdminClient>, userId: string, fullName: string) {
  await throwOnError(
    admin.from("profiles").upsert(
      {
        id: userId,
        full_name: fullName
      },
      { onConflict: "id" }
    )
  );
}

async function requirePasswordChange(admin: ReturnType<typeof createAdminClient>, userId: string, reason: "temporary_password" | "admin_reset", actorId: string) {
  await throwOnError(
    admin.from("user_security_requirements").upsert(
      {
        user_id: userId,
        must_change_password: true,
        reason,
        created_by_profile_id: actorId,
        resolved_at: null
      },
      { onConflict: "user_id" }
    )
  );
}

async function createAccountInvitation(
  admin: ReturnType<typeof createAdminClient>,
  context: TenantContext,
  input: {
    participantId: string;
    userId: string;
    email: string;
    fullName: string | null;
    role: "parent";
    metadata: Record<string, string>;
  }
) {
  const { data, error } = await admin
    .from("tenant_account_invitations")
    .insert({
      tenant_id: context.tenantId,
      participant_id: input.participantId,
      user_id: input.userId,
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      status: "created",
      created_by_profile_id: context.actorId,
      metadata: input.metadata
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Ouderuitnodiging kon niet worden vastgelegd.");
  }

  return data as { id: string; expires_at: string };
}

async function markAccountInvitation(
  admin: ReturnType<typeof createAdminClient>,
  invitationId: string,
  input: {
    status: "sent" | "email_failed";
    deliveryProvider: "smtp" | "sendgrid" | null;
    errorMessage: string | null;
  }
) {
  await throwOnError(
    admin
      .from("tenant_account_invitations")
      .update({
        status: input.status,
        delivery_provider: input.deliveryProvider,
        last_sent_at: input.status === "sent" ? new Date().toISOString() : null,
        error_message: input.errorMessage
      })
      .eq("id", invitationId)
  );
}

async function recordPeopleAudit(
  admin: ReturnType<typeof createAdminClient>,
  context: TenantContext,
  input: {
    participantId: string | null;
    enrollmentId?: string | null;
    groupMembershipId?: string | null;
    eventType: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }
) {
  await throwOnError(
    admin.from("people_audit_events").insert({
      tenant_id: context.tenantId,
      actor_profile_id: context.actorId,
      participant_id: input.participantId,
      enrollment_id: input.enrollmentId ?? null,
      group_membership_id: input.groupMembershipId ?? null,
      event_type: input.eventType,
      summary: input.summary,
      metadata: input.metadata ?? {}
    })
  );
}

async function requireTenantWriter(): Promise<TenantContext> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om leerlingbeheer te wijzigen.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    tenantId: context.activeTenant.tenantId,
    tenantName: context.activeTenant.name,
    tenantSlug: context.activeTenant.slug,
    actorId: context.user.id
  };
}

async function getGlobalSmtpSettings(admin: ReturnType<typeof createAdminClient>): Promise<LiveSmtpSettings | null> {
  const { data, error } = await admin
    .from("platform_smtp_settings")
    .select("status, host, port, secure, from_email, from_name, reply_to_email, username_secret_reference, password_secret_reference")
    .eq("id", "global")
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as LiveSmtpSettings | null;
}

async function buildTenantLoginUrl(admin: ReturnType<typeof createAdminClient>, context: TenantContext) {
  const { data, error } = await admin.from("tenant_domains").select("hostname, status, is_primary").eq("tenant_id", context.tenantId).order("is_primary", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const domains = Array.isArray(data) ? (data as TenantDomainForInvite[]) : [];
  const primaryDomain = domains.find((domain) => domain.status === "verified" && domain.is_primary) ?? domains.find((domain) => domain.status === "verified");
  const tenantSuffix = process.env.TENANT_DOMAIN_SUFFIX;
  const baseUrl =
    primaryDomain?.hostname ? `https://${primaryDomain.hostname}` : tenantSuffix ? `https://${context.tenantSlug}.${tenantSuffix}` : process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? process.env.PLATFORM_ADMIN_URL ?? "https://staging.nxttrack.nl";

  return `${baseUrl.replace(/\/$/, "")}/login?next=${encodeURIComponent("/auth/redirect")}`;
}

function revalidatePeople() {
  for (const path of ["/admin", "/admin/leerlingen", "/admin/enrollments", "/admin/groups", "/admin/groepen", "/parent", "/auth/tenant-switch"]) {
    revalidatePath(path);
  }
}

async function throwOnAuthError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function requiredEmail(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  return normalizeEmail(value);
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? normalizeEmail(value) : null;
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Vul een geldig e-mailadres in.");
  }

  return normalized;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;

  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function requiredDate(formData: FormData, key: string) {
  const value = requiredString(formData, key);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function optionalDate(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${key} heeft geen geldige datum.`);
  }

  return value;
}

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Actie kon niet worden afgerond.";
}
