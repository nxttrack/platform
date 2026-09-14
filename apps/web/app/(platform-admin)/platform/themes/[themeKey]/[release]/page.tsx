import { notFound } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagedThemeRelease, getThemeRevisionHistory } from "@/lib/theme/theme-release-repository";
import { ThemeReleaseEditor } from "@/components/platform/theme-release-editor";

export const dynamic = "force-dynamic";

export default async function ThemeReleasePage({ params }: { params: Promise<{ themeKey: string; release: string }> }) {
  const context = await requirePrivateShellContext("/platform/themes");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) notFound();
  const { themeKey, release } = await params, stored = await getManagedThemeRelease(themeKey, release);
  if (!stored) notFound();
  const versions = await createAdminClient().from("portal_theme_release").select("release, status, import_revision").eq("theme_key", themeKey).not("presentation_json", "is", null).order("created_at", { ascending: false });
  if (versions.error) throw new Error("Versiegeschiedenis niet beschikbaar");
  return <ThemeReleaseEditor key={`${themeKey}/${release}`} stored={stored} versions={versions.data ?? []} revisions={await getThemeRevisionHistory(stored)} />;
}
