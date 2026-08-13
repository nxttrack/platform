import { requireChildApiAuthenticatedContext, privateResponseHeaders } from "@/lib/auth/server-guard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireChildApiAuthenticatedContext(request);
  if (!guard.ok) return guard.response;
  return new Response(null, { status: 204, headers: privateResponseHeaders() });
}
