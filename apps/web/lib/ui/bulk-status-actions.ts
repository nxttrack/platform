"use server";

import { revalidatePath } from "next/cache";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";

type Resource = "documents" | "enrollments" | "groups" | "intake" | "tasks";

const resources: Record<Resource, { path: string; statuses: Set<string>; table: string }> = {
  documents: { path: "/admin/documenten", statuses: new Set(["active", "archived"]), table: "tenant_documents" },
  enrollments: { path: "/admin/leerlingen", statuses: new Set(["active", "paused", "completed", "cancelled"]), table: "enrollments" },
  groups: { path: "/admin/groepen", statuses: new Set(["planned", "active", "paused", "archived"]), table: "groups" },
  intake: { path: "/admin/intake", statuses: new Set(["received", "reviewing", "converted", "closed"]), table: "intake_submissions" },
  tasks: { path: "/admin/taken", statuses: new Set(["open", "in_progress", "done", "cancelled"]), table: "tenant_tasks" }
};

export async function applyBulkStatusAction(input: { ids: string[]; resource: Resource; status: string }) {
  const target = resources[input.resource];
  if (!target || !target.statuses.has(input.status)) return { error: "Ongeldige statusactie.", ok: false } as const;
  const ids = [...new Set(input.ids)].filter(isUuid).slice(0, 100);
  if (!ids.length) return { error: "Selecteer minimaal één geldige rij.", ok: false } as const;

  const context = await requirePrivateShellContext(target.path as `/${string}`);
  const tenantId = context.activeTenant?.tenantId;
  if (!tenantId) return { error: "Geen actieve organisatie.", ok: false } as const;
  const admin = createAdminClient();
  const beforeResult = input.resource === "tasks"
    ? await admin.from(target.table).select("id, status, completed_at").eq("tenant_id", tenantId).in("id", ids)
    : await admin.from(target.table).select("id, status").eq("tenant_id", tenantId).in("id", ids);
  const beforeRows = (beforeResult.data ?? []) as Array<{ completed_at?: string | null; id: string; status: string }>;
  if (beforeResult.error || !beforeRows.length) return { error: "De selectie kon niet worden geladen.", ok: false } as const;

  const update: Record<string, unknown> = { status: input.status };
  if (input.resource === "tasks") update.completed_at = input.status === "done" ? new Date().toISOString() : null;
  const updateResult = await admin.from(target.table).update(update).eq("tenant_id", tenantId).in("id", beforeRows.map((row) => row.id));
  if (updateResult.error) return { error: "De statuswijziging is niet gelukt.", ok: false } as const;

  const undoResult = await admin.from("ui_undo_operations").insert({
    operation_type: "bulk_status",
    payload: { before: beforeRows, resource: input.resource },
    tenant_id: tenantId,
    user_id: context.user.id
  }).select("id").single();
  if (undoResult.error || !undoResult.data) {
    for (const row of beforeRows) {
      const rollback: Record<string, unknown> = { status: row.status };
      if (input.resource === "tasks" && "completed_at" in row) rollback.completed_at = row.completed_at;
      await admin.from(target.table).update(rollback).eq("tenant_id", tenantId).eq("id", row.id);
    }
    return { error: "De wijziging is teruggedraaid omdat undo niet veilig kon worden voorbereid.", ok: false } as const;
  }
  revalidatePath(target.path);
  return { ok: true, undoToken: undoResult.data.id } as const;
}

export async function undoBulkStatusAction(token: string) {
  if (!isUuid(token)) return { error: "Ongeldige undo-code.", ok: false } as const;
  const context = await requirePrivateShellContext("/admin");
  const tenantId = context.activeTenant?.tenantId;
  if (!tenantId) return { error: "Geen actieve organisatie.", ok: false } as const;
  const admin = createAdminClient();
  const operationResult = await admin
    .from("ui_undo_operations")
    .select("id, payload, expires_at, consumed_at")
    .eq("id", token)
    .eq("tenant_id", tenantId)
    .eq("user_id", context.user.id)
    .maybeSingle();
  const operation = operationResult.data;
  if (!operation || operation.consumed_at || new Date(operation.expires_at).getTime() <= Date.now()) return { error: "Deze undo is verlopen of al gebruikt.", ok: false } as const;
  const payload = operation.payload as { before?: Array<{ completed_at?: string | null; id: string; status: string }>; resource?: Resource };
  const target = payload.resource ? resources[payload.resource] : null;
  if (!target || !Array.isArray(payload.before)) return { error: "De undo-informatie is onvolledig.", ok: false } as const;

  for (const row of payload.before) {
    if (!isUuid(row.id) || !target.statuses.has(row.status)) continue;
    const update: Record<string, unknown> = { status: row.status };
    if (payload.resource === "tasks") update.completed_at = row.completed_at ?? null;
    const result = await admin.from(target.table).update(update).eq("tenant_id", tenantId).eq("id", row.id);
    if (result.error) return { error: "Niet alle rijen konden worden hersteld.", ok: false } as const;
  }

  await admin.from("ui_undo_operations").update({ consumed_at: new Date().toISOString() }).eq("id", token).is("consumed_at", null);
  revalidatePath(target.path);
  return { ok: true } as const;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
