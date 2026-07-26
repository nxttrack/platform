import "server-only";

import type { AuthenticatedTrustedAuthContext } from "@/lib/auth/trusted-context";
import { createAdminClient } from "@/lib/supabase/admin";

export function canManageTenantFiles(context: AuthenticatedTrustedAuthContext, tenantId: string) {
  if (context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) {
    return true;
  }

  const membership = context.tenants.find((item) => item.tenantId === tenantId);

  return membership?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin" || role === "tenant_staff") ?? false;
}

export function hasTenantRole(context: AuthenticatedTrustedAuthContext, tenantId: string, roles: string[]) {
  const membership = context.tenants.find((item) => item.tenantId === tenantId);

  return membership?.roles.some((role) => roles.includes(role)) ?? false;
}

export async function canViewParticipantFile(context: AuthenticatedTrustedAuthContext, input: { participantId: string; tenantId: string }) {
  if (canManageTenantFiles(context, input.tenantId)) {
    return true;
  }

  const admin = createAdminClient();
  const [participantResult, guardianResult] = await Promise.all([
    admin.from("participants").select("guardian_user_id").eq("tenant_id", input.tenantId).eq("id", input.participantId).maybeSingle(),
    admin
      .from("participant_guardians")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("participant_id", input.participantId)
      .eq("guardian_user_id", context.user.id)
      .eq("status", "active")
      .limit(1)
  ]);

  if (participantResult.error || guardianResult.error) {
    return false;
  }

  const participant = participantResult.data as { guardian_user_id: string | null } | null;

  return participant?.guardian_user_id === context.user.id || ((guardianResult.data ?? []) as { id: string }[]).length > 0;
}

export async function canInstructParticipantFile(context: AuthenticatedTrustedAuthContext, input: { participantId: string; tenantId: string }) {
  if (canManageTenantFiles(context, input.tenantId)) {
    return true;
  }

  if (!hasTenantRole(context, input.tenantId, ["instructor"])) {
    return false;
  }

  const admin = createAdminClient();
  const membershipsResult = await admin
    .from("group_memberships")
    .select("group_id")
    .eq("tenant_id", input.tenantId)
    .eq("participant_id", input.participantId)
    .in("status", ["active", "trial"]);

  if (membershipsResult.error) {
    return false;
  }

  const groupIds = [...new Set(((membershipsResult.data ?? []) as { group_id: string }[]).map((membership) => membership.group_id))];

  if (groupIds.length === 0) {
    return false;
  }

  const assignmentResult = await admin
    .from("group_instructor_assignments")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("instructor_user_id", context.user.id)
    .eq("status", "active")
    .in("group_id", groupIds)
    .limit(1);

  return !assignmentResult.error && ((assignmentResult.data ?? []) as { id: string }[]).length > 0;
}
