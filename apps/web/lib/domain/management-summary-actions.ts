"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { generateManagementSummaryDraft } from "@/lib/domain/management-summaries";
import { createAdminClient } from "@/lib/supabase/admin";

const path = "/admin/rapportages/groei";
export async function generateManagementSummaryAction() {
  const { context, tenant } = await requireAdmin();
  try { await generateManagementSummaryDraft({ tenantId: tenant.id, userId: context.user.id }); }
  catch { redirect(`${path}?error=generate`); }
  revalidatePath(path); redirect(`${path}?saved=draft`);
}
export async function approveManagementSummaryAction(formData: FormData) {
  const { context, tenant } = await requireAdmin();
  if (formData.get("humanConfirmation") !== "approve") redirect(`${path}?error=confirmation`);
  const id = uuid(formData, "summaryId");
  const result = await createAdminClient().from("management_summary_drafts").update({ status: "approved", approved_by_user_id: context.user.id, approved_at: new Date().toISOString() }).eq("tenant_id", tenant.id).eq("id", id).eq("status", "draft");
  if (result.error) redirect(`${path}?error=approve`);
  revalidatePath(path); redirect(`${path}?saved=approved`);
}
async function requireAdmin() { const context = await requirePrivateShellContext(path); const tenant = getActiveTenant(context); if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect(`${path}?error=forbidden`); return { context, tenant }; }
function uuid(formData: FormData, name: string) { const value = String(formData.get(name) ?? ""); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} invalid`); return value; }
