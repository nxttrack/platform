import "server-only";

import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export async function getCurriculumOverviewData() {
  const { tenant } = await requireCurriculumContext("/admin/programma");
  const admin = createAdminClient();
  const [versions, plans] = await Promise.all([
    admin
      .from("curriculum_versions")
      .select("id, program_id, version_number, name, status, formula_version, wizard_step, revision, source_version_id, published_at, created_at")
      .eq("tenant_id", tenant.id)
      .order("program_id")
      .order("version_number", { ascending: false }),
    admin
      .from("curriculum_migration_plans")
      .select("id, program_id, from_version_id, to_version_id, status, impact_json, reason, previewed_at, approved_at, executed_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
  ]);
  assertResult(versions.error, "curriculum versions");
  assertResult(plans.error, "curriculum migration plans");
  return {
    tenant,
    versions: versions.data ?? [],
    migrationPlans: plans.data ?? []
  };
}

export async function getCurriculumWizardData(versionId: string) {
  const { context, tenant } = await requireCurriculumContext(`/admin/programma/leerlijn/${versionId}`);
  const admin = createAdminClient();
  const versionResult = await admin
    .from("curriculum_versions")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", versionId)
    .maybeSingle();
  if (versionResult.error || !versionResult.data) redirect("/admin/programma?error=curriculum-not-found");
  const version = versionResult.data;
  const [program, stages, competencies, identities, items, links, rules, requirements, validations, revisions] = await Promise.all([
    admin.from("programs").select("id, name, code, status").eq("tenant_id", tenant.id).eq("id", version.program_id).maybeSingle(),
    admin.from("curriculum_stages").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("sort_order").order("name"),
    admin.from("curriculum_competencies").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("sort_order").order("name"),
    admin.from("curriculum_item_identities").select("id, stable_key").eq("tenant_id", tenant.id).eq("program_id", version.program_id),
    admin.from("curriculum_items").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("curriculum_stage_id").order("sort_order").order("name"),
    admin.from("curriculum_item_competencies").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id),
    admin.from("curriculum_transition_rules").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("sort_order"),
    admin.from("curriculum_graduation_requirements").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("sort_order"),
    admin.from("curriculum_publication_validations").select("*").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("validated_at", { ascending: false }).limit(10),
    admin.from("curriculum_draft_revisions").select("id, revision, wizard_step, saved_by_user_id, created_at").eq("tenant_id", tenant.id).eq("curriculum_version_id", version.id).order("revision", { ascending: false }).limit(20)
  ]);
  for (const [label, error] of [
    ["program", program.error],
    ["stages", stages.error],
    ["competencies", competencies.error],
    ["item identities", identities.error],
    ["items", items.error],
    ["item competency links", links.error],
    ["transition rules", rules.error],
    ["graduation requirements", requirements.error],
    ["publication validations", validations.error],
    ["draft revisions", revisions.error]
  ] as const) {
    assertResult(error, label);
  }
  if (!program.data) redirect("/admin/programma?error=program-not-found");

  return {
    canPublish: context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin") === true,
    competencies: competencies.data ?? [],
    identities: identities.data ?? [],
    itemCompetencies: links.data ?? [],
    items: items.data ?? [],
    program: program.data,
    requirements: requirements.data ?? [],
    revisions: revisions.data ?? [],
    rules: rules.data ?? [],
    stages: stages.data ?? [],
    tenant,
    validations: validations.data ?? [],
    version
  };
}

async function requireCurriculumContext(path: `/${string}`) {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  const canManage = context.activeTenant?.roles.some((role) =>
    ["tenant_owner", "tenant_admin", "tenant_staff", "coordinator"].includes(role)
  );
  if (!canManage) redirect("/admin?error=forbidden");
  return { context, tenant };
}

function assertResult(error: { message: string } | null, label: string) {
  if (error) throw new Error(`Unable to load ${label}: ${error.message}`);
}
