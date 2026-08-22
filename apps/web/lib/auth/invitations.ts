import "server-only";

import { timingSafeEqual } from "node:crypto";

import { sendTransactionalEmail } from "@/lib/email/transactional";
import { renderInvitationEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformRole, isTenantRole, roleLabels, type AppRole, type PlatformRole, type TenantRole } from "./roles";
import { assertStrongPassword } from "./password-policy";
import {
  generateInvitationCode,
  generateUncommunicatedBootstrapPassword,
  hashAuthCode,
  isEightDigitCode,
  normalizeEmail
} from "./tokens";
import type { AuthenticatedTrustedAuthContext } from "./trusted-context";
import {
  clearMustChangePassword,
  findUserIdByEmail,
  recordUserInvitation,
  syncProfileEmail
} from "./user-security";

const invitationTtlHours = 48;

type TenantInviteTarget = {
  id: string;
  slug: string;
  name: string;
};

export type CreateInvitationInput = {
  acceptUrl: string;
  email: string;
  fullName?: string | null;
  role: AppRole;
  tenantSlug?: string | null;
  actor?: AuthenticatedTrustedAuthContext | null;
  skipActorCheck?: boolean;
};

export type CreateInvitationResult = {
  accepted: boolean;
  email: string;
  role: AppRole;
  tenantSlug: string | null;
};

export type AcceptInvitationInput = {
  code: string;
  confirmPassword?: string | null;
  email: string;
  password?: string | null;
};

export type InvitationAcceptanceFailure = "activation" | "invalid_code" | "password";

export class InvitationAcceptanceError extends Error {
  constructor(public readonly reason: InvitationAcceptanceFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvitationAcceptanceError";
  }
}

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

  const invitedUser = await ensureAuthUser({ email });
  const userId = invitedUser.userId;
  const invitationCode = generateInvitationCode();
  const expiresAt = new Date(Date.now() + invitationTtlHours * 60 * 60 * 1000).toISOString();
  const invitationId = await insertInvitation({
    actorUserId: input.actor?.user.id ?? null,
    codeHash: hashAuthCode(invitationCode, email),
    email,
    expiresAt,
    requiresPasswordSetup: invitedUser.isNewAccount,
    role,
    tenantId: tenant?.id ?? null,
    userId
  });

  try {
    await Promise.all([
      syncProfileEmail({ userId, email, fullName: input.fullName ?? null }),
      recordUserInvitation({
        userId,
        email,
        mustChangePassword: invitedUser.isNewAccount ? true : undefined
      }),
      tenant
        ? upsertTenantMembership({
            email,
            expiresAt,
            invitationId,
            role: role as TenantRole,
            tenantId: tenant.id,
            userId
          })
        : upsertPlatformMembership({
            expiresAt,
            invitationId,
            role: role as PlatformRole,
            userId
          })
    ]);
  } catch (error) {
    await revokeFailedInvitation(invitationId);

    if (invitedUser.isNewAccount) {
      await createAdminClient().auth.admin.deleteUser(userId).catch(() => undefined);
    }

    throw error;
  }

  const template = renderInvitationEmail({
    acceptUrl: input.acceptUrl,
    invitationCode,
    isNewAccount: invitedUser.isNewAccount,
    organizationName: tenant?.name ?? "NXTTRACK platform admin",
    roleLabel: roleLabels[role],
    tenantSlug: tenant?.slug ?? null
  });
  const mail = await sendTransactionalEmail({
    ...template,
    organizationName: tenant?.name ?? "NXTTRACK",
    relatedId: invitationId,
    relatedType: "auth_invitation",
    templateKey: "auth_invitation",
    tenantId: tenant?.id ?? null,
    to: email,
  });

  await updateInvitationDelivery(invitationId, mail.accepted, mail.accepted ? null : mail.reason);

  return {
    accepted: mail.accepted,
    email,
    role,
    tenantSlug: tenant?.slug ?? null
  };
}

export async function acceptInvitation(input: AcceptInvitationInput) {
  const email = normalizeEmail(input.email);

  if (!isEightDigitCode(input.code)) {
    throw new InvitationAcceptanceError("invalid_code", "Deze uitnodigingscode is ongeldig.");
  }

  const invitation = await findInvitationForCode(email, input.code);

  if (!invitation) {
    throw new InvitationAcceptanceError("invalid_code", "Deze uitnodigingscode is ongeldig of verlopen.");
  }

  if (invitation.requires_password_setup) {
    const password = input.password ?? "";
    const confirmPassword = input.confirmPassword ?? "";

    try {
      assertStrongPassword(password, confirmPassword);
    } catch (error) {
      throw new InvitationAcceptanceError("password", "Het gekozen wachtwoord voldoet niet aan de eisen.", { cause: error });
    }

    const { error } = await createAdminClient().auth.admin.updateUserById(invitation.invited_user_id, {
      password
    });

    if (error) {
      throw new InvitationAcceptanceError("activation", "Het accountwachtwoord kon niet worden ingesteld.", { cause: error });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("accept_auth_invitation", {
    target_invitation_id: invitation.id
  });

  if (error || data !== true) {
    throw new InvitationAcceptanceError(
      "activation",
      `Could not accept invitation: ${error?.message ?? "invitation no longer pending"}`
    );
  }

  if (invitation.requires_password_setup) {
    try {
      await clearMustChangePassword(invitation.invited_user_id, email);
    } catch (error) {
      console.error("[auth] Accepted invitation but could not clear password-change state.", {
        invitationId: invitation.id,
        cause: error instanceof Error ? error.message : "unknown"
      });
    }
  }

  return {
    accepted: true,
    isNewAccount: invitation.requires_password_setup
  } as const;
}

async function ensureAuthUser(input: { email: string }) {
  const existingUserId = await findUserIdByEmail(input.email);
  const admin = createAdminClient();

  if (existingUserId) {
    return {
      isNewAccount: false,
      userId: existingUserId,
    };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: generateUncommunicatedBootstrapPassword(),
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(`Could not create invited auth user: ${error?.message ?? "missing user"}`);
  }

  return {
    isNewAccount: true,
    userId: data.user.id,
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

async function upsertTenantMembership(input: {
  email: string;
  expiresAt: string;
  invitationId: string;
  role: TenantRole;
  tenantId: string;
  userId: string;
}) {
  const admin = createAdminClient();
  const existing = await admin
    .from("tenant_memberships")
    .select("status")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.userId)
    .eq("role", input.role)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Could not inspect tenant membership: ${existing.error.message}`);
  }

  if (existing.data?.status === "active") {
    throw new Error("Deze gebruiker heeft deze tenantrol al.");
  }

  const { error } = await admin.from("tenant_memberships").upsert(
    {
      invitation_expires_at: input.expiresAt,
      invitation_id: input.invitationId,
      invited_email: input.email,
      role: input.role,
      status: "invited",
      tenant_id: input.tenantId,
      user_id: input.userId
    },
    { onConflict: "tenant_id,user_id,role" }
  );

  if (error) {
    throw new Error(`Could not write tenant membership: ${error.message}`);
  }
}

async function upsertPlatformMembership(input: {
  expiresAt: string;
  invitationId: string;
  role: PlatformRole;
  userId: string;
}) {
  const admin = createAdminClient();
  const existing = await admin
    .from("platform_memberships")
    .select("status")
    .eq("user_id", input.userId)
    .eq("role", input.role)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Could not inspect platform membership: ${existing.error.message}`);
  }

  if (existing.data?.status === "active") {
    throw new Error("Deze gebruiker heeft deze platformrol al.");
  }

  const { error } = await admin.from("platform_memberships").upsert(
    {
      invitation_expires_at: input.expiresAt,
      invitation_id: input.invitationId,
      user_id: input.userId,
      role: input.role,
      status: "invited"
    },
    { onConflict: "user_id,role" }
  );

  if (error) {
    throw new Error(`Could not write platform membership: ${error.message}`);
  }
}

async function insertInvitation(input: {
  actorUserId: string | null;
  codeHash: string;
  email: string;
  expiresAt: string;
  requiresPasswordSetup: boolean;
  role: AppRole;
  tenantId: string | null;
  userId: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_invitations")
    .insert({
      code_hash: input.codeHash,
      email: input.email,
      expires_at: input.expiresAt,
      invited_by_user_id: input.actorUserId,
      invited_user_id: input.userId,
      requires_password_setup: input.requiresPasswordSetup,
      role: input.role,
      tenant_id: input.tenantId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Could not write invitation: ${error?.message ?? "missing invitation"}`);
  }

  return (data as { id: string }).id;
}

type PendingInvitationRow = {
  attempts: number;
  code_hash: string | null;
  expires_at: string;
  id: string;
  invited_user_id: string;
  requires_password_setup: boolean;
};

async function findInvitationForCode(email: string, code: string): Promise<PendingInvitationRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("auth_invitations")
    .select("id, invited_user_id, code_hash, attempts, expires_at, requires_password_setup")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Could not inspect invitation: ${error.message}`);
  }

  const now = Date.now();
  const pending = (data ?? []) as PendingInvitationRow[];

  for (const invitation of pending) {
    if (new Date(invitation.expires_at).getTime() <= now || invitation.attempts >= 5) {
      await expireInvitation(invitation.id);
      continue;
    }

    const expected = hashAuthCode(code, email);

    if (
      invitation.code_hash &&
      safeEqualHex(invitation.code_hash, expected)
    ) {
      return invitation;
    }
  }

  const latest = pending.find((invitation) => new Date(invitation.expires_at).getTime() > now && invitation.attempts < 5);

  if (latest) {
    const attempts = latest.attempts + 1;
    await admin
      .from("auth_invitations")
      .update({
        attempts,
        status: attempts >= 5 ? "expired" : "pending"
      })
      .eq("id", latest.id)
      .eq("status", "pending");
  }

  return null;
}

async function expireInvitation(invitationId: string) {
  const admin = createAdminClient();
  await admin
    .from("auth_invitations")
    .update({ status: "expired" })
    .eq("id", invitationId)
    .eq("status", "pending");
}

async function revokeFailedInvitation(invitationId: string) {
  const admin = createAdminClient();
  await admin
    .from("auth_invitations")
    .update({
      code_hash: null,
      delivery_error: "Invitation setup failed before delivery.",
      delivery_status: "failed",
      status: "revoked"
    })
    .eq("id", invitationId);
}

function safeEqualHex(left: string, right: string) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

async function updateInvitationDelivery(invitationId: string, accepted: boolean, errorMessage: string | null) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("auth_invitations")
    .update({
      delivery_status: accepted ? "pending" : "skipped",
      delivery_error: errorMessage,
      provider_accepted_at: accepted ? new Date().toISOString() : null
    })
    .eq("id", invitationId);

  if (error) {
    throw new Error(`Could not update invitation delivery state: ${error.message}`);
  }
}
