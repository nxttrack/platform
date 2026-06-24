"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createTemporaryPassword } from "@/lib/auth/password-policy";
import { buildPath } from "@/lib/auth/redirects";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { assertLiveEmailConfigured, sendTemporaryPasswordEmail } from "@/lib/communication/live-email";
import { createAdminClient } from "@/lib/supabase/admin";

const tenantsPath = "/platform/tenants";
const platformWriteRoles = ["platform_owner", "platform_admin"] as const;

type AuthUserLike = {
  id: string;
  email?: string | null;
};

type TenantForInvite = {
  id: string;
  slug: string;
  name: string;
};

type TenantDomainForInvite = {
  hostname: string;
  status: string;
  is_primary: boolean;
};

type ActionResult = {
  notice?: string;
  error?: string;
};

export async function createTenantSuperAdminAction(formData: FormData) {
  const result = await createTenantSuperAdmin(formData);

  redirectWithResult(result);
}

export async function updateTenantSuperAdminAction(formData: FormData) {
  const result = await updateTenantSuperAdmin(formData);

  redirectWithResult(result);
}

export async function resetTenantSuperAdminPasswordAction(formData: FormData) {
  const result = await resetTenantSuperAdminPassword(formData);

  redirectWithResult(result);
}

async function createTenantSuperAdmin(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePlatformWriter();
    assertLiveEmailConfigured();

    const admin = createAdminClient();
    const tenantId = requiredString(formData, "tenant_id");
    const email = normalizeEmail(requiredString(formData, "email"));
    const fullName = optionalString(formData, "full_name");
    const tenant = await getTenant(admin, tenantId);
    const domains = await getTenantDomains(admin, tenantId);
    const existingUser = await findAuthUserByEmail(admin, email);
    const temporaryPassword = createTemporaryPassword();
    const userId = existingUser ? existingUser.id : await createAuthUser(admin, email, temporaryPassword);

    if (existingUser) {
      await throwOnAuthError(admin.auth.admin.updateUserById(userId, { password: temporaryPassword }));
    }

    await upsertProfile(admin, userId, fullName ?? email);
    await throwOnError(
      admin.from("tenant_memberships").upsert(
        {
          tenant_id: tenantId,
          user_id: userId,
          role: "tenant_owner",
          status: "active",
          invited_email: email
        },
        { onConflict: "tenant_id,user_id,role" }
      )
    );
    await requirePasswordChange(admin, userId, existingUser ? "admin_reset" : "temporary_password", actor.userId);

    const invitation = await createInvitation(admin, {
      tenantId,
      userId,
      email,
      fullName,
      actorId: actor.userId,
      metadata: {
        flow: existingUser ? "existing_user_reset" : "new_user_invite"
      }
    });

    const delivery = await sendTemporaryPasswordEmail({
      to: email,
      fullName,
      tenantName: tenant.name,
      loginUrl: buildTenantLoginUrl(tenant, domains),
      temporaryPassword,
      expiresAt: invitation.expires_at,
      reason: existingUser ? "reset" : "invite"
    });

    await markInvitationSent(admin, invitation.id, delivery.provider, delivery.messageId);
    revalidatePlatform();

    return { notice: `Tenant super admin ${email} is toegevoegd en gemaild.` };
  } catch (cause) {
    return { error: getErrorMessage(cause) };
  }
}

async function updateTenantSuperAdmin(formData: FormData): Promise<ActionResult> {
  try {
    await requirePlatformWriter();

    const admin = createAdminClient();
    const membershipId = requiredString(formData, "membership_id");
    const status = enumValue(formData, "status", ["active", "suspended"], "active");
    const fullName = optionalString(formData, "full_name");
    const membership = await getTenantOwnerMembership(admin, membershipId);

    await throwOnError(admin.from("tenant_memberships").update({ status }).eq("id", membershipId).eq("role", "tenant_owner"));

    if (fullName) {
      await upsertProfile(admin, membership.user_id, fullName);
    }

    revalidatePlatform();

    return { notice: "Tenant super admin is bijgewerkt." };
  } catch (cause) {
    return { error: getErrorMessage(cause) };
  }
}

async function resetTenantSuperAdminPassword(formData: FormData): Promise<ActionResult> {
  try {
    const actor = await requirePlatformWriter();
    assertLiveEmailConfigured();

    const admin = createAdminClient();
    const membershipId = requiredString(formData, "membership_id");
    const membership = await getTenantOwnerMembership(admin, membershipId);
    const tenant = await getTenant(admin, membership.tenant_id);
    const domains = await getTenantDomains(admin, membership.tenant_id);
    const email = membership.invited_email ?? (await getLatestInvitationEmail(admin, membership.user_id));

    if (!email) {
      throw new Error("Geen e-mailadres gevonden voor deze super admin.");
    }

    const temporaryPassword = createTemporaryPassword();

    await throwOnAuthError(admin.auth.admin.updateUserById(membership.user_id, { password: temporaryPassword }));
    await requirePasswordChange(admin, membership.user_id, "admin_reset", actor.userId);

    const invitation = await createInvitation(admin, {
      tenantId: membership.tenant_id,
      userId: membership.user_id,
      email,
      fullName: optionalString(formData, "full_name"),
      actorId: actor.userId,
      metadata: {
        flow: "password_reset"
      }
    });
    const delivery = await sendTemporaryPasswordEmail({
      to: email,
      fullName: optionalString(formData, "full_name"),
      tenantName: tenant.name,
      loginUrl: buildTenantLoginUrl(tenant, domains),
      temporaryPassword,
      expiresAt: invitation.expires_at,
      reason: "reset"
    });

    await markInvitationSent(admin, invitation.id, delivery.provider, delivery.messageId);
    revalidatePlatform();

    return { notice: `Nieuw tijdelijk wachtwoord is gemaild naar ${email}.` };
  } catch (cause) {
    return { error: getErrorMessage(cause) };
  }
}

async function requirePlatformWriter() {
  const context = await getTrustedAuthContext();

  if (context.status !== "authenticated" || !context.platform?.roles.some((role) => platformWriteRoles.includes(role as (typeof platformWriteRoles)[number]))) {
    throw new Error("Je hebt platform admin rechten nodig om tenant super admins te beheren.");
  }

  return {
    userId: context.user.id
  };
}

async function createAuthUser(admin: ReturnType<typeof createAdminClient>, email: string, temporaryPassword: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Supabase Auth kon de gebruiker niet aanmaken.");
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

async function createInvitation(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    tenantId: string;
    userId: string;
    email: string;
    fullName: string | null;
    actorId: string;
    metadata: Record<string, string>;
  }
) {
  const { data, error } = await admin
    .from("tenant_super_admin_invitations")
    .insert({
      tenant_id: input.tenantId,
      user_id: input.userId,
      email: input.email,
      full_name: input.fullName,
      status: "created",
      created_by_profile_id: input.actorId,
      metadata: input.metadata
    })
    .select("id, expires_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Uitnodiging kon niet worden vastgelegd.");
  }

  return data as { id: string; expires_at: string };
}

async function markInvitationSent(admin: ReturnType<typeof createAdminClient>, invitationId: string, provider: string, messageId: string | null) {
  await throwOnError(
    admin
      .from("tenant_super_admin_invitations")
      .update({
        status: "sent",
        delivery_provider: provider,
        last_sent_at: new Date().toISOString(),
        error_message: null,
        metadata: {
          message_id: messageId
        }
      })
      .eq("id", invitationId)
  );
}

async function getTenant(admin: ReturnType<typeof createAdminClient>, tenantId: string): Promise<TenantForInvite> {
  const { data, error } = await admin.from("tenants").select("id, slug, name").eq("id", tenantId).single();

  if (error || !data) {
    throw new Error(error?.message ?? "Tenant niet gevonden.");
  }

  return data as TenantForInvite;
}

async function getTenantDomains(admin: ReturnType<typeof createAdminClient>, tenantId: string): Promise<TenantDomainForInvite[]> {
  const { data, error } = await admin.from("tenant_domains").select("hostname, status, is_primary").eq("tenant_id", tenantId).order("is_primary", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return Array.isArray(data) ? (data as TenantDomainForInvite[]) : [];
}

async function getTenantOwnerMembership(admin: ReturnType<typeof createAdminClient>, membershipId: string) {
  const { data, error } = await admin.from("tenant_memberships").select("id, tenant_id, user_id, invited_email").eq("id", membershipId).eq("role", "tenant_owner").single();

  if (error || !data) {
    throw new Error(error?.message ?? "Tenant super admin niet gevonden.");
  }

  return data as { id: string; tenant_id: string; user_id: string; invited_email: string | null };
}

async function getLatestInvitationEmail(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.from("tenant_super_admin_invitations").select("email").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return typeof data?.email === "string" ? data.email : null;
}

function buildTenantLoginUrl(tenant: TenantForInvite, domains: TenantDomainForInvite[]) {
  const primaryDomain = domains.find((domain) => domain.status === "verified" && domain.is_primary) ?? domains.find((domain) => domain.status === "verified");
  const tenantSuffix = process.env.TENANT_DOMAIN_SUFFIX;
  const baseUrl =
    primaryDomain?.hostname ? `https://${primaryDomain.hostname}` : tenantSuffix ? `https://${tenant.slug}.${tenantSuffix}` : process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? process.env.PLATFORM_ADMIN_URL ?? "https://staging.nxttrack.nl";

  return `${baseUrl.replace(/\/$/, "")}/login?next=${encodeURIComponent("/auth/redirect")}`;
}

function redirectWithResult(result: ActionResult): never {
  revalidatePlatform();
  redirect(buildPath(tenantsPath, result));
}

function revalidatePlatform() {
  revalidatePath("/platform");
  revalidatePath(tenantsPath);
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

function getErrorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "Actie kon niet worden afgerond.";
}
