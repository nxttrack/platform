import {
  nativeJson,
  readNativeJsonBody,
  requireNativeApiContext
} from "@/lib/auth/native-api";
import { readNativeClientKind } from "@/lib/auth/native-session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await readNativeJsonBody(request, 4 * 1024);
  const client = readNativeClientKind(body?.client);
  if (!client) return nativeJson({ error: "invalid_client" }, { status: 400 });
  const guard = await requireNativeApiContext(request, client);
  if (!guard.ok) return guard.response;

  const result = await createAdminClient().auth.admin.signOut(
    guard.accessToken,
    "global"
  );
  if (result.error) {
    return nativeJson({ error: "sign_out_failed" }, { status: 503 });
  }
  return nativeJson({ signedOut: true });
}
