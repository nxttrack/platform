"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createInvitation } from "@/lib/auth/invitations";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { findUserIdByEmail } from "@/lib/auth/user-security";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { asImportType, getImportFields, importFieldsByType as fieldsByType, type ImportType } from "./import-contract";

type ImportRow = { id: string; row_number: number; source_data: Record<string, unknown>; validation_status: string };
type ManifestEntry = { table: string; id: string; rowId: string; email?: string };

export async function saveImportMappingAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin();
  const jobId = readRequired(formData, "jobId");
  const job = await getJob(tenant.id, jobId);
  assertStatus(job.status, ["mapping", "validated"]);
  const headers = Array.isArray(job.summary.headers) ? job.summary.headers.filter((value): value is string => typeof value === "string") : [];
  const mapping = Object.fromEntries(getImportFields(job.import_type).map((field) => {
    const header = readOptional(formData, `map_${field.key}`);
    if (header && !headers.includes(header)) throw new Error(`Unknown source header for ${field.key}`);
    return [field.key, header];
  }));
  const admin = createAdminClient();
  await requireWrite(admin.from("import_jobs").update({ mapping, status: "mapping" }).eq("tenant_id", tenant.id).eq("id", jobId), "mapping");
  await audit(tenant.id, jobId, userId, "mapping_saved", { mappedFields: Object.values(mapping).filter(Boolean).length });
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=mapping`);
}

export async function validateImportAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin();
  const jobId = readRequired(formData, "jobId");
  const job = await getJob(tenant.id, jobId);
  assertStatus(job.status, ["mapping", "validated", "ready"]);
  const rows = await getRows(tenant.id, jobId, true);
  const references = await loadReferences(tenant.id);
  const mappedRows = rows.map((row) => {
    const normalized = mapRow(row.source_data, job.mapping);
    return { normalized, recordType: resolveRecordType(job.import_type, normalized), row };
  });
  const pendingParticipants = mappedRows.filter((item) => item.recordType === "participants").map((item) => ({
    id: `pending-${item.row.id}`,
    display_name: stringValue(item.normalized.display_name),
    birth_date: nullable(item.normalized.birth_date),
    external_reference: nullable(item.normalized.external_reference),
    guardian_user_id: null
  }));
  const validationReferences = { ...references, participants: [...references.participants, ...pendingParticipants] };
  const seen = new Set<string>();
  let valid = 0;
  let invalid = 0;
  let duplicates = 0;
  const admin = createAdminClient();

  for (const { normalized, recordType, row } of mappedRows) {
    const errors = validateRow(recordType, normalized, validationReferences);
    const duplicateKey = buildDuplicateKey(recordType, normalized);
    const duplicate = duplicateKey ? seen.has(duplicateKey) || isExistingDuplicate(recordType, normalized, references) : false;
    if (duplicateKey) seen.add(duplicateKey);
    const status = errors.length ? "invalid" : duplicate ? "duplicate" : "valid";
    if (status === "valid") valid += 1;
    else if (status === "duplicate") duplicates += 1;
    else invalid += 1;
    await requireWrite(admin.from("import_rows").update({ normalized_data: { ...normalized, record_type: recordType }, validation_status: status, validation_errors: errors, duplicate_key: duplicateKey }).eq("tenant_id", tenant.id).eq("id", row.id), `row ${row.row_number}`);
  }

  const report = { checkedAt: new Date().toISOString(), valid, invalid, duplicates, total: rows.length };
  await requireWrite(admin.from("import_jobs").update({ status: "validated", valid_count: valid, invalid_count: invalid, duplicate_count: duplicates, validation_report: report }).eq("tenant_id", tenant.id).eq("id", jobId), "validation");
  await audit(tenant.id, jobId, userId, "validated", report);
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=validated`);
}

export async function dryRunImportAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin();
  const jobId = readRequired(formData, "jobId");
  const job = await getJob(tenant.id, jobId);
  assertStatus(job.status, ["validated", "ready"]);
  if (job.invalid_count > 0) redirect(`/admin/importeren?job=${jobId}&error=invalid_rows`);
  const rows = await getRows(tenant.id, jobId, true);
  const changes = rows.filter((row) => row.validation_status === "valid").reduce<Record<string, number>>((summary, row) => {
    const type = String((row as ImportRow & { normalized_data?: Record<string, unknown> }).normalized_data?.record_type ?? job.import_type);
    summary[type] = (summary[type] ?? 0) + 1;
    return summary;
  }, {});
  const report = { ...job.validation_report, dryRunAt: new Date().toISOString(), changes, duplicateStrategy: "skip", mutationStrategy: "create_only" };
  const admin = createAdminClient();
  await requireWrite(admin.from("import_jobs").update({ status: "ready", validation_report: report }).eq("tenant_id", tenant.id).eq("id", jobId), "dry run");
  await audit(tenant.id, jobId, userId, "dry_run", report);
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=dry_run`);
}

export async function applyImportAction(formData: FormData) {
  const context = await requirePrivateShellContext("/admin/importeren");
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect("/admin?error=forbidden");
  const jobId = readRequired(formData, "jobId");
  const job = await getJob(tenant.id, jobId);
  assertStatus(job.status, ["ready"]);
  const rows = await getRows(tenant.id, jobId, true);
  const ordered = [...rows].sort((a, b) => applyOrder(a.normalized_data.record_type) - applyOrder(b.normalized_data.record_type));
  const admin = createAdminClient();
  const manifest: ManifestEntry[] = [];
  await requireWrite(admin.from("import_jobs").update({ status: "applying", applied_by_user_id: context.user.id }).eq("tenant_id", tenant.id).eq("id", jobId), "apply start");

  try {
    for (const row of ordered) {
      if (row.validation_status !== "valid") continue;
      const entry = await applyRow({ context, data: row.normalized_data, rowId: row.id, tenantId: tenant.id, tenantSlug: tenant.slug });
      manifest.push(entry);
      await requireWrite(admin.from("import_rows").update({ validation_status: "applied", target_table: entry.table, target_id: entry.id }).eq("tenant_id", tenant.id).eq("id", row.id), "row apply");
    }
    const rollbackSignature = signManifest(tenant.id, jobId, manifest);
    await requireWrite(admin.from("import_jobs").update({ status: "completed", rollback_manifest: manifest, validation_report: { ...job.validation_report, rollbackSignature }, applied_at: new Date().toISOString() }).eq("tenant_id", tenant.id).eq("id", jobId), "apply complete");
    await audit(tenant.id, jobId, context.user.id, "applied", { created: manifest.length });
  } catch (error) {
    await rollbackManifest(tenant.id, manifest);
    await admin.from("import_jobs").update({ status: "failed", rollback_manifest: [], validation_report: { ...job.validation_report, applyError: error instanceof Error ? error.message : "unknown" } }).eq("tenant_id", tenant.id).eq("id", jobId);
    await audit(tenant.id, jobId, context.user.id, "failed", { error: error instanceof Error ? error.message : "unknown" });
    redirect(`/admin/importeren?job=${jobId}&error=apply`);
  }
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=applied`);
}

export async function rollbackImportAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin();
  const jobId = readRequired(formData, "jobId");
  const job = await getJob(tenant.id, jobId);
  assertStatus(job.status, ["completed"]);
  const manifest = Array.isArray(job.rollback_manifest) ? job.rollback_manifest as ManifestEntry[] : [];
  const signature = typeof job.validation_report.rollbackSignature === "string" ? job.validation_report.rollbackSignature : "";
  if (!verifyManifest(tenant.id, jobId, manifest, signature)) redirect(`/admin/importeren?job=${jobId}&error=rollback_signature`);
  await rollbackManifest(tenant.id, manifest);
  const admin = createAdminClient();
  await requireWrite(admin.from("import_rows").update({ validation_status: "rolled_back" }).eq("tenant_id", tenant.id).eq("import_job_id", jobId).eq("validation_status", "applied"), "rollback rows");
  await requireWrite(admin.from("import_jobs").update({ status: "rolled_back", rolled_back_by_user_id: userId, rolled_back_at: new Date().toISOString() }).eq("tenant_id", tenant.id).eq("id", jobId), "rollback job");
  await audit(tenant.id, jobId, userId, "rolled_back", { deleted: manifest.length });
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=rolled_back`);
}

async function applyRow(input: { context: Awaited<ReturnType<typeof requirePrivateShellContext>>; data: Record<string, unknown>; rowId: string; tenantId: string; tenantSlug: string }): Promise<ManifestEntry> {
  const admin = createAdminClient();
  const type = String(input.data.record_type);
  if (type === "participants") {
    const guardianEmail = nullable(input.data.guardian_email)?.toLowerCase() ?? null;
    const guardianUserId = guardianEmail ? await findUserIdByEmail(guardianEmail) : null;
    if (guardianEmail && !guardianUserId) throw new Error(`guardian not found: ${guardianEmail}`);
    const row = await insertOne(admin.from("participants").insert({ tenant_id: input.tenantId, guardian_user_id: guardianUserId, display_name: stringValue(input.data.display_name), birth_date: nullable(input.data.birth_date), external_reference: nullable(input.data.external_reference), status: "active" }).select("id").single(), "participant");
    return { table: "participants", id: row.id, rowId: input.rowId };
  }
  if (type === "guardians") {
    const email = stringValue(input.data.email).toLowerCase();
    await createInvitation({ actor: input.context, email, fullName: stringValue(input.data.full_name), acceptUrl: `${await getTrustedRequestOrigin()}/uitnodiging-accepteren`, role: "parent", tenantSlug: input.tenantSlug });
    const userId = await findUserIdByEmail(email);
    if (!userId) throw new Error("guardian user missing after invitation");
    return { table: "tenant_memberships", id: userId, rowId: input.rowId, email };
  }
  if (type === "groups") {
    const refs = await loadReferences(input.tenantId);
    const program = refs.programs.find((item) => item.code === stringValue(input.data.program_code));
    const stage = refs.stages.find((item) => item.code === nullable(input.data.stage_code));
    const resource = refs.resources.find((item) => item.code === nullable(input.data.resource_code));
    if (!program) throw new Error("program not found");
    const row = await insertOne(admin.from("groups").insert({ tenant_id: input.tenantId, program_id: program.id, stage_id: stage?.id ?? null, default_resource_id: resource?.id ?? null, name: stringValue(input.data.name), code: stringValue(input.data.code), status: "active", capacity: numberValue(input.data.capacity, 10), default_weekday: numberValue(input.data.weekday, 1), default_start_time: nullable(input.data.start_time), default_end_time: nullable(input.data.end_time) }).select("id").single(), "group");
    return { table: "groups", id: row.id, rowId: input.rowId };
  }
  if (type === "enrollments") {
    const refs = await loadReferences(input.tenantId);
    const participant = findParticipant(refs, stringValue(input.data.participant_reference));
    const program = refs.programs.find((item) => item.code === stringValue(input.data.program_code));
    const stage = refs.stages.find((item) => item.code === nullable(input.data.stage_code));
    if (!participant || !program) throw new Error("enrollment reference not found");
    const row = await insertOne(admin.from("enrollments").insert({ tenant_id: input.tenantId, participant_id: participant.id, guardian_user_id: participant.guardian_user_id, program_id: program.id, current_stage_id: stage?.id ?? null, status: "active", source: "import", starts_on: nullable(input.data.starts_on) ?? new Date().toISOString().slice(0, 10) }).select("id").single(), "enrollment");
    return { table: "enrollments", id: row.id, rowId: input.rowId };
  }
  if (type === "payments") {
    const refs = await loadReferences(input.tenantId);
    const participant = findParticipant(refs, stringValue(input.data.participant_reference));
    const subscription = participant ? refs.subscriptions.find((item) => item.participant_id === participant.id && item.status === "active") : null;
    const enrollment = participant ? refs.enrollments.find((item) => item.participant_id === participant.id && item.status === "active") : null;
    if (!participant || !subscription || !enrollment) throw new Error("active subscription reference not found");
    const status = ["due", "overdue", "paid", "waived", "cancelled"].includes(stringValue(input.data.status)) ? stringValue(input.data.status) : "due";
    const row = await insertOne(admin.from("manual_payments").insert({ tenant_id: input.tenantId, subscription_id: subscription.id, participant_id: participant.id, enrollment_id: enrollment.id, guardian_user_id: participant.guardian_user_id, amount_cents: Math.round(numberValue(input.data.amount_eur) * 100), currency: "EUR", due_on: stringValue(input.data.due_on), paid_on: status === "paid" ? new Date().toISOString().slice(0, 10) : null, status, method: "import", recorded_by_user_id: input.context.user.id }).select("id").single(), "payment");
    return { table: "manual_payments", id: row.id, rowId: input.rowId };
  }
  throw new Error(`unsupported record type: ${type}`);
}

async function rollbackManifest(tenantId: string, manifest: ManifestEntry[]) {
  const admin = createAdminClient();
  for (const entry of [...manifest].reverse()) {
    if (entry.table === "tenant_memberships") {
      await admin.from("tenant_memberships").delete().eq("tenant_id", tenantId).eq("user_id", entry.id).eq("role", "parent");
      await admin.from("auth_invitations").update({ status: "revoked" }).eq("tenant_id", tenantId).eq("invited_user_id", entry.id).eq("status", "pending");
    }
    else if (["manual_payments", "enrollments", "groups", "participants"].includes(entry.table)) await admin.from(entry.table).delete().eq("tenant_id", tenantId).eq("id", entry.id);
  }
}

async function loadReferences(tenantId: string) {
  const admin = createAdminClient();
  const [participants, programs, stages, resources, groups, memberships, enrollments, subscriptions] = await Promise.all([
    admin.from("participants").select("id, display_name, birth_date, external_reference, guardian_user_id").eq("tenant_id", tenantId),
    admin.from("programs").select("id, code").eq("tenant_id", tenantId),
    admin.from("program_stages").select("id, code").eq("tenant_id", tenantId),
    admin.from("resources").select("id, code").eq("tenant_id", tenantId),
    admin.from("groups").select("id, code").eq("tenant_id", tenantId),
    admin.from("tenant_memberships").select("user_id, invited_email, role").eq("tenant_id", tenantId),
    admin.from("enrollments").select("id, participant_id, status").eq("tenant_id", tenantId),
    admin.from("subscriptions").select("id, participant_id, status").eq("tenant_id", tenantId)
  ]);
  for (const result of [participants, programs, stages, resources, groups, memberships, enrollments, subscriptions]) if (result.error) throw new Error(`reference load: ${result.error.message}`);
  return { participants: participants.data ?? [], programs: programs.data ?? [], stages: stages.data ?? [], resources: resources.data ?? [], groups: groups.data ?? [], memberships: memberships.data ?? [], enrollments: enrollments.data ?? [], subscriptions: subscriptions.data ?? [] };
}

function validateRow(type: ImportType, data: Record<string, unknown>, refs: Awaited<ReturnType<typeof loadReferences>>) {
  const errors: string[] = [];
  if (type === "mixed") errors.push("Recordtype is onbekend");
  const required = fieldsByType[type === "mixed" ? "mixed" : type].filter((field) => field.required);
  for (const field of required) if (!nullable(data[field.key])) errors.push(`${field.label} ontbreekt`);
  if (type === "participants" && nullable(data.birth_date) && !isDate(stringValue(data.birth_date))) errors.push("Geboortedatum is ongeldig");
  if (type === "participants" && nullable(data.guardian_email) && !isEmail(stringValue(data.guardian_email))) errors.push("E-mail ouder is ongeldig");
  if (type === "guardians" && !isEmail(stringValue(data.email))) errors.push("E-mail is ongeldig");
  if (type === "groups" && !refs.programs.some((item) => item.code === stringValue(data.program_code))) errors.push("Programmacode bestaat niet");
  if (type === "enrollments") {
    if (!findParticipant(refs, stringValue(data.participant_reference))) errors.push("Leerlingreferentie bestaat niet");
    if (!refs.programs.some((item) => item.code === stringValue(data.program_code))) errors.push("Programmacode bestaat niet");
  }
  if (type === "payments") {
    const participant = findParticipant(refs, stringValue(data.participant_reference));
    if (!participant) errors.push("Leerlingreferentie bestaat niet");
    else if (!refs.subscriptions.some((item) => item.participant_id === participant.id && item.status === "active")) errors.push("Geen actief abonnement");
    if (numberValue(data.amount_eur) <= 0) errors.push("Bedrag moet positief zijn");
    if (!isDate(stringValue(data.due_on))) errors.push("Vervaldatum is ongeldig");
  }
  return errors;
}

function isExistingDuplicate(type: ImportType, data: Record<string, unknown>, refs: Awaited<ReturnType<typeof loadReferences>>) {
  if (type === "participants") return refs.participants.some((item) => nullable(data.external_reference) ? item.external_reference === nullable(data.external_reference) : normalize(item.display_name) === normalize(stringValue(data.display_name)) && item.birth_date === nullable(data.birth_date));
  if (type === "guardians") return refs.memberships.some((item) => normalize(item.invited_email ?? "") === normalize(stringValue(data.email)));
  if (type === "groups") return refs.groups.some((item) => item.code === stringValue(data.code));
  return false;
}
function buildDuplicateKey(type: ImportType, data: Record<string, unknown>) { if (type === "participants") return `p:${nullable(data.external_reference) ?? `${normalize(stringValue(data.display_name))}|${nullable(data.birth_date)}`}`; if (type === "guardians") return `o:${normalize(stringValue(data.email))}`; if (type === "groups") return `g:${normalize(stringValue(data.code))}`; if (type === "enrollments") return `e:${normalize(stringValue(data.participant_reference))}|${normalize(stringValue(data.program_code))}`; if (type === "payments") return `b:${normalize(stringValue(data.participant_reference))}|${stringValue(data.due_on)}|${stringValue(data.amount_eur)}`; return null; }
function resolveRecordType(jobType: ImportType, data: Record<string, unknown>): ImportType { if (jobType !== "mixed") return jobType; const raw = normalize(String(data.record_type ?? "")); const aliases: Record<string, ImportType> = { participant: "participants", participants: "participants", leerling: "participants", guardian: "guardians", guardians: "guardians", ouder: "guardians", group: "groups", groups: "groups", groep: "groups", enrollment: "enrollments", enrollments: "enrollments", inschrijving: "enrollments", payment: "payments", payments: "payments", betaling: "payments" }; return aliases[raw] ?? "mixed"; }
function mapRow(source: Record<string, unknown>, mapping: Record<string, unknown>) { return Object.fromEntries(Object.entries(mapping).map(([target, header]) => [target, typeof header === "string" ? String(source[header] ?? "").trim() : ""])); }
function findParticipant(refs: Awaited<ReturnType<typeof loadReferences>>, reference: string) { return refs.participants.find((item) => item.external_reference === reference || normalize(item.display_name) === normalize(reference)); }
function applyOrder(type: unknown) { return ({ guardians: 1, participants: 2, groups: 3, enrollments: 4, payments: 5 } as Record<string, number>)[String(type)] ?? 99; }

async function requireTenantAdmin() { const context = await requirePrivateShellContext("/admin/importeren"); const tenant = getActiveTenant(context); if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect("/admin?error=forbidden"); return { tenant, userId: context.user.id }; }
async function getJob(tenantId: string, jobId: string) { const { data, error } = await createAdminClient().from("import_jobs").select("id, import_type, status, mapping, summary, invalid_count, validation_report, rollback_manifest").eq("tenant_id", tenantId).eq("id", jobId).single(); if (error || !data) throw new Error(`job: ${error?.message ?? "missing"}`); return data as { id: string; import_type: ImportType; status: string; mapping: Record<string, unknown>; summary: Record<string, unknown>; invalid_count: number; validation_report: Record<string, unknown>; rollback_manifest: unknown }; }
async function getRows(tenantId: string, jobId: string, normalized = false) {
  const admin = createAdminClient();
  const result = normalized
    ? await admin.from("import_rows").select("id, row_number, source_data, normalized_data, validation_status").eq("tenant_id", tenantId).eq("import_job_id", jobId).order("row_number")
    : await admin.from("import_rows").select("id, row_number, source_data, validation_status").eq("tenant_id", tenantId).eq("import_job_id", jobId).order("row_number");
  if (result.error) throw new Error(`rows: ${result.error.message}`);
  return (result.data ?? []) as unknown as (ImportRow & { normalized_data: Record<string, unknown> })[];
}
async function audit(tenantId: string, jobId: string, actor: string, eventType: string, details: Record<string, unknown>) { await requireWrite(createAdminClient().from("import_job_events").insert({ tenant_id: tenantId, import_job_id: jobId, actor_user_id: actor, event_type: eventType, details }), "audit"); }
async function insertOne(operation: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>, label: string) { const result = await operation; if (result.error || !result.data) throw new Error(`${label}: ${result.error?.message ?? "missing"}`); return result.data; }
async function requireWrite(operation: PromiseLike<{ error: { message: string } | null }>, label: string) { const result = await operation; if (result.error) throw new Error(`${label}: ${result.error.message}`); }
function assertStatus(status: string, allowed: string[]) { if (!allowed.includes(status)) throw new Error(`Importstatus ${status} is not allowed`); }
function readRequired(formData: FormData, field: string) { const value = readOptional(formData, field); if (!value) throw new Error(`${field} is required`); return value; }
function readOptional(formData: FormData, field: string) { return String(formData.get(field) ?? "").trim() || null; }
function nullable(value: unknown) { const normalized = String(value ?? "").trim(); return normalized || null; }
function stringValue(value: unknown) { return String(value ?? "").trim(); }
function numberValue(value: unknown, fallback = 0) { const parsed = Number(String(value ?? "").replace(",", ".")); return Number.isFinite(parsed) ? parsed : fallback; }
function normalize(value: string) { return value.trim().toLocaleLowerCase("nl").replace(/\s+/g, " "); }
function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)); }
function isEmail(value: string) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value); }
function signManifest(tenantId: string, jobId: string, manifest: ManifestEntry[]) { const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET; if (!secret) throw new Error("Session secret is required for rollback signing"); return createHmac("sha256", secret).update(JSON.stringify({ tenantId, jobId, manifest })).digest("hex"); }
function verifyManifest(tenantId: string, jobId: string, manifest: ManifestEntry[], signature: string) { const expected = signManifest(tenantId, jobId, manifest); if (!/^[a-f0-9]{64}$/.test(signature)) return false; return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex")); }
