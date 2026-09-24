import { notFound } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getAnalyzedThemeImport, getManagedThemeRelease } from "@/lib/theme/theme-release-repository";
import { presentationAssetUrl } from "@/lib/theme/portal-journey-presentation";
import { ThemeJourneyPreview } from "@/components/platform/theme-journey-preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Afgeschermde themapreview", robots: { index: false, follow: false } };

export default async function ThemePreviewPage({ params }: { params: Promise<{ themeKey: string; release: string }> }) {
  const context = await requirePrivateShellContext("/platform/themes");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) notFound();
  const { themeKey, release } = await params;
  const imported = themeKey === "import" ? await getAnalyzedThemeImport(release) : null;
  const stored = themeKey === "import" ? imported?.analysis.kind === "draft" ? imported.analysis : null : await getManagedThemeRelease(themeKey, release);
  if (!stored) notFound();
  const urls = Object.fromEntries(Object.entries(stored.presentation.assets).map(([id, asset]) => [id, `${presentationAssetUrl(asset)}?preview=1${imported ? `&importId=${imported.id}` : ""}`]));
  return <ThemeJourneyPreview presentation={stored.presentation} assetUrls={urls} />;
}
