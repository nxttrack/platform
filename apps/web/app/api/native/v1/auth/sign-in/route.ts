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
  const email = typeof body?.email === "string"
    ? body.email.trim().toLocaleLowerCase("en-US")
    : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const activeTenantId = readOptionalTenantId(body?.activeTenantId);

  if (
    !client ||
    email.length < 3 ||
    email.length > 320 ||
    !email.includes("@") ||
    password.length < 8 ||
    password.length > 1024
  ) {
    return nativeJson({ error: "invalid_credentials" }, { status: 400 });
  }

  const supabase = createNativeSessionClient();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.session) {
    return nativeJson({ error: "invalid_credentials" }, { status: 401 });
  }
  return nativeSessionResponse({
    activeTenantId,
    client,
    session: result.data.session
  });
}
