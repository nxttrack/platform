import { createClient } from "@/lib/supabase/server";

export type PasswordChangeRequirement = {
  required: boolean;
  reason: string | null;
};

export async function getPasswordChangeRequirementForCurrentUser(): Promise<PasswordChangeRequirement> {
  let supabase: Awaited<ReturnType<typeof createClient>>;

  try {
    supabase = await createClient();
  } catch {
    return { required: false, reason: null };
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { required: false, reason: null };
  }

  const { data, error } = await supabase
    .from("user_security_requirements")
    .select("must_change_password, reason")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return { required: false, reason: null };
  }

  return {
    required: Boolean(data.must_change_password),
    reason: typeof data.reason === "string" ? data.reason : null
  };
}
