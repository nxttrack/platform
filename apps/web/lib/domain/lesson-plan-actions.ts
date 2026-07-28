"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getFormNextPath, requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { calculateLessonPlanForSession } from "./lesson-plans";

export async function generateLessonPlanAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/lesplannen");
  const { context, tenant, sessionId } = await requireLessonPlanSession(formData, nextPath);
  if (formData.get("humanConfirmation") !== "generate") redirect(`${nextPath}?error=confirmation`);
  let calculated: Awaited<ReturnType<typeof calculateLessonPlanForSession>>;
  try {
    calculated = await calculateLessonPlanForSession(tenant.id, sessionId);
  } catch {
    redirect(`${nextPath}?error=generate`);
  }
  const result = await createAdminClient().rpc("save_lesson_plan_proposal", {
    p_tenant_id: tenant.id,
    p_session_id: sessionId,
    p_group_id: calculated.groupId,
    p_proposal_json: calculated.proposal,
    p_source_data_json: calculated.proposal.sourceData,
    p_confidence: calculated.proposal.confidence,
    p_reasons_json: calculated.proposal.reasons,
    p_actor_user_id: context.user.id,
    p_is_test: calculated.isTest,
    p_journey_run_id: calculated.journeyRunId
  });
  if (result.error) redirect(`${nextPath}?error=save`);
  refreshLessonPlans(sessionId);
  redirect(withFeedback(nextPath, "saved", "generated"));
}

export async function approveLessonPlanAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/lesplannen");
  const { context, tenant, sessionId } = await requireLessonPlanSession(formData, nextPath);
  if (formData.get("humanConfirmation") !== "approve") redirect(`${nextPath}?error=confirmation`);
  const versionId = readUuid(formData, "versionId");
  const admin = createAdminClient();
  const result = await admin.from("lesson_plans").update({
    status: "approved",
    approved_by_user_id: context.user.id,
    approved_at: new Date().toISOString()
  }).eq("tenant_id", tenant.id).eq("session_id", sessionId).eq("current_version_id", versionId).eq("status", "draft").select("id").maybeSingle();
  if (result.error || !result.data) redirect(`${nextPath}?error=stale`);
  await admin.from("lesson_plan_events").insert({
    tenant_id: tenant.id,
    lesson_plan_id: result.data.id,
    version_id: versionId,
    event_type: "approved",
    actor_user_id: context.user.id,
    message: "Lesplan na menselijke controle goedgekeurd."
  });
  refreshLessonPlans(sessionId);
  redirect(withFeedback(nextPath, "saved", "approved"));
}

export async function evaluateLessonPlanAction(formData: FormData) {
  const nextPath = getFormNextPath(formData, "/admin/lesplannen");
  const { context, tenant, sessionId } = await requireLessonPlanSession(formData, nextPath);
  if (formData.get("humanConfirmation") !== "evaluate") redirect(`${nextPath}?error=confirmation`);
  const outcome = readEnum(formData, "outcome", ["behaald", "deels_behaald", "aanpassen"] as const, "deels_behaald");
  const evaluation = {
    outcome,
    workedWell: readRequired(formData, "workedWell", 600),
    nextAdjustment: readRequired(formData, "nextAdjustment", 600),
    observationNote: readOptional(formData, "observationNote", 600)
  };
  const admin = createAdminClient();
  const result = await admin.from("lesson_plans").update({
    status: "completed",
    evaluation_json: evaluation,
    evaluated_by_user_id: context.user.id,
    evaluated_at: new Date().toISOString()
  }).eq("tenant_id", tenant.id).eq("session_id", sessionId).eq("status", "approved").select("id, current_version_id").maybeSingle();
  if (result.error || !result.data) redirect(`${nextPath}?error=state`);
  await admin.from("lesson_plan_events").insert({
    tenant_id: tenant.id,
    lesson_plan_id: result.data.id,
    version_id: result.data.current_version_id,
    event_type: "evaluated",
    actor_user_id: context.user.id,
    message: `Lesevaluatie vastgelegd: ${outcome.replaceAll("_", " ")}.`
  });
  refreshLessonPlans(sessionId);
  redirect(withFeedback(nextPath, "saved", "evaluated"));
}

async function requireLessonPlanSession(formData: FormData, nextPath: `/${string}`) {
  const context = await requirePrivateShellContext(nextPath);
  const tenant = getActiveTenant(context);
  const sessionId = readUuid(formData, "sessionId");
  const canManage = context.activeTenant?.roles.some((role) => ["tenant_owner", "tenant_admin", "tenant_staff"].includes(role)) ?? false;
  if (!canManage) {
    const admin = createAdminClient();
    const session = await admin.from("sessions").select("group_id").eq("tenant_id", tenant.id).eq("id", sessionId).maybeSingle();
    if (session.error || !session.data) redirect(`${nextPath}?error=access`);
    const [groupAccess, sessionAccess] = await Promise.all([
      admin.from("group_instructor_assignments").select("id").eq("tenant_id", tenant.id).eq("group_id", session.data.group_id).eq("instructor_user_id", context.user.id).eq("status", "active").limit(1).maybeSingle(),
      admin.from("session_instructor_assignments").select("id").eq("tenant_id", tenant.id).eq("session_id", sessionId).eq("instructor_user_id", context.user.id).eq("status", "active").limit(1).maybeSingle()
    ]);
    if (!groupAccess.data && !sessionAccess.data) redirect(`${nextPath}?error=access`);
  }
  return { context, tenant, sessionId };
}

function refreshLessonPlans(sessionId: string) {
  for (const path of ["/admin/lesplannen", "/instructor/lesplannen"]) revalidatePath(path);
}

function withFeedback(path: string, key: string, value: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;
}

function readUuid(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(value)) throw new Error(`${key} is invalid`);
  return value;
}

function readRequired(formData: FormData, key: string, maxLength: number) {
  const value = readOptional(formData, key, maxLength);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function readOptional(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value.slice(0, maxLength) : "";
}

function readEnum<T extends string>(formData: FormData, key: string, values: readonly T[], fallback: T): T {
  const value = String(formData.get(key) ?? "");
  return values.includes(value as T) ? value as T : fallback;
}
