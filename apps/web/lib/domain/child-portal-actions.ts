"use server";

import { createHash } from "node:crypto";
import { requireChildPortalSession } from "@/lib/auth/portal-session";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function saveChildPreferencesAction(formData: FormData) {
  const context = await requirePrivateShellContext("/kind/ik");
  const child = await requireChildPortalSession(context);
  const theme = readThemePreference(formData.get("themeRelease"));
  const result = await createAdminClient().rpc("save_child_portal_preferences_for_service", {
    p_celebrations_enabled: formData.get("celebrationsEnabled") === "on",
    p_participant_id: child.participantId,
    p_read_aloud_enabled: formData.get("readAloudEnabled") === "on",
    p_reduced_motion: formData.get("reducedMotion") === "on",
    p_session_id: child.sessionId,
    p_sound_enabled: formData.get("soundEnabled") === "on",
    p_tenant_id: child.tenantId,
    p_theme_key: theme?.key ?? null,
    p_theme_release: theme?.release ?? null,
    p_user_id: child.userId
  });
  if (result.error) throw new Error("Kindvoorkeuren konden niet veilig worden opgeslagen");
  revalidatePath("/kind", "layout");
  redirect("/kind/ik?tab=instellingen&voorkeuren=opgeslagen");
}

export async function createChildParentRequestAction(formData: FormData) {
  const context = await requirePrivateShellContext("/kind/ik");
  const child = await requireChildPortalSession(context);
  const requestType = formData.get("requestType");
  const resourceId = formData.get("resourceId");
  if (!isRequestType(requestType) || !isValidResource(requestType, resourceId)) {
    throw new Error("Ongeldig ouderverzoek");
  }
  const payload = requestType === "lesson_help"
    ? { lessonId: resourceId }
    : requestType === "activity_interest"
      ? { activityId: resourceId }
      : {};
  const idempotencyKey = createHash("sha256")
    .update(`${child.tenantId}:${child.participantId}:${requestType}:${resourceId ?? child.participantId}`)
    .digest("hex");
  const result = await createAdminClient().rpc("create_child_parent_request_for_service", {
    p_idempotency_key: idempotencyKey,
    p_participant_id: child.participantId,
    p_payload_json: payload,
    p_request_type: requestType,
    p_session_id: child.sessionId,
    p_tenant_id: child.tenantId,
    p_user_id: child.userId
  });
  if (result.error) {
    redirect(`/kind/ik?tab=instellingen&verzoek=${result.error.code === "P0001" ? "limiet" : "mislukt"}`);
  }
  redirect("/kind/ik?tab=instellingen&verzoek=verstuurd");
}

function isRequestType(value: unknown): value is "lesson_help" | "activity_interest" | "open_parent_portal" {
  return typeof value === "string" && ["lesson_help", "activity_interest", "open_parent_portal"].includes(value);
}

function isValidResource(
  requestType: "lesson_help" | "activity_interest" | "open_parent_portal",
  value: FormDataEntryValue | null
) {
  if (requestType === "open_parent_portal") return value === null || value === "";
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value);
}

function readThemePreference(value: FormDataEntryValue | null) {
  if (value === "tenant-default") return null;
  if (typeof value !== "string") throw new Error("Ongeldige themakeuze");
  const separator = value.lastIndexOf("@");
  const key = value.slice(0, separator);
  const release = value.slice(separator + 1);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key) || !/^\d+\.\d+\.\d+$/.test(release)) {
    throw new Error("Ongeldige themakeuze");
  }
  return { key, release };
}
