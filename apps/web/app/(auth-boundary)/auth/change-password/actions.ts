"use server";

import { redirect } from "next/navigation";

import { assessPasswordStrength } from "@/lib/auth/password-policy";
import { buildLoginPath, buildPath, sanitizeLocalPath } from "@/lib/auth/redirects";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function changePasswordAction(formData: FormData) {
  const nextPath = sanitizeLocalPath(formData.get("next"));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  let error: string | null = null;

  if (!password || !confirmPassword) {
    error = "missing";
  } else if (password !== confirmPassword) {
    error = "mismatch";
  } else if (!assessPasswordStrength(password).accepted) {
    error = "weak";
  } else {
    try {
      const supabase = await createClient();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError || !user) {
        redirect(buildLoginPath("/auth/change-password"));
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        error = "update_failed";
      } else {
        const admin = createAdminClient();
        const resolvedAt = new Date().toISOString();

        await admin.from("user_security_requirements").upsert(
          {
            user_id: user.id,
            must_change_password: false,
            reason: "none",
            resolved_at: resolvedAt
          },
          { onConflict: "user_id" }
        );

        await admin
          .from("tenant_super_admin_invitations")
          .update({
            status: "accepted",
            accepted_at: resolvedAt,
            metadata: { completed_password_change: true }
          })
          .eq("user_id", user.id)
          .eq("status", "sent");
      }
    } catch (cause) {
      if (isRedirectError(cause)) {
        throw cause;
      }

      error = "server_error";
    }
  }

  if (error) {
    redirect(buildPath("/auth/change-password", { next: nextPath, error }));
  }

  redirect(nextPath);
}

function isRedirectError(cause: unknown) {
  return typeof cause === "object" && cause !== null && "digest" in cause && String((cause as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT");
}
