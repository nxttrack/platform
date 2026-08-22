"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureInvitationAuthUser } from "@/lib/auth/invitations";
import { generateInvitationCode, hashAuthCode } from "@/lib/auth/tokens";
import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { renderInvitationEmail } from "@/lib/email/templates";
import { getTrustedRequestOrigin } from "@/lib/http/trusted-request-origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";
import { asImportType, getImportFields, importFieldsByType as fieldsByType, type ImportType } from "./import-contract";

type ImportRow = { id: string; row_number: number; source_data: Record<string, unknown>; validation_status: string };
type ImportCommand = { rowId: string; invitation?: Record<string, unknown> };

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

  const validationUpdates = mappedRows.map(({ normalized, recordType, row }) => {
    const errors = validateRow(recordType, normalized, validationReferences);
    const duplicateKey = buildDuplicateKey(recordType, normalized);
    const duplicate = duplicateKey ? seen.has(duplicateKey) || isExistingDuplicate(recordType, normalized, references) : false;
    if (duplicateKey) seen.add(duplicateKey);
    const status = errors.length ? "invalid" : duplicate ? "duplicate" : "valid";
    if (status === "valid") valid += 1;
    else if (status === "duplicate") duplicates += 1;
    else invalid += 1;
    return { rowId: row.id, normalizedData: { ...normalized, record_type: recordType }, status, errors, duplicateKey };
  });

  for (let index = 0; index < validationUpdates.length; index += 250) {
    const result = await admin.rpc("update_import_validation_chunk", {
      target_actor_user_id: userId,
      target_tenant_id: tenant.id,
      target_job_id: jobId,
      target_updates: validationUpdates.slice(index, index + 250)
    });
    if (result.error || result.data !== Math.min(250, validationUpdates.length - index)) {
      throw new Error(`validation chunk ${Math.floor(index / 250) + 1} failed`);
    }
  }

  const report = { checkedAt: new Date().toISOString(), valid, invalid, duplicates, total: rows.length };
  const completed = await admin.rpc("complete_import_validation", {
    target_actor_user_id: userId,
    target_tenant_id: tenant.id,
    target_job_id: jobId,
    target_report: report
  });
  if (completed.error) throw new Error("validation completion failed");
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
  const admin = createAdminClient();
  const idempotencyKey = createHash("sha256").update(`import-apply:v1:${tenant.id}:${jobId}`).digest("hex");
  const claim = await admin.rpc("claim_import_apply", {
    target_actor_user_id: context.user.id,
    target_tenant_id: tenant.id,
    target_job_id: jobId,
    target_idempotency_key: idempotencyKey,
    target_lease_seconds: 300
  });
  if (claim.error) redirect(`/admin/importeren?job=${jobId}&error=apply_claim`);
  const claimResult = claim.data as { outcome?: string; claimToken?: string } | null;
  if (claimResult?.outcome === "completed") redirect(`/admin/importeren?job=${jobId}&saved=applied`);
  if (claimResult?.outcome === "busy" || !claimResult?.claimToken) redirect(`/admin/importeren?job=${jobId}&error=apply_busy`);

  if (!(await materializePendingImportGuardians({ actorUserId: context.user.id, jobId, tenantId: tenant.id }))) {
    redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);
  }

  const rows = (await getRows(tenant.id, jobId, true))
    .filter((row) => row.validation_status === "valid")
    .sort((left, right) => applyOrder(left.normalized_data.record_type) - applyOrder(right.normalized_data.record_type) || left.row_number - right.row_number);
  const origin = await getTrustedRequestOrigin();
  for (const recordType of ["guardians", "participants", "groups", "enrollments", "payments"]) {
    const typeRows = rows.filter((row) => row.normalized_data.record_type === recordType);
    for (let index = 0; index < typeRows.length; index += 250) {
      const commands = typeRows.slice(index, index + 250).map((row) => buildImportCommand({
        origin,
        row,
        tenantName: tenant.name,
        tenantSlug: tenant.slug
      }));
      const chunk = await admin.rpc("apply_import_chunk", {
        target_actor_user_id: context.user.id,
        target_tenant_id: tenant.id,
        target_job_id: jobId,
        target_claim_token: claimResult.claimToken,
        target_rows: commands
      });
      const chunkResult = chunk.data as { outcome?: string } | null;
      if (chunk.error || chunkResult?.outcome !== "applied") {
        redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);
      }
      if (recordType === "guardians" && !(await materializePendingImportGuardians({ actorUserId: context.user.id, jobId, tenantId: tenant.id }))) {
        redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);
      }
    }
  }

  const completed = await admin.rpc("complete_import_apply", {
    target_actor_user_id: context.user.id,
    target_tenant_id: tenant.id,
    target_job_id: jobId,
    target_claim_token: claimResult.claimToken
  });
  if (completed.error || (completed.data as { outcome?: string } | null)?.outcome !== "completed") {
    redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);
  }
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=applied`);
}

export async function rollbackImportAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin();
  const jobId = readRequired(formData, "jobId");
  const admin = createAdminClient();
  const claim = await admin.rpc("claim_import_rollback", {
    target_actor_user_id: userId,
    target_tenant_id: tenant.id,
    target_job_id: jobId,
    target_lease_seconds: 300
  });
  if (claim.error) redirect(`/admin/importeren?job=${jobId}&error=rollback_claim`);
  const claimResult = claim.data as { outcome?: string; claimToken?: string } | null;
  if (claimResult?.outcome === "completed") redirect(`/admin/importeren?job=${jobId}&saved=rolled_back`);
  if (claimResult?.outcome === "busy" || !claimResult?.claimToken) redirect(`/admin/importeren?job=${jobId}&error=rollback_busy`);

  let done = false;
  for (let chunkIndex = 0; chunkIndex < 1000 && !done; chunkIndex += 1) {
    const chunk = await admin.rpc("rollback_import_chunk", {
      target_actor_user_id: userId,
      target_tenant_id: tenant.id,
      target_job_id: jobId,
      target_claim_token: claimResult.claimToken,
      target_limit: 250
    });
    const chunkResult = chunk.data as { done?: boolean; outcome?: string } | null;
    if (chunk.error || chunkResult?.outcome !== "compensated") {
      redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);
    }
    done = chunkResult.done === true;
  }
  if (!done) redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);

  const completed = await admin.rpc("complete_import_rollback", {
    target_actor_user_id: userId,
    target_tenant_id: tenant.id,
    target_job_id: jobId,
    target_claim_token: claimResult.claimToken
  });
  if (completed.error || (completed.data as { outcome?: string } | null)?.outcome !== "rolled_back") {
    redirect(`/admin/importeren?job=${jobId}&error=reconciliation`);
  }
  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?job=${jobId}&saved=rolled_back`);
}

function buildImportCommand(input: {
  origin: string;
  row: ImportRow & { normalized_data: Record<string, unknown> };
  tenantName: string;
  tenantSlug: string;
}): ImportCommand {
  if (input.row.normalized_data.record_type !== "guardians") return { rowId: input.row.id };
  const email = stringValue(input.row.normalized_data.email).toLowerCase();
  const fullName = stringValue(input.row.normalized_data.full_name);
  const code = generateInvitationCode();
  const template = renderInvitationEmail({
    acceptUrl: `${input.origin}/uitnodiging-accepteren`,
    invitationCode: code,
    isNewAccount: null,
    organizationName: input.tenantName,
    roleLabel: "Ouder/verzorger",
    tenantSlug: input.tenantSlug
  });
  return {
    rowId: input.row.id,
    invitation: {
      codeHash: hashAuthCode(code, email),
      email,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1_000).toISOString(),
      message: { ...template, organizationName: input.tenantName, templateKey: "auth_invitation" }
    }
  };
}

async function materializePendingImportGuardians(input: { actorUserId: string; jobId: string; tenantId: string }) {
  const admin = createAdminClient();
  const pending = await admin
    .from("auth_invitations")
    .select("id, email")
    .eq("tenant_id", input.tenantId)
    .eq("import_job_id", input.jobId)
    .eq("status", "pending")
    .in("identity_status", ["pending", "attention_required"])
    .order("created_at");
  if (pending.error) return false;

  for (const invitation of (pending.data ?? []) as { email: string; id: string }[]) {
    try {
      const identity = await ensureInvitationAuthUser({ email: invitation.email, provisioningInvitationId: invitation.id });
      const materialized = await admin.rpc("materialize_import_guardian_invitation", {
        target_actor_user_id: input.actorUserId,
        target_tenant_id: input.tenantId,
        target_job_id: input.jobId,
        target_invitation_id: invitation.id,
        target_user_id: identity.userId,
        target_is_new_account: identity.isNewAccount
      });
      if (materialized.error) throw new Error("identity_materialization_failed");
    } catch {
      await admin.rpc("mark_import_reconciliation_attention", {
        target_actor_user_id: input.actorUserId,
        target_tenant_id: input.tenantId,
        target_job_id: input.jobId,
        target_invitation_id: invitation.id,
        target_error_code: "identity_materialization_failed"
      });
      return false;
    }
  }
  return true;
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
async function getJob(tenantId: string, jobId: string) { const { data, error } = await createAdminClient().from("import_jobs").select("id, import_type, status, mapping, summary, invalid_count, validation_report").eq("tenant_id", tenantId).eq("id", jobId).single(); if (error || !data) throw new Error(`job: ${error?.message ?? "missing"}`); return data as { id: string; import_type: ImportType; status: string; mapping: Record<string, unknown>; summary: Record<string, unknown>; invalid_count: number; validation_report: Record<string, unknown> }; }
async function getRows(tenantId: string, jobId: string, normalized = false) {
  const admin = createAdminClient();
  const result = normalized
    ? await admin.from("import_rows").select("id, row_number, source_data, normalized_data, validation_status").eq("tenant_id", tenantId).eq("import_job_id", jobId).order("row_number")
    : await admin.from("import_rows").select("id, row_number, source_data, validation_status").eq("tenant_id", tenantId).eq("import_job_id", jobId).order("row_number");
  if (result.error) throw new Error(`rows: ${result.error.message}`);
  return (result.data ?? []) as unknown as (ImportRow & { normalized_data: Record<string, unknown> })[];
}
async function audit(tenantId: string, jobId: string, actor: string, eventType: string, details: Record<string, unknown>) { await requireWrite(createAdminClient().from("import_job_events").insert({ tenant_id: tenantId, import_job_id: jobId, actor_user_id: actor, event_type: eventType, details }), "audit"); }
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
