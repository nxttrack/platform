"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const parentRoles = ["parent", "athlete"] as const;

export async function markNotificationReadAction(formData: FormData) {
  const { supabase, tenantId } = await requireParentContext();
  const notificationId = requiredString(formData, "notification_id");

  await throwOnError(
    supabase
      .from("parent_notifications")
      .update({
        status: "read",
        read_at: new Date().toISOString()
      })
      .eq("id", notificationId)
      .eq("tenant_id", tenantId)
  );

  revalidateParentPortal();
}

export async function requestCatchUpLessonAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireParentContext();

  await throwOnError(
    supabase.from("lesson_catch_up_requests").insert({
      tenant_id: tenantId,
      participant_id: requiredString(formData, "participant_id"),
      enrollment_id: requiredString(formData, "enrollment_id"),
      missed_session_id: requiredString(formData, "session_id"),
      requested_by_profile_id: profileId,
      preferred_time_windows: formData.getAll("preferred_time_windows").filter((value): value is string => typeof value === "string"),
      reason: optionalString(formData, "reason"),
      status: "requested"
    })
  );

  revalidateParentPortal();
}

async function requireParentContext() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canUseParentPortal = context.activeTenant.roles.some((role) => parentRoles.includes(role as (typeof parentRoles)[number]));

  if (!canUseParentPortal) {
    throw new Error("Je hebt geen ouderportaalrechten voor deze tenant.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

function revalidateParentPortal() {
  for (const path of ["/parent", "/parent/lessen", "/parent/notificaties", "/parent/documenten", "/parent/diplomas", "/parent/profiel"]) {
    revalidatePath(path);
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
