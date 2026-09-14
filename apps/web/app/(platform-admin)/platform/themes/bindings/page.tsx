import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantThemeManagementMode } from "@/lib/theme/portal-theme-server";
import { validateThemeReleaseDocument } from "@/lib/theme/theme-release-validation";
import { ThemeWorldBindings } from "@/components/platform/theme-world-bindings";
import { redirect } from "next/navigation";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function ThemeBindingsPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const context = await requirePrivateShellContext("/platform/themes/bindings");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) redirect("/platform?error=forbidden");
  const admin = createAdminClient(), tenants = await admin.from("tenants").select("id, name").order("name");
  if (tenants.error) throw new Error("Organisaties niet beschikbaar");
  const params = await searchParams, tenant = (tenants.data ?? []).find((row) => row.id === params.tenant);
  let content = null;
  if (tenant) {
    const [programs, versions, stages, bindings, releases, mode] = await Promise.all([
      admin.from("programs").select("id, name").eq("tenant_id", tenant.id),
      admin.from("curriculum_versions").select("id, program_id, name, version_number").eq("tenant_id", tenant.id).eq("status", "published"),
      admin.from("curriculum_stages").select("id, name, curriculum_version_id").eq("tenant_id", tenant.id).order("sort_order"),
      admin.from("portal_theme_world_binding").select("id, program_id, curriculum_version_id, curriculum_stage_id, theme_key, theme_release, world_id, criterion_artwork_json, previous_binding_id").eq("tenant_id", tenant.id).is("deactivated_at", null),
      admin.from("portal_theme_release").select("manifest_json, presentation_json").eq("status", "published").not("presentation_json", "is", null),
      getTenantThemeManagementMode(tenant.id)
    ]);
    for (const result of [programs, versions, stages, bindings, releases]) if (result.error) throw new Error("Wereldkoppelingen niet beschikbaar");
    const choices = (stages.data ?? []).flatMap((stage) => {
      const version = versions.data?.find((row) => row.id === stage.curriculum_version_id), program = programs.data?.find((row) => row.id === version?.program_id);
      return version && program ? [{ id: stage.id, name: stage.name, programId: program.id, versionId: version.id, programName: program.name, versionName: `${version.name} (${version.version_number})` }] : [];
    });
    const worlds = (releases.data ?? []).flatMap((row) => {
      const { manifest, presentation } = validateThemeReleaseDocument(row.manifest_json, row.presentation_json);
      return Object.values(presentation.worlds).map((world) => ({ value: `${presentation.themeId}@${presentation.runtimeRelease}#${world.id}`, label: `${manifest.theme.displayName} ${presentation.runtimeRelease} · ${world.name}` }));
    });
    content = <ThemeWorldBindings key={tenant.id} tenantId={tenant.id} mode={mode} stages={choices} worlds={worlds} bindings={bindings.data ?? []} />;
  }
  return <div className="grid gap-5"><Link href="/platform/themes">← Themabibliotheek</Link><h1 className="text-2xl font-bold">Wereldkoppelingen</h1>
    <form className="flex flex-wrap gap-3"><label>Organisatie<select name="tenant" defaultValue={tenant?.id ?? ""} required className="ml-3 rounded-lg border p-3"><option value="">Kies een organisatie</option>{(tenants.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><button className="rounded-lg border p-3">Openen</button></form>{content}
  </div>;
}
