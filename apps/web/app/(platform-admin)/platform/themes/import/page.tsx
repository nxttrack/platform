import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { ThemePackageImport } from "@/components/platform/theme-package-import";
import { ThemeImportHistory } from "@/components/platform/theme-import-history";

import { getAnalyzedThemeImport } from "@/lib/theme/theme-release-repository";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function ThemeImportPage({ searchParams }: { searchParams: Promise<{ import?: string }> }) {
  const context = await requirePrivateShellContext("/platform/themes");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) notFound();
  const params = await searchParams;
  const initial = params.import ? await getAnalyzedThemeImport(params.import) : null;
  const recent = await createAdminClient().from("portal_theme_import").select("id, source_name, status, created_at, retry_of").order("created_at", { ascending: false }).limit(40);
  if (recent.error) throw new Error("Importhistorie niet beschikbaar");
  return <div className="mx-auto max-w-5xl space-y-5"><Link href="/platform/themes" className="text-sm font-bold text-primary">← Themabibliotheek</Link><h1 className="text-3xl font-bold">Importeer een nieuwe zwemwereld</h1><p>Een pakket wordt eerst geanalyseerd en als concept bewaard. Publiceren en toewijzen zijn afzonderlijke stappen.</p><ThemePackageImport key={`${initial?.id}:${initial?.analysis.kind}`} initialResult={initial} /><ThemeImportHistory rows={recent.data??[]}/></div>;
}
