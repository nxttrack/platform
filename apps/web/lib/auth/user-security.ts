import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "./tokens";

export async function upsertUserSecurity(input: {
  userId: string;
  email: string;
  mustChangePassword: boolean;
  lastInvitedAt?: string | null;
  passwordChangedAt?: string | null;
}) {
  const admin = createAdminClient();
  const row = {
    user_id: input.userId,
    email: normalizeEmail(input.email),
    must_change_password: input.mustChangePassword,
    ...(input.lastInvitedAt !== undefined ? { last_invited_at: input.lastInvitedAt } : {}),
    ...(input.passwordChangedAt !== undefined ? { password_changed_at: input.passwordChangedAt } : {})
  };

  const { error } = await admin.from("user_security").upsert(row, { onConflict: "user_id" });

  if (error) {
    throw new Error(`Could not update user security state: ${error.message}`);
  }
}

export async function recordUserInvitation(input: { userId: string; email: string; mustChangePassword?: boolean }) {
  const admin = createAdminClient();
  const row = {
    user_id: input.userId,
    email: normalizeEmail(input.email),
    last_invited_at: new Date().toISOString(),
    ...(input.mustChangePassword === undefined ? {} : { must_change_password: input.mustChangePassword })
  };

  const { error } = await admin.from("user_security").upsert(row, { onConflict: "user_id" });

  if (error) {
    throw new Error(`Could not record user invitation: ${error.message}`);
  }
}

export async function clearMustChangePassword(userId: string, email: string | null) {
  const admin = createAdminClient();
  const update = {
    must_change_password: false,
    password_changed_at: new Date().toISOString(),
    ...(email ? { email: normalizeEmail(email) } : {})
  };

  const { error } = await admin.from("user_security").update(update).eq("user_id", userId);

  if (error) {
    throw new Error(`Could not clear password-change requirement: ${error.message}`);
  }
}

export async function syncProfileEmail(input: { userId: string; email: string; fullName?: string | null }) {
  const admin = createAdminClient();
  const profile = {
    id: input.userId,
    email: normalizeEmail(input.email),
    ...(input.fullName ? { full_name: input.fullName } : {})
  };

  const { error } = await admin.from("profiles").upsert(profile, { onConflict: "id" });

  if (error) {
    throw new Error(`Could not sync profile email: ${error.message}`);
  }
}

export async function markAcceptedInvitations(input: { userId: string; email: string }) {
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("auth_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      invited_user_id: input.userId
    })
    .eq("status", "pending")
    .eq("email", normalizeEmail(input.email));

  if (error) {
    throw new Error(`Could not mark invitations as accepted: ${error.message}`);
  }
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = normalizeEmail(email);
  const admin = createAdminClient();
  const [profileResult, securityResult] = await Promise.all([
    admin.from("profiles").select("id").eq("email", normalizedEmail).maybeSingle(),
    admin.from("user_security").select("user_id").eq("email", normalizedEmail).maybeSingle()
  ]);

  if (profileResult.error && profileResult.error.code !== "PGRST116") {
    throw new Error(`Could not look up profile by email: ${profileResult.error.message}`);
  }

  if (securityResult.error && securityResult.error.code !== "PGRST116") {
    throw new Error(`Could not look up security state by email: ${securityResult.error.message}`);
  }

  return (profileResult.data as { id: string } | null)?.id ?? (securityResult.data as { user_id: string } | null)?.user_id ?? null;
}
