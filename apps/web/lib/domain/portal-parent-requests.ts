import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

export async function getParentPortalRequests() {
  const context = await requirePrivateShellContext("/portaal/inbox");
  const tenant = getActiveTenant(context);
  const admin = createAdminClient();
  const result = await admin
    .from("portal_parent_requests")
    .select("id, participant_id, request_type, status, created_at")
    .eq("tenant_id", tenant.id)
    .eq("guardian_user_id", context.user.id)
    .in("status", ["open", "acknowledged"])
    .order("created_at", { ascending: false })
    .limit(25);
  if (result.error) throw new Error("Ouderverzoeken konden niet veilig worden geladen");
  return result.data ?? [];
}
