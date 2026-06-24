"use server";

import { redirect } from "next/navigation";

import { buildPath, sanitizeLocalPath } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(formData: FormData) {
  const nextPath = sanitizeLocalPath(formData.get("next"));
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(buildPath("/login", { next: nextPath, reason: "missing_credentials" }));
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;

  try {
    supabase = await createClient();
  } catch {
    redirect(buildPath("/login", { next: nextPath, reason: "not_configured" }));
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    redirect(buildPath("/login", { next: nextPath, reason: "invalid_credentials" }));
  }

  redirect(nextPath);
}
