"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvitation } from "@/lib/auth/invitations";
import { isTenantRole, type TenantRole } from "@/lib/auth/roles";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { normalizeEmail } from "@/lib/auth/tokens";
import { findUserIdByEmail, syncProfileEmail } from "@/lib/auth/user-security";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";

const tenantStatuses = new Set(["active", "inactive", "suspended"]);
const membershipStatuses = new Set(["invited", "active", "suspended"]);
const sectors = new Set(["swim_school", "football_school", "sports_club", "martial_arts_school", "dance_school", "generic_lessons"]);
const domainKinds = new Set(["subdomain", "custom_domain"]);
const domainStatuses = new Set(["pending", "verified", "disabled"]);

export async function updatePlatformTenantAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const admin = createAdminClient();
  const before = await getTenant(tenantId);
  const next = {
    name: readRequired(formData, "name").slice(0, 160),
    sector: readEnum(formData, "sector", sectors),
    slug: normalizeSlug(readRequired(formData, "slug")),
    status: readEnum(formData, "status", tenantStatuses)
  };
  const { error } = await admin.from("tenants").update(next).eq("id", tenantId);
  if (error) redirect(detailPath(tenantId, "error=tenant_update"));
  await audit(context.user.id, tenantId, "platform.tenant_updated", "tenant", tenantId, before, next);
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=tenant"));
}

export async function createTenantAccountAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const tenant = await getTenant(tenantId);
  const role = readRole(formData);
  const email = normalizeEmail(readRequired(formData, "email"));
  const fullName = readRequired(formData, "fullName").slice(0, 160);
  try {
    await createInvitation({
      acceptUrl: `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`,
      actor: context,
      email,
      fullName,
      role,
      tenantSlug: tenant.slug
    });
  } catch {
    redirect(detailPath(tenantId, "error=account_create"));
  }
  await audit(context.user.id, tenantId, "platform.account_invited", "auth_invitation", null, {}, { email, fullName, role });
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=account_invited"));
}

export async function updateTenantMemberAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const membershipId = readUuid(formData, "membershipId");
  const role = readRole(formData);
  const status = readEnum(formData, "status", membershipStatuses);
  const fullName = readRequired(formData, "fullName").slice(0, 160);
  const email = normalizeEmail(readRequired(formData, "email"));
  const admin = createAdminClient();
  const membershipResult = await admin
    .from("tenant_memberships")
    .select("id, user_id, role, status, invited_email")
    .eq("id", membershipId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (membershipResult.error || !membershipResult.data) redirect(detailPath(tenantId, "error=member_missing"));
  const before = membershipResult.data;
  await assertOwnerContinuity(tenantId, membershipId, before.role, before.status, role, status);
  const duplicate = await admin.from("tenant_memberships").select("id").eq("tenant_id", tenantId).eq("user_id", before.user_id).eq("role", role).neq("id", membershipId).maybeSingle();
  if (duplicate.data) redirect(detailPath(tenantId, "error=role_duplicate"));

  const authResult = await admin.auth.admin.getUserById(before.user_id);
  if (authResult.error || !authResult.data.user) redirect(detailPath(tenantId, "error=auth_missing"));
  const oldEmail = normalizeEmail(authResult.data.user.email ?? before.invited_email ?? "");
  if (email !== oldEmail) {
    const sharedAccount = await isAccountSharedOutsideTenant(tenantId, before.user_id);
    if (sharedAccount) redirect(detailPath(tenantId, "error=shared_email_change"));
    const existingUserId = await findUserIdByEmail(email);
    if (existingUserId && existingUserId !== before.user_id) redirect(detailPath(tenantId, "error=email_conflict"));
    const authUpdate = await admin.auth.admin.updateUserById(before.user_id, { email, email_confirm: true });
    if (authUpdate.error) redirect(detailPath(tenantId, "error=email_conflict"));
  }
  try {
    await syncProfileEmail({ userId: before.user_id, email, fullName });
  } catch {
    redirect(detailPath(tenantId, "error=profile_update"));
  }
  await admin.from("user_security").update({ email }).eq("user_id", before.user_id);
  const next = { invited_email: email, role, status };
  const update = await admin.from("tenant_memberships").update(next).eq("id", membershipId).eq("tenant_id", tenantId);
  if (update.error) redirect(detailPath(tenantId, "error=member_update"));

  if (before.status === "invited" && status === "invited" && email !== oldEmail) {
    const invitedMemberships = await admin
      .from("tenant_memberships")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", before.user_id)
      .eq("status", "invited");
    if (invitedMemberships.error) redirect(detailPath(tenantId, "error=member_updated_invite_failed"));
    await revokePendingInvitations(tenantId, before.user_id);
    const tenant = await getTenant(tenantId);
    try {
      const acceptUrl = `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`;
      for (const membership of invitedMemberships.data ?? []) {
        if (!isTenantRole(membership.role)) continue;
        await createInvitation({ acceptUrl, actor: context, email, fullName, role: membership.role, tenantSlug: tenant.slug });
      }
    } catch {
      redirect(detailPath(tenantId, "error=member_updated_invite_failed"));
    }
  }

  await audit(context.user.id, tenantId, "platform.membership_updated", "tenant_membership", membershipId, before, { ...next, email, fullName });
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=member"));
}

export async function removeTenantMemberAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const membershipId = readUuid(formData, "membershipId");
  const removeAuthAccount = formData.get("removeAuthAccount") === "on";
  const admin = createAdminClient();
  const membershipResult = await admin
    .from("tenant_memberships")
    .select("id, user_id, role, status, invited_email")
    .eq("id", membershipId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (membershipResult.error || !membershipResult.data) redirect(detailPath(tenantId, "error=member_missing"));
  const membership = membershipResult.data;
  await assertOwnerContinuity(tenantId, membershipId, membership.role, membership.status, "tenant_staff", "suspended");

  const deletion = await admin.from("tenant_memberships").delete().eq("id", membershipId).eq("tenant_id", tenantId);
  if (deletion.error) redirect(detailPath(tenantId, "error=member_remove"));
  await revokePendingInvitations(tenantId, membership.user_id, membership.role);
  let authDeleted = false;
  let retainedReason: string | null = null;
  if (removeAuthAccount) {
    const exclusivity = await inspectAuthAccountExclusivity(membership.user_id);
    if (exclusivity.exclusive) {
      const authDeletion = await admin.auth.admin.deleteUser(membership.user_id);
      if (authDeletion.error && !/not found|does not exist/i.test(authDeletion.error.message)) {
        redirect(detailPath(tenantId, "error=auth_remove"));
      }
      authDeleted = true;
    } else {
      retainedReason = exclusivity.reason;
    }
  }
  await audit(context.user.id, tenantId, "platform.membership_removed", "tenant_membership", membershipId, membership, { authDeleted, retainedReason });
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, authDeleted ? "saved=member_and_auth_removed" : retainedReason ? "saved=member_removed_auth_retained" : "saved=member_removed"));
}

export async function resendTenantInvitationAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const invitationId = readUuid(formData, "invitationId");
  const admin = createAdminClient();
  const invitationResult = await admin
    .from("auth_invitations")
    .select("id, invited_user_id, email, role, status")
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const invitation = invitationResult.data;
  if (invitationResult.error || !invitation || invitation.status === "accepted" || !isTenantRole(invitation.role)) redirect(detailPath(tenantId, "error=invite_state"));
  const [tenant, profile] = await Promise.all([
    getTenant(tenantId),
    admin.from("profiles").select("full_name").eq("id", invitation.invited_user_id).maybeSingle()
  ]);
  await revokePendingInvitations(tenantId, invitation.invited_user_id, invitation.role);
  try {
    await createInvitation({
      acceptUrl: `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`,
      actor: context,
      email: invitation.email,
      fullName: profile.data?.full_name ?? null,
      role: invitation.role,
      tenantSlug: tenant.slug
    });
  } catch {
    redirect(detailPath(tenantId, "error=invite_resend"));
  }
  await audit(context.user.id, tenantId, "platform.invitation_resent", "auth_invitation", invitationId, invitation, { email: invitation.email, role: invitation.role });
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=invite_resent"));
}

export async function revokeTenantInvitationAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const invitationId = readUuid(formData, "invitationId");
  const admin = createAdminClient();
  const invitation = await admin.from("auth_invitations").select("id, invited_user_id, role, status").eq("id", invitationId).eq("tenant_id", tenantId).maybeSingle();
  if (invitation.error || !invitation.data || invitation.data.status !== "pending") redirect(detailPath(tenantId, "error=invite_state"));
  const update = await admin.from("auth_invitations").update({ code_hash: null, status: "revoked" }).eq("id", invitationId).eq("status", "pending");
  if (update.error) redirect(detailPath(tenantId, "error=invite_revoke"));
  await admin.from("tenant_memberships").update({ status: "suspended" }).eq("tenant_id", tenantId).eq("user_id", invitation.data.invited_user_id).eq("role", invitation.data.role).eq("status", "invited");
  await audit(context.user.id, tenantId, "platform.invitation_revoked", "auth_invitation", invitationId, invitation.data, { status: "revoked" });
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=invite_revoked"));
}

export async function saveTenantDomainAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const domainId = readOptionalUuid(formData, "domainId");
  const admin = createAdminClient();
  const next = {
    hostname: readRequired(formData, "hostname").toLowerCase(),
    is_primary: formData.get("isPrimary") === "on",
    kind: readEnum(formData, "kind", domainKinds),
    status: readEnum(formData, "status", domainStatuses),
    tenant_id: tenantId
  };
  if (!isHostname(next.hostname)) redirect(detailPath(tenantId, "error=domain_validation"));
  const [currentDomain, currentPrimary] = await Promise.all([
    domainId
      ? admin.from("tenant_domains").select("*").eq("id", domainId).eq("tenant_id", tenantId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("tenant_domains").select("id").eq("tenant_id", tenantId).eq("is_primary", true).maybeSingle()
  ]);
  if (currentDomain.error || currentPrimary.error || (domainId && !currentDomain.data)) {
    redirect(detailPath(tenantId, "error=domain_save"));
  }

  const before = currentDomain.data ?? {};
  let savedDomainId = domainId;

  if (!domainId) {
    const inserted = await admin
      .from("tenant_domains")
      .insert({ ...next, is_primary: next.is_primary && !currentPrimary.data })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) redirect(detailPath(tenantId, "error=domain_save"));
    savedDomainId = inserted.data.id;
  } else if (!next.is_primary || currentDomain.data?.is_primary) {
    const write = await admin.from("tenant_domains").update(next).eq("id", domainId).eq("tenant_id", tenantId);
    if (write.error) redirect(detailPath(tenantId, "error=domain_save"));
  }

  if (next.is_primary && savedDomainId && currentPrimary.data?.id !== savedDomainId) {
    const demotion = currentPrimary.data
      ? await admin.from("tenant_domains").update({ is_primary: false }).eq("id", currentPrimary.data.id).eq("tenant_id", tenantId)
      : { error: null };
    if (demotion.error) {
      if (!domainId) await admin.from("tenant_domains").delete().eq("id", savedDomainId).eq("tenant_id", tenantId);
      redirect(detailPath(tenantId, "error=domain_save"));
    }

    const promotion = await admin
      .from("tenant_domains")
      .update({ ...next, is_primary: true })
      .eq("id", savedDomainId)
      .eq("tenant_id", tenantId);
    if (promotion.error) {
      if (currentPrimary.data) {
        await admin.from("tenant_domains").update({ is_primary: true }).eq("id", currentPrimary.data.id).eq("tenant_id", tenantId);
      }
      if (!domainId) await admin.from("tenant_domains").delete().eq("id", savedDomainId).eq("tenant_id", tenantId);
      redirect(detailPath(tenantId, "error=domain_save"));
    }
  }

  await audit(context.user.id, tenantId, domainId ? "platform.domain_updated" : "platform.domain_created", "tenant_domain", savedDomainId, before, next);
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=domain"));
}

export async function removeTenantDomainAction(formData: FormData) {
  const context = await requirePlatformAdmin();
  const tenantId = readUuid(formData, "tenantId");
  const domainId = readUuid(formData, "domainId");
  const admin = createAdminClient();
  const before = await admin.from("tenant_domains").select("*").eq("id", domainId).eq("tenant_id", tenantId).maybeSingle();
  if (!before.data || before.data.is_primary) redirect(detailPath(tenantId, "error=primary_domain_remove"));
  const deletion = await admin.from("tenant_domains").delete().eq("id", domainId).eq("tenant_id", tenantId);
  if (deletion.error) redirect(detailPath(tenantId, "error=domain_remove"));
  await audit(context.user.id, tenantId, "platform.domain_removed", "tenant_domain", domainId, before.data, {});
  refreshTenant(tenantId);
  redirect(detailPath(tenantId, "saved=domain_removed"));
}

async function requirePlatformAdmin() {
  const context = await requirePrivateShellContext("/platform");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) redirect("/platform?error=forbidden");
  return context;
}

async function getTenant(tenantId: string) {
  const result = await createAdminClient().from("tenants").select("id, name, slug, sector, status").eq("id", tenantId).maybeSingle();
  if (result.error || !result.data) redirect("/platform?error=tenant_missing");
  return result.data;
}

async function assertOwnerContinuity(tenantId: string, membershipId: string, oldRole: string, oldStatus: string, nextRole: string, nextStatus: string) {
  if (oldRole !== "tenant_owner" || oldStatus !== "active" || (nextRole === "tenant_owner" && nextStatus === "active")) return;
  const result = await createAdminClient().from("tenant_memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("role", "tenant_owner").eq("status", "active").neq("id", membershipId);
  if ((result.count ?? 0) === 0) redirect(detailPath(tenantId, "error=last_owner"));
}

async function revokePendingInvitations(tenantId: string, userId: string, role?: string) {
  let query = createAdminClient()
    .from("auth_invitations")
    .update({ code_hash: null, status: "revoked" })
    .eq("tenant_id", tenantId)
    .eq("invited_user_id", userId)
    .eq("status", "pending");
  if (role) query = query.eq("role", role);
  await query;
}

async function isAccountSharedOutsideTenant(tenantId: string, userId: string) {
  const admin = createAdminClient();
  const [tenantMembership, platformMembership] = await Promise.all([
    admin.from("tenant_memberships").select("id").eq("user_id", userId).neq("tenant_id", tenantId).limit(1),
    admin.from("platform_memberships").select("id").eq("user_id", userId).limit(1)
  ]);
  if (tenantMembership.error || platformMembership.error) return true;
  return Boolean(tenantMembership.data?.length || platformMembership.data?.length);
}

async function inspectAuthAccountExclusivity(userId: string) {
  const admin = createAdminClient();
  const checks = await Promise.all([
    admin.from("tenant_memberships").select("id").eq("user_id", userId).limit(1),
    admin.from("platform_memberships").select("id").eq("user_id", userId).limit(1),
    admin.from("participants").select("id").eq("guardian_user_id", userId).limit(1),
    admin.from("participant_guardians").select("id").eq("guardian_user_id", userId).limit(1),
    admin.from("group_instructor_assignments").select("id").eq("instructor_user_id", userId).limit(1),
    admin.from("session_instructor_assignments").select("id").eq("instructor_user_id", userId).limit(1)
  ]);
  const error = checks.find((result) => result.error)?.error;
  if (error) return { exclusive: false, reason: "referentiecontrole_mislukt" };
  const [memberships, platform, participants, guardians, groups, sessions] = checks.map((result) => result.data ?? []);
  const hasCurrentTenantDomainData = [participants, guardians, groups, sessions].some((rows) => rows.length > 0);
  if (memberships.length || platform.length || hasCurrentTenantDomainData) {
    return { exclusive: false, reason: memberships.length || platform.length ? "gedeeld_account" : "dossierkoppelingen" };
  }
  return { exclusive: true, reason: null };
}

async function audit(actorUserId: string, tenantId: string, eventType: string, subjectType: string, subjectId: string | null, beforeState: unknown, afterState: unknown) {
  const { error } = await createAdminClient().from("platform_admin_audit_events").insert({
    actor_user_id: actorUserId,
    after_state: afterState,
    before_state: beforeState,
    event_type: eventType,
    subject_id: subjectId,
    subject_type: subjectType,
    tenant_id: tenantId
  });
  if (error) throw new Error(`Platform audit failed: ${error.message}`);
}

function refreshTenant(tenantId: string) {
  revalidatePath("/platform");
  revalidatePath(`/platform/organisaties/${tenantId}`);
  revalidatePath("/platform/uitnodigingen");
}

function detailPath(tenantId: string, query: string) {
  return `/platform/organisaties/${tenantId}?${query}` as `/${string}`;
}

function readRequired(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  if (!value) throw new Error(`${field} is required`);
  return value;
}
function readEnum(formData: FormData, field: string, allowed: Set<string>) {
  const value = readRequired(formData, field);
  if (!allowed.has(value)) throw new Error(`${field} is invalid`);
  return value;
}
function readRole(formData: FormData): TenantRole {
  const value = readRequired(formData, "role");
  if (!isTenantRole(value)) throw new Error("role is invalid");
  return value;
}
function readUuid(formData: FormData, field: string) {
  const value = readRequired(formData, field);
  if (!isUuid(value)) throw new Error(`${field} is invalid`);
  return value;
}
function readOptionalUuid(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  if (!value) return null;
  if (!isUuid(value)) throw new Error(`${field} is invalid`);
  return value;
}
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function normalizeSlug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function isHostname(value: string) { return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value); }
