import "server-only";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { getActiveTenant } from "@/lib/domain/core";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuditExplorerRow = {
  id: string;
  actor: string;
  actorUserId: string | null;
  createdAt: string;
  event: string;
  outcome: "applied" | "completed" | "failed" | "informational" | "reverted";
  payload: Record<string, unknown>;
  searchText: string;
  source: string;
  subject: string;
  tenant: string;
};

export async function getPlatformAuditRows(): Promise<AuditExplorerRow[]> {
  const context = await requirePrivateShellContext("/platform/audit");
  if (!context.platform?.roles.some((role) => role === "platform_owner" || role === "platform_admin" || role === "platform_support")) return [];
  const admin = createAdminClient();
  const events = await admin.from("platform_admin_audit_events").select("id, tenant_id, actor_user_id, event_type, subject_type, subject_id, before_state, after_state, created_at").order("created_at", { ascending: false }).limit(750);
  if (events.error) throw new Error(`Could not load platform audit: ${events.error.message}`);
  const tenantIds = [...new Set((events.data ?? []).flatMap((row) => row.tenant_id ? [row.tenant_id] : []))];
  const actorIds = [...new Set((events.data ?? []).flatMap((row) => row.actor_user_id ? [row.actor_user_id] : []))];
  const [tenants, actors] = await Promise.all([
    tenantIds.length ? admin.from("tenants").select("id, name").in("id", tenantIds) : Promise.resolve({ data: [], error: null }),
    actorIds.length ? admin.from("profiles").select("id, full_name, email").in("id", actorIds) : Promise.resolve({ data: [], error: null })
  ]);
  const tenantNames = new Map((tenants.data ?? []).map((row) => [row.id, row.name]));
  const actorNames = new Map((actors.data ?? []).map((row) => [row.id, row.full_name || row.email || "Onbekende gebruiker"]));
  return (events.data ?? []).map((row) => {
    const actor = row.actor_user_id ? actorNames.get(row.actor_user_id) ?? "Verwijderde gebruiker" : "Systeem";
    const tenant = row.tenant_id ? tenantNames.get(row.tenant_id) ?? "Verwijderde organisatie" : "Platformbreed";
    return {
      id: row.id,
      actor,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
      event: row.event_type,
      outcome: row.event_type.includes("resolved") || row.event_type.includes("revoked") ? "completed" : "applied",
      payload: redactAuditPayload({ before: row.before_state, after: row.after_state }) as Record<string, unknown>,
      searchText: `${row.event_type} ${row.subject_type} ${actor} ${tenant}`.toLowerCase(),
      source: "control_plane",
      subject: `${row.subject_type}${row.subject_id ? ` · ${row.subject_id.slice(0, 8)}` : ""}`,
      tenant
    } satisfies AuditExplorerRow;
  });
}

export async function getTenantAuditRows(): Promise<AuditExplorerRow[]> {
  const context = await requirePrivateShellContext("/admin/audit");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) return [];
  const admin = createAdminClient();
  const [planning, placement, imports, automations, media, verification] = await Promise.all([
    admin.from("planning_change_events").select("id, changed_by_user_id, session_id, before_state, after_state, status, created_at, undone_by_user_id, undone_at").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(250),
    admin.from("placement_audit_events").select("id, actor_user_id, event_type, message, payload, created_at, waitlist_entry_id, slot_offer_id").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(250),
    admin.from("import_job_events").select("id, actor_user_id, event_type, details, created_at, import_job_id").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(150),
    admin.from("automation_recipe_runs").select("id, initiated_by_user_id, recipe_key, status, execution_mode, actions_taken_json, skipped_reason, error_code, created_at, trigger_entity_type, trigger_entity_id").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(150),
    admin.from("media_access_logs").select("id, viewer_profile_id, media_id, action, occurred_at, metadata_json").eq("tenant_id", tenant.id).order("occurred_at", { ascending: false }).limit(150),
    admin.from("certificate_verification_events").select("id, certificate_id, result, occurred_at, metadata_json").eq("tenant_id", tenant.id).order("occurred_at", { ascending: false }).limit(150)
  ]);
  for (const [source, result] of [["planning", planning], ["placement", placement], ["imports", imports], ["automations", automations], ["media", media], ["verification", verification]] as const) {
    if (result.error) throw new Error(`Could not load ${source} audit: ${result.error.message}`);
  }
  const actorIds = [...new Set([
    ...(planning.data ?? []).flatMap((row) => [row.changed_by_user_id, row.undone_by_user_id].filter(Boolean) as string[]),
    ...(placement.data ?? []).flatMap((row) => row.actor_user_id ? [row.actor_user_id] : []),
    ...(imports.data ?? []).flatMap((row) => row.actor_user_id ? [row.actor_user_id] : []),
    ...(automations.data ?? []).flatMap((row) => row.initiated_by_user_id ? [row.initiated_by_user_id] : []),
    ...(media.data ?? []).flatMap((row) => row.viewer_profile_id ? [row.viewer_profile_id] : [])
  ])];
  const profiles = actorIds.length ? await admin.from("profiles").select("id, full_name, email").in("id", actorIds) : { data: [], error: null };
  const actorNames = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name || row.email || "Onbekende gebruiker"]));
  const actor = (id: string | null) => id ? actorNames.get(id) ?? "Verwijderde gebruiker" : "Systeem";
  const rows: AuditExplorerRow[] = [];
  for (const row of planning.data ?? []) rows.push(makeRow({ id: row.id, actor: actor(row.changed_by_user_id), actorUserId: row.changed_by_user_id, createdAt: row.created_at, event: row.status === "undone" ? "planning.undone" : "planning.changed", outcome: row.status === "undone" ? "reverted" : "applied", payload: { before: row.before_state, after: row.after_state, undoneAt: row.undone_at }, source: "planning", subject: `Lesmoment · ${row.session_id.slice(0, 8)}`, tenant: tenant.name }));
  for (const row of placement.data ?? []) rows.push(makeRow({ id: row.id, actor: actor(row.actor_user_id), actorUserId: row.actor_user_id, createdAt: row.created_at, event: row.event_type, outcome: "applied", payload: { message: row.message, details: row.payload }, source: "placement", subject: row.slot_offer_id ? `Aanbod · ${row.slot_offer_id.slice(0, 8)}` : `Wachtlijst · ${row.waitlist_entry_id?.slice(0, 8) ?? "onbekend"}`, tenant: tenant.name }));
  for (const row of imports.data ?? []) rows.push(makeRow({ id: row.id, actor: actor(row.actor_user_id), actorUserId: row.actor_user_id, createdAt: row.created_at, event: `import.${row.event_type}`, outcome: row.event_type === "failed" ? "failed" : row.event_type === "rolled_back" ? "reverted" : "completed", payload: row.details, source: "import", subject: `Import · ${row.import_job_id.slice(0, 8)}`, tenant: tenant.name }));
  for (const row of automations.data ?? []) rows.push(makeRow({ id: row.id, actor: actor(row.initiated_by_user_id), actorUserId: row.initiated_by_user_id, createdAt: row.created_at, event: `automation.${row.recipe_key}`, outcome: row.status === "failed" ? "failed" : row.status === "completed" ? "completed" : "informational", payload: { actions: row.actions_taken_json, mode: row.execution_mode, skippedReason: row.skipped_reason, errorCode: row.error_code }, source: "automation", subject: `${row.trigger_entity_type ?? "Trigger"} · ${row.trigger_entity_id?.slice(0, 8) ?? "n.v.t."}`, tenant: tenant.name }));
  for (const row of media.data ?? []) rows.push(makeRow({ id: row.id, actor: actor(row.viewer_profile_id), actorUserId: row.viewer_profile_id, createdAt: row.occurred_at, event: `media.${row.action}`, outcome: row.action === "delete" ? "completed" : "informational", payload: row.metadata_json, source: "privacy_media", subject: `Media · ${row.media_id.slice(0, 8)}`, tenant: tenant.name }));
  for (const row of verification.data ?? []) rows.push(makeRow({ id: row.id, actor: "Openbare verificatie", actorUserId: null, createdAt: row.occurred_at, event: `diploma.verification_${row.result}`, outcome: "informational", payload: row.metadata_json, source: "diploma", subject: `Diploma · ${row.certificate_id.slice(0, 8)}`, tenant: tenant.name }));
  return rows.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 750);
}

function makeRow(input: Omit<AuditExplorerRow, "searchText" | "payload"> & { payload: unknown }): AuditExplorerRow {
  return {
    ...input,
    payload: redactAuditPayload(input.payload) as Record<string, unknown>,
    searchText: `${input.event} ${input.subject} ${input.actor} ${input.source}`.toLowerCase()
  };
}

function redactAuditPayload(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactAuditPayload(item, depth + 1));
  if (typeof value !== "object") return typeof value === "string" ? value.slice(0, 2000) : value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100).map(([key, item]) => [
    key,
    /(password|secret|token|api.?key|authorization|cookie)/i.test(key) ? "[AFGESCHERMD]" : redactAuditPayload(item, depth + 1)
  ]));
}
