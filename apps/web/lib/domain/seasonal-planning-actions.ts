"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

const path = "/admin/seizoenen";

export async function createPlanningSeasonAction(formData: FormData) {
  const { context, tenant } = await requireAdmin();
  const startsOn = dateValue(formData, "startsOn");
  const endsOn = dateValue(formData, "endsOn");
  if (startsOn > endsOn) redirect(`${path}?error=period`);
  const result = await createAdminClient().from("planning_seasons").insert({ tenant_id: tenant.id, name: required(formData, "name", 120), starts_on: startsOn, ends_on: endsOn, status: formData.get("active") === "on" ? "active" : "draft", created_by_user_id: context.user.id });
  if (result.error) redirect(`${path}?error=season`);
  revalidatePath(path); redirect(`${path}?saved=season`);
}

export async function createSeasonBlackoutAction(formData: FormData) {
  const { context, tenant } = await requireAdmin();
  const seasonId = uuid(formData, "seasonId");
  const resourceId = optionalUuid(formData, "resourceId");
  const startsAt = dateTimeValue(formData, "startsAt");
  const endsAt = dateTimeValue(formData, "endsAt");
  if (startsAt >= endsAt) redirect(`${path}?error=period`);
  const admin = createAdminClient();
  const season = await admin.from("planning_seasons").select("id").eq("tenant_id", tenant.id).eq("id", seasonId).maybeSingle();
  if (!season.data) redirect(`${path}?error=season`);
  const result = await admin.from("season_blackout_periods").insert({ tenant_id: tenant.id, season_id: seasonId, resource_id: resourceId, name: required(formData, "name", 120), starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), session_handling: enumValue(formData, "sessionHandling", ["review", "cancel"] as const), status: "draft", reason: optional(formData, "reason", 1000), created_by_user_id: context.user.id });
  if (result.error) redirect(`${path}?error=blackout`);
  revalidatePath(path); redirect(`${path}?saved=blackout`);
}

export async function publishSeasonBlackoutAction(formData: FormData) {
  const { context, tenant } = await requireAdmin();
  if (formData.get("humanConfirmation") !== "publish") redirect(`${path}?error=confirmation`);
  const result = await createAdminClient().rpc("publish_season_blackout", { target_tenant_id: tenant.id, target_blackout_id: uuid(formData, "blackoutId"), target_actor_user_id: context.user.id });
  if (result.error) redirect(`${path}?error=publish`);
  revalidatePath(path); revalidatePath("/admin/agenda"); redirect(`${path}?saved=published&changed=${Number(result.data ?? 0)}`);
}

export async function undoSeasonBlackoutAction(formData: FormData) {
  const { context, tenant } = await requireAdmin();
  if (formData.get("humanConfirmation") !== "undo") redirect(`${path}?error=confirmation`);
  const result = await createAdminClient().rpc("undo_season_blackout", { target_tenant_id: tenant.id, target_blackout_id: uuid(formData, "blackoutId"), target_actor_user_id: context.user.id });
  if (result.error) redirect(`${path}?error=undo`);
  revalidatePath(path); revalidatePath("/admin/agenda"); redirect(`${path}?saved=undone&changed=${Number(result.data ?? 0)}`);
}

async function requireAdmin() { const context = await requirePrivateShellContext(path); const tenant = getActiveTenant(context); if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect(`${path}?error=forbidden`); return { context, tenant }; }
function required(formData: FormData, name: string, max: number) { const value = String(formData.get(name) ?? "").trim().slice(0, max); if (!value) throw new Error(`${name} is required`); return value; }
function optional(formData: FormData, name: string, max: number) { return String(formData.get(name) ?? "").trim().slice(0, max) || null; }
function uuid(formData: FormData, name: string) { const value = String(formData.get(name) ?? ""); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`${name} invalid`); return value; }
function optionalUuid(formData: FormData, name: string) { const value = String(formData.get(name) ?? ""); return value ? uuid(formData, name) : null; }
function enumValue<T extends string>(formData: FormData, name: string, values: readonly T[]) { const value = String(formData.get(name) ?? ""); if (!values.includes(value as T)) throw new Error(`${name} invalid`); return value as T; }
function dateValue(formData: FormData, name: string) { const value = String(formData.get(name) ?? ""); if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} invalid`); return value; }
function dateTimeValue(formData: FormData, name: string) { const value = new Date(String(formData.get(name) ?? "")); if (Number.isNaN(value.getTime())) throw new Error(`${name} invalid`); return value; }
