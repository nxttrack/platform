import "server-only";

import { sendTransactionalEmail } from "@/lib/email/transactional";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformRole, isTenantRole, roleLabels, type AppRole, type PlatformRole, type TenantRole } from "./roles";
import { generateTemporaryPassword, normalizeEmail } from "./tokens";
import type { AuthenticatedTrustedAuthContext } from "./trusted-context";
import { findUserIdByEmail, recordUserInvitation, syncProfileEmail } from "./user-security";

type TenantInviteTarget = {
  id: string;
  slug: string;
  name: string;
};

export type CreateInvitationInput = {
  email: string;
  fullName?: string | null;
  role: AppRole;
  tenantSlug?: string | null;
  loginUrl: string;
  actor?: AuthenticatedTrustedAuthContext | null;
  skipActorCheck?: boolean;
};

export type CreateInvitationResult = {
  email: string;
  role: AppRole;
  tenantSlug: string | null;
  delivered: boolean;
};

export async function createInvitation(input: CreateInvitationInput): Promise<CreateInvitationResult> {
  const email = normalizeEmail(input.email);
  const role = input.role;

  if (!isPlatformRole(role) && !isTenantRole(role)) {
    throw new Error("Deze rol kan niet worden uitgenodigd.");
  }

  const tenant = isTenantRole(role) ? await requireTenant(input.tenantSlug) : null;

  if (isPlatformRole(role) && input.tenantSlug) {
    throw new Error("Platformrollen horen niet bij een tenant.");
  }

  if (!input.skipActorCheck) {
    assertCanInvite({
      actor: input.actor ?? null,
      role,
      tenantId: tenant?.id ?? null
    });
  }

  const invitedUser = await ensureAuthUser({
    email,
    temporaryPassword: generateTemporaryPassword()
  });
  const userId = invitedUser.userId;

  await Promise.all([
    syncProfileEmail({ userId, email, fullName: input.fullName ?? null }),
    recordUserInvitation({
      userId,
      email,
      mustChangePassword: invitedUser.passwordWasChanged ? true : undefined
    }),
    tenant ? upsertTenantMembership({ tenantId: tenant.id, userId, role: role as TenantRole, email }) : upsertPlatformMembership({ userId, role: role as PlatformRole })
  ]);

  const invitationId = await insertInvitation({
    email,
    role,
    tenantId: tenant?.id ?? null,
    userId,
    actorUserId: input.actor?.user.id ?? null
  });

  const mail = await sendTransactionalEmail({
    to: email,
    subject: "Je NXTTRACK uitnodiging",
    text: [
      "Je bent uitgenodigd voor NXTTRACK.",
      "",
      tenant ? `Omgeving: ${tenant.name} (${tenant.slug})` : "Omgeving: NXTTRACK platform admin",
      `Rol: ${roleLabels[role]}`,
      `Login: ${input.loginUrl}`,
      invitedUser.temporaryPassword ? `Tijdelijk wachtwoord: ${invitedUser.temporaryPassword}` : "Gebruik je bestaande NXTTRACK wachtwoord.",
      "",
      invitedUser.temporaryPassword ? "Na je eerste login moet je direct een nieuw wachtwoord kiezen." : "Je hoeft je wachtwoord niet opnieuw te wijzigen voor deze extra toegang."
    ].join("\n")
  });

  await updateInvitationDelivery(invitationId, mail.delivered, mail.delivered ? null : mail.reason);

  return {
    email,
    role,
    tenantSlug: tenant?.slug ?? null,
    delivered: mail.delivered
  };
}

async function ensureAuthUser(input: { email: string; temporaryPassword: string }) {
  const existingUserId = await findUserIdByEmail(input.email);
  const admin = createAdminClient();

  if (existingUserId) {
    return {
      userId: existingUserId,
      temporaryPassword: null,
      passwordWasChanged: false
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.temporaryPassword,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(`Could not create invited auth user: ${error?.message ?? "missing user"}`);
  }

  return {
    userId: data.user.id,
    temporaryPassword: input.temporaryPassword,
    passwordWasChanged: true
  };
}

async function requireTenant(slug: string | null | undefined): Promise<TenantInviteTarget> {
  const tenantSlug = slug?.trim().toLowerCase();

  if (!tenantSlug) {
    throw new Error("Kies een tenant voor tenantrollen.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from("tenants").select("id, slug, name").eq("slug", tenantSlug).eq("status", "active").maybeSingle();

  if (error || !data) {
    throw new Error(error ? `Could not find tenant: ${error.message}` : "Deze tenant bestaat niet of is niet actief.");
  }

  return data as TenantInviteTarget;
}

function assertCanInvite(input: { actor: AuthenticatedTrustedAuthContext | null; role: AppRole; tenantId: string | null }) {
  if (!input.actor) {
    throw new Error("Log opnieuw in om uitnodigingen te sturen.");
  }

  const platformRoles = input.actor.platform?.roles ?? [];
  const platformCanInvite = platformRoles.some((role) => role === "platform_owner" || role === "platform_admin");

  if (isPlatformRole(input.role)) {
    if (!platformCanInvite) {
      throw new Error("Alleen platform owners en admins kunnen platformgebruikers uitnodigen.");
    }

    return;
  }

  if (platformCanInvite) {
    return;
  }

  const tenantMembership = input.actor.tenants.find((membership) => membership.tenantId === input.tenantId);
  const tenantCanInvite = tenantMembership?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") ?? false;

  if (!tenantCanInvite) {
    throw new Error("Alleen organisatiebeheerders kunnen gebruikers voor deze organisatie uitnodigen.");
  }
}

async function upsertTenantMembership(input: { tenantId: string; userId: string; role: TenantRole; email: string }) {
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_memberships").upsert(
    {
      tenant_id: input.tenantId,
      user_id: input.userId,
      role: input.role,
      status: "active",
      invited_email: input.email
    },
    { onConflict: "tenant_id,user_id,role" }
  );

  if (error) {
    throw new Error(`Could not write tenant membership: ${error.message}`);
  }
}

async function upsertPlatformMembership(input: { userId: string; role: PlatformRole }) {
  const admin = createAdminClient();
  const { error } = await admin.from("platform_memberships").upsert(
    {
      user_id: input.userId,
      role: input.role,
      status: "active"
    },
    { onConflict: "user_id,role" }
  );

  if (error) {
    throw new Error(`Could not write platform membership: ${error.message}`);
  }
}

async function insertInvitation(input: { email: string; role: AppRole; tenantId: string | null; userId: string; actorUserId: string | null }) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_invitations")
    .insert({
      email: input.email,
      tenant_id: input.tenantId,
      role: input.role,
      invited_user_id: input.userId,
      invited_by_user_id: input.actorUserId
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Could not write invitation: ${error?.message ?? "missing invitation"}`);
  }

  return (data as { id: string }).id;
}

async function updateInvitationDelivery(invitationId: string, delivered: boolean, errorMessage: string | null) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("auth_invitations")
    .update({
      delivery_status: delivered ? "sent" : "skipped",
      delivery_error: errorMessage
    })
    .eq("id", invitationId);

  if (error) {
    throw new Error(`Could not update invitation delivery state: ${error.message}`);
  }
}
