import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalyzedThemeImport, getManagedThemeRelease, getPublishedThemeRelease, readThemeDelivery } from "@/lib/theme/theme-release-repository";
import { themeContentHash } from "@/lib/theme/theme-package-archive";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ themeKey: string; release: string; file: string }> }) {
  const { themeKey, release, file } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(themeKey) || !/^\d+\.\d+\.\d+$/.test(release) || !/^[a-f0-9]{64}\.(png|jpg|webp|avif)$/.test(file)) return unavailable(404);
  const preview = new URL(request.url).searchParams.get("preview") === "1";
  try {
    if (preview) {
      const guard = await requireApiAuthenticatedContext(request);
      if (!guard.ok) { guard.response.headers.set("Cache-Control", "private, no-store"); return guard.response; }
      if (!guard.context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) return unavailable(403);
    }
    const importId = preview ? new URL(request.url).searchParams.get("importId") : null;
    const imported = importId ? await getAnalyzedThemeImport(importId) : null;
    const record = importId ? imported?.analysis.kind === "draft" ? imported.analysis : null : preview ? await getManagedThemeRelease(themeKey, release) : await getPublishedThemeRelease(themeKey, release);
    const objectKey = `${themeKey}/${release}/${file}`;
    const asset = Object.values(record?.presentation?.assets ?? {}).find((entry) => entry.objectKey === objectKey);
    if (!asset) return unavailable(404);
    if (!imported) {
      const catalog = await createAdminClient().from("portal_theme_asset").select("content_hash").eq("theme_key", themeKey).eq("theme_release", release).eq("storage_object_key", objectKey).limit(1);
      if (catalog.error || !catalog.data?.length || catalog.data[0].content_hash !== asset.contentHash) return unavailable(404);
    }
    const bytes = await readThemeDelivery(objectKey);
    if (themeContentHash(bytes) !== asset.contentHash) return unavailable(503);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": asset.mime, "Content-Length": String(bytes.length), "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer",
      "Cache-Control": preview ? "private, no-store" : "public, max-age=31536000, immutable",
      ...(preview ? { Vary: "Cookie, Authorization" } : {})
    } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}

function unavailable(status: number) { return new Response(null, { status, headers: { "Cache-Control": "private, no-store" } }); }
