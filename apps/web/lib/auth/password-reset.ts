import "server-only";

import { sendTransactionalEmail } from "@/lib/email/transactional";
import { renderPasswordResetEmail } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertStrongPassword, isSixDigitCode } from "./password-policy";
import { generateSixDigitCode, hashAuthCode, normalizeEmail } from "./tokens";
import { clearMustChangePassword, findUserIdByEmail, syncProfileEmail } from "./user-security";

type PasswordResetChallengeRow = {
  id: string;
  user_id: string | null;
  code_hash: string;
  attempts: number;
  expires_at: string;
};

export async function requestPasswordResetCode(input: { email: string; resetUrl: string }) {
  const email = normalizeEmail(input.email);
  const admin = createAdminClient();
  const userId = await findUserIdByEmail(email);

  if (!userId) {
    return { requested: true, delivered: false };
  }

  const code = generateSixDigitCode();
  const { error: insertError } = await admin.from("password_reset_challenges").insert({
    email,
    user_id: userId,
    code_hash: hashAuthCode(code, email)
  });

  if (insertError) {
    throw new Error(`Could not create password reset challenge: ${insertError.message}`);
  }

  const resetLink = appendQuery(input.resetUrl, { email });
  const template = renderPasswordResetEmail({ code, resetLink });
  const mail = await sendTransactionalEmail({
    ...template,
    relatedType: "password_reset_challenge",
    templateKey: "auth_password_reset",
    to: email,
  });

  return { requested: true, delivered: mail.delivered };
}

export async function confirmPasswordReset(input: { email: string; code: string; password: string; confirmPassword: string }) {
  const email = normalizeEmail(input.email);

  if (!isSixDigitCode(input.code)) {
    throw new Error("Gebruik de 6-cijferige code uit de e-mail.");
  }

  if (input.password !== input.confirmPassword) {
    throw new Error("De wachtwoorden komen niet overeen.");
  }

  assertStrongPassword(input.password, input.confirmPassword);

  const admin = createAdminClient();
  const challenge = await getLatestPendingChallenge(email);

  if (!challenge || new Date(challenge.expires_at).getTime() < Date.now()) {
    if (challenge) {
      await admin.from("password_reset_challenges").update({ status: "expired" }).eq("id", challenge.id);
    }

    throw new Error("Deze code is verlopen of ongeldig.");
  }

  const expectedHash = hashAuthCode(input.code, email);

  if (challenge.code_hash !== expectedHash) {
    const attempts = challenge.attempts + 1;
    await admin
      .from("password_reset_challenges")
      .update({
        attempts,
        status: attempts >= 5 ? "expired" : "pending"
      })
      .eq("id", challenge.id);

    throw new Error("Deze code is verlopen of ongeldig.");
  }

  const userId = challenge.user_id ?? (await findUserIdByEmail(email));

  if (!userId) {
    throw new Error("Deze code is verlopen of ongeldig.");
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: input.password
  });

  if (updateError) {
    throw new Error(`Could not update password: ${updateError.message}`);
  }

  const now = new Date().toISOString();
  const { error: consumeError } = await admin
    .from("password_reset_challenges")
    .update({
      status: "used",
      consumed_at: now
    })
    .eq("id", challenge.id);

  if (consumeError) {
    throw new Error(`Could not consume password reset challenge: ${consumeError.message}`);
  }

  await clearMustChangePassword(userId, email);
  await syncProfileEmail({ userId, email });
}

export async function changeAuthenticatedPassword(input: { userId: string; email: string | null; password: string; confirmPassword: string }) {
  if (input.password !== input.confirmPassword) {
    throw new Error("De wachtwoorden komen niet overeen.");
  }

  assertStrongPassword(input.password, input.confirmPassword);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(input.userId, {
    password: input.password
  });

  if (error) {
    throw new Error(`Could not update password: ${error.message}`);
  }

  await clearMustChangePassword(input.userId, input.email);
}

async function getLatestPendingChallenge(email: string): Promise<PasswordResetChallengeRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("password_reset_challenges")
    .select("id, user_id, code_hash, attempts, expires_at")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Could not read password reset challenge: ${error.message}`);
  }

  return (data?.[0] as PasswordResetChallengeRow | undefined) ?? null;
}

function appendQuery(url: string, params: Record<string, string>) {
  const parsed = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }

  return parsed.toString();
}
