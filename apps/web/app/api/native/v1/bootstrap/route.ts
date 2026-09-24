import {
  nativeJson,
  requireNativeApiContext,
  type NativeClientKind
} from "@/lib/auth/native-api";
import {
  buildInstructorNativeBootstrap,
  buildParentNativeBootstrap
} from "@/lib/domain/native-mobile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const client = readClient(request);
  if (!client) {
    return nativeJson({ error: "invalid_client" }, { status: 400 });
  }
  const guard = await requireNativeApiContext(request, client);
  if (!guard.ok) return guard.response;

  try {
    const bootstrap =
      client === "parent"
        ? await buildParentNativeBootstrap(guard.context)
        : await buildInstructorNativeBootstrap(guard.context);
    return nativeJson(bootstrap);
  } catch (error) {
    console.error("[native-api] Bootstrap failed", {
      client,
      tenantId: guard.context.activeTenant.tenantId,
      error: error instanceof Error ? error.message : "unexpected"
    });
    return nativeJson({ error: "bootstrap_unavailable" }, { status: 503 });
  }
}

function readClient(request: Request): NativeClientKind | null {
  const value = new URL(request.url).searchParams.get("client");
  return value === "parent" || value === "instructor" ? value : null;
}
