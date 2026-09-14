import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { getManagedThemeRelease, readThemeDelivery } from "@/lib/theme/theme-release-repository";
import { exportPresentationPackage } from "@/lib/theme/theme-presentation-package";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ themeKey: string; release: string }> }) {
  const guard = await requireApiAuthenticatedContext(request); if (!guard.ok) return guard.response;
  if (!guard.context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) return new Response(null, { status: 403 });
  const { themeKey, release } = await params, record = await getManagedThemeRelease(themeKey, release);
  if (!record || record.status !== "published") return new Response("Alleen gepubliceerde presentaties kunnen worden geëxporteerd.", { status: 409, headers: { "Cache-Control": "private, no-store" } });
  try {
    const bytes = await exportPresentationPackage(record, readThemeDelivery);
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${record.manifest.theme.key}-${record.manifest.theme.release}.zip"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response("Export onvolledig; er is geen pakket vrijgegeven.", { status: 503, headers: { "Cache-Control": "private, no-store" } }); }
}
