import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagedThemeRelease, readThemeDelivery } from "@/lib/theme/theme-release-repository";
import { inspectThemeRaster } from "@/lib/theme/theme-raster";
import { themeContentHash, themeImportLimits } from "@/lib/theme/theme-package-archive";
import { NextResponse } from "next/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request, { params }: { params: Promise<{ themeKey: string; release: string }> }) {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.MAINTENANCE_NO_WRITE === "true") return NextResponse.json({ error: "Schrijven is tijdelijk uitgeschakeld wegens onderhoud" }, { status: 503, headers });
  if (request.headers.get("origin") !== await getTrustedRequestOrigin()) return NextResponse.json({ error: "Ongeldige aanvraagherkomst" }, { status: 403, headers });
  const guard = await requireApiAuthenticatedContext(request); if (!guard.ok) return guard.response;
  if (!guard.context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) return NextResponse.json({ error: "Platformbeheer vereist" }, { status: 403, headers });
  try {
    const { themeKey, release } = await params, stored = await getManagedThemeRelease(themeKey, release);
    if (!stored || stored.status === "published" || String(stored.revision) !== request.headers.get("x-theme-revision") || stored.digest !== request.headers.get("x-theme-digest")) return NextResponse.json({ error: "Deze versie is gewijzigd of gepubliceerd. Open de actuele conceptversie." }, { status: 409, headers });
    if (!request.body || Number(request.headers.get("content-length")) > themeImportLimits.file) throw new Error("Kies één rasterafbeelding van maximaal 20 MiB");
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        request.signal.throwIfAborted(); const next = await reader.read(); if (next.done) break;
        size += next.value.length; if (size > themeImportLimits.file) { await reader.cancel(); throw new Error("De afbeelding is te groot"); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const name = decodeURIComponent(request.headers.get("x-theme-filename") ?? "");
    if (!/^[a-zA-Z0-9_. -]+\.(png|webp|avif|jpe?g)$/i.test(name)) throw new Error("Gebruik een PNG, WebP, AVIF of JPEG met een eenvoudige bestandsnaam");
    const bytes = Buffer.concat(chunks), meta = await inspectThemeRaster(bytes, `uploads/${name}`);
    const extension = meta.mime === "image/jpeg" ? "jpg" : meta.mime.split("/")[1], objectKey = `${themeKey}/${release}/${meta.contentHash}.${extension}`;
    request.signal.throwIfAborted();
    const uploaded = await createAdminClient().storage.from("portal-theme-assets").upload(objectKey, bytes, { contentType: meta.mime, upsert: false });
    if (uploaded.error && themeContentHash(await readThemeDelivery(objectKey)) !== meta.contentHash) throw new Error("De afbeelding kon niet veilig worden opgeslagen");
    // Unreferenced bytes stay private. Only an atomic draft save adds them to its asset catalog.
    return NextResponse.json({ asset: { ...meta, objectKey } }, { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 300) : "Upload niet afgerond" }, { status: 400, headers }); }
}
