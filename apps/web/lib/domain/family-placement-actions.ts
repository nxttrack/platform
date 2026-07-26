"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { classifyContent } from "@/lib/security/content-classification";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { findFamilyPlacementOptions } from "./family-placement";

export async function createFamilyPlanningTaskAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/gezinnen");
  const tenant = getActiveTenant(context);
  const guardianId = readRequired(formData, "guardianId");
  const optionId = readRequired(formData, "optionId");
  const data = await findFamilyPlacementOptions({ tenantId: tenant.id, guardianId, participantIds: [] });
  const option = data.options.find((candidate) => candidate.family_option_id === optionId);
  if (!option || option.children_options.some((child) => child.isTest)) {
    redirect(`/admin/gezinnen/${guardianId}?error=task_not_allowed`);
  }
  const description = [
    `Beoordeel gezinsoptie voor ${data.guardian.name}.`,
    ...option.children_options.map((child) =>
      `${child.participantName}: ${child.groupName} op dag ${child.weekday} om ${child.startsAt.slice(0, 5)}.`
    ),
    `Tussenruimte: ${option.waiting_time_between_lessons ?? "niet op dezelfde dag"} minuten.`,
    `Score ${option.total_score}; confidence ${Math.round(option.confidence * 100)}%.`,
    option.blockers.length
      ? `Blockers:\n- ${option.blockers.map((blocker) => `${blocker.label}: ${blocker.evidence}`).join("\n- ")}`
      : "Geen harde blocker in de berekende combinatie.",
    "Controleer ieder kind afzonderlijk. Deze taak plaatst niemand en verstuurt niets."
  ].join("\n\n");
  const classification = classifyContent(
    { title: `Gezinsplanning beoordelen: ${data.guardian.name}`, description },
    "personal"
  );
  const result = await createAdminClient().from("tenant_tasks").insert({
    tenant_id: tenant.id,
    created_by_user_id: context.user.id,
    title: `Gezinsplanning beoordelen: ${data.guardian.name}`,
    description,
    priority: option.blockers.length ? "high" : "normal",
    status: "open",
    content_classification: classification.classification,
    classification_reasons: classification.reasons,
    is_test: false,
    journey_run_id: null
  });
  if (result.error) redirect(`/admin/gezinnen/${guardianId}?error=task`);
  revalidatePath("/admin/taken");
  revalidatePath(`/admin/gezinnen/${guardianId}`);
  redirect(`/admin/gezinnen/${guardianId}?saved=task`);
}

function readRequired(formData: FormData, field: string) {
  const value = formData.get(field);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}
