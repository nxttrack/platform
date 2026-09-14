import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { getAnalyzedThemeImport } from "@/lib/theme/theme-release-repository";
import { themeContentHash, themeImportLimits } from "@/lib/theme/theme-package-archive";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
  const guard = await requireApiAuthenticatedContext(request); if (!guard.ok) return guard.response;
  if (!guard.context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) return new Response(null, { status: 403, headers });
  try {
    const { id } = await params, imported = await getAnalyzedThemeImport(id), hash = new URL(request.url).searchParams.get("hash");
    const image = imported?.analysis.kind === "guided" ? imported.analysis.images.find((row) => row.hash === hash) : null;
    if (!image || !/^[a-f0-9]{64}$/.test(image.hash)) return new Response(null, { status: 404, headers });
    const object = await createAdminClient().storage.from("portal-theme-imports").download(`${id}/preview/${image.hash}`);
    if (object.error || !object.data || object.data.size > themeImportLimits.file) return new Response(null, { status: 503, headers });
    const bytes = Buffer.from(await object.data.arrayBuffer()); if (themeContentHash(bytes) !== image.hash) return new Response(null, { status: 503, headers });
    return new Response(new Uint8Array(bytes), { headers: { ...headers, "Content-Type": image.mime } });
  } catch { return new Response(null, { status: 503, headers }); }
}
