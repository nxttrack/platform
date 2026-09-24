import { NextResponse } from "next/server";
import { requireApiAuthenticatedContext } from "@/lib/auth/server-guard";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { analyzeStoredThemeImport } from "@/lib/theme/theme-release-repository";
import { themeImportLimits } from "@/lib/theme/theme-package-archive";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (process.env.MAINTENANCE_NO_WRITE === "true") return NextResponse.json({ error: "Onderhoud: schrijven is tijdelijk uitgeschakeld." }, { status: 503, headers });
  if (request.headers.get("origin") !== await getTrustedRequestOrigin()) return NextResponse.json({ error: "Ongeldige aanvraagherkomst" }, { status: 403, headers });
  const guard = await requireApiAuthenticatedContext(request);
  if (!guard.ok) return guard.response;
  if (!guard.context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin")) return NextResponse.json({ error: "Platformbeheer vereist" }, { status: 403, headers });
  if (!request.body || Number(request.headers.get("content-length")) > themeImportLimits.archive) return NextResponse.json({ error: "Bestand is te groot" }, { status: 413, headers });
  try {
    const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        request.signal.throwIfAborted(); const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > themeImportLimits.archive) { await reader.cancel(); return NextResponse.json({ error: "Bestand is te groot" }, { status: 413, headers }); }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const name = decodeURIComponent(request.headers.get("x-theme-filename") ?? "");
    const version = request.headers.get("x-theme-release") || undefined;
    const result = await analyzeStoredThemeImport(guard.context.user.id, Buffer.concat(chunks), name, version, request.signal);
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 500) : "Import kon niet worden geanalyseerd" }, { status: 400, headers });
  }
}
