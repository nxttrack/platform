import {
  nativeJson,
  readNativeJsonBody
} from "@/lib/auth/native-api";
import {
  createNativeSessionClient,
  nativeSessionResponse,
  readNativeClientKind,
  readOptionalTenantId
} from "@/lib/auth/native-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readNativeJsonBody(request, 16 * 1024);
  const client = readNativeClientKind(body?.client);
  const refreshToken = typeof body?.refreshToken === "string"
    ? body.refreshToken.trim()
    : "";
  const activeTenantId = readOptionalTenantId(body?.activeTenantId);

  if (
    !client ||
    refreshToken.length < 20 ||
    refreshToken.length > 8192 ||
    /[\u0000-\u001f\u007f\s]/.test(refreshToken)
  ) {
    return nativeJson({ error: "invalid_refresh_token" }, { status: 400 });
  }

  const supabase = createNativeSessionClient();
  const result = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (result.error || !result.data.session) {
    return nativeJson({ error: "session_expired" }, { status: 401 });
  }
  return nativeSessionResponse({
    activeTenantId,
    client,
    session: result.data.session
  });
}
