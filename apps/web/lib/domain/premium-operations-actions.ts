"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePrivateShellContext } from "@/lib/auth/server-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveTenant } from "./core";

const automationEvents = new Set(["no_show", "birthday", "milestone", "offer_expiring", "payment_failed", "long_absence", "graduation_ready"]);
const automationActions = new Set(["send_email", "create_task", "notify_parent", "notify_admin", "add_tag"]);
const importTypes = new Set(["participants", "guardians", "groups", "enrollments", "payments", "mixed"]);

export async function createAutomationRuleAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin("/admin/automatisering");
  const eventKey = readEnum(formData, "eventKey", automationEvents);
  const actionKey = readEnum(formData, "actionKey", automationActions);
  const admin = createAdminClient();
  const { error } = await admin.from("automation_rules").insert({
    tenant_id: tenant.id,
    name: readRequired(formData, "name"),
    event_key: eventKey,
    action_key: actionKey,
    action_config: { message: readOptional(formData, "message") },
    status: formData.get("active") === "on" ? "active" : "draft",
    created_by_user_id: userId
  });
  if (error) redirect("/admin/automatisering?error=save");
  revalidatePath("/admin/automatisering");
  redirect("/admin/automatisering?saved=1");
}

export async function setAutomationRuleStatusAction(formData: FormData) {
  const { tenant } = await requireTenantAdmin("/admin/automatisering");
  const ruleId = readRequired(formData, "ruleId");
  const status = readEnum(formData, "status", new Set(["active", "paused", "archived"]));
  const admin = createAdminClient();
  const { error } = await admin.from("automation_rules").update({ status }).eq("tenant_id", tenant.id).eq("id", ruleId);
  if (error) redirect("/admin/automatisering?error=status");
  revalidatePath("/admin/automatisering");
  redirect("/admin/automatisering?saved=1");
}

export async function createImportJobAction(formData: FormData) {
  const { tenant, userId } = await requireTenantAdmin("/admin/importeren");
  const file = formData.get("file");
  const importType = readEnum(formData, "importType", importTypes);
  if (!(file instanceof File) || !file.name || file.size === 0 || file.size > 2_000_000) redirect("/admin/importeren?error=file");

  const text = await file.text();
  const parsed = parseCsv(text);
  if (parsed.headers.length < 2 || parsed.rows.length === 0 || parsed.rows.length > 5_000) redirect("/admin/importeren?error=content");

  const seen = new Set<string>();
  let duplicateCount = 0;
  let invalidCount = 0;
  const rows = parsed.rows.map((values, index) => {
    const sourceData = Object.fromEntries(parsed.headers.map((header, column) => [header, values[column]?.trim() ?? ""]));
    const duplicateKey = JSON.stringify(sourceData).toLocaleLowerCase("nl");
    const duplicate = seen.has(duplicateKey);
    seen.add(duplicateKey);
    const empty = Object.values(sourceData).every((value) => !value);
    if (duplicate) duplicateCount += 1;
    if (empty) invalidCount += 1;
    return { rowNumber: index + 2, sourceData, duplicateKey, status: duplicate ? "duplicate" : empty ? "invalid" : "valid", errors: empty ? ["Lege rij"] : [] };
  });

  const validCount = rows.filter((row) => row.status === "valid").length;
  const admin = createAdminClient();
  const jobResult = await admin.from("import_jobs").insert({
    tenant_id: tenant.id,
    import_type: importType,
    source_name: file.name,
    status: "validated",
    mapping: Object.fromEntries(parsed.headers.map((header) => [header, null])),
    summary: { delimiter: parsed.delimiter, headers: parsed.headers },
    row_count: rows.length,
    valid_count: validCount,
    invalid_count: invalidCount,
    duplicate_count: duplicateCount,
    created_by_user_id: userId
  }).select("id").single();
  if (jobResult.error || !jobResult.data) redirect("/admin/importeren?error=save");

  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500).map((row) => ({ tenant_id: tenant.id, import_job_id: jobResult.data.id, row_number: row.rowNumber, source_data: row.sourceData, normalized_data: row.sourceData, validation_status: row.status, validation_errors: row.errors, duplicate_key: row.duplicateKey }));
    const { error } = await admin.from("import_rows").insert(chunk);
    if (error) {
      await admin.from("import_jobs").update({ status: "failed", summary: { error: "rows_not_saved" } }).eq("tenant_id", tenant.id).eq("id", jobResult.data.id);
      redirect("/admin/importeren?error=rows");
    }
  }

  revalidatePath("/admin/importeren");
  redirect(`/admin/importeren?saved=1&job=${jobResult.data.id}`);
}

export async function cancelImportJobAction(formData: FormData) {
  const { tenant } = await requireTenantAdmin("/admin/importeren");
  const jobId = readRequired(formData, "jobId");
  const admin = createAdminClient();
  const { error } = await admin.from("import_jobs").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("tenant_id", tenant.id).eq("id", jobId).in("status", ["uploaded", "mapping", "validated", "ready", "failed"]);
  if (error) redirect("/admin/importeren?error=cancel");
  revalidatePath("/admin/importeren");
  redirect("/admin/importeren?saved=cancelled");
}

export async function saveTenantBrandingAction(formData: FormData) {
  const { tenant } = await requireTenantAdmin("/admin/branding");
  const primaryColor = readColor(formData, "primaryColor", "#1d4ed8");
  const accentColor = readColor(formData, "accentColor", "#06b6d4");
  const admin = createAdminClient();
  const { error } = await admin.from("tenant_branding").upsert({
    tenant_id: tenant.id,
    product_name: readOptional(formData, "productName"),
    logo_url: readOptional(formData, "logoUrl"),
    primary_color: primaryColor,
    accent_color: accentColor,
    email_from_name: readOptional(formData, "emailFromName"),
    email_footer: readOptional(formData, "emailFooter"),
    portal_welcome: readOptional(formData, "portalWelcome"),
    pwa_enabled: formData.get("pwaEnabled") === "on",
    status: formData.get("active") === "on" ? "active" : "draft"
  }, { onConflict: "tenant_id" });
  if (error) redirect("/admin/branding?error=save");
  revalidatePath("/admin/branding");
  redirect("/admin/branding?saved=1");
}

async function requireTenantAdmin(path: `/${string}`) {
  const context = await requirePrivateShellContext(path);
  const tenant = getActiveTenant(context);
  if (!context.activeTenant?.roles.some((role) => role === "tenant_owner" || role === "tenant_admin")) redirect("/admin?error=forbidden");
  return { tenant, userId: context.user.id };
}

function parseCsv(input: string) {
  const normalized = input.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const firstLine = normalized.split("\n", 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === '"') {
      if (quoted && normalized[index + 1] === '"') { field += '"'; index += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) { record.push(field); field = ""; }
    else if (char === "\n" && !quoted) { record.push(field); if (record.some((value) => value.trim())) records.push(record); record = []; field = ""; }
    else field += char;
  }
  record.push(field);
  if (record.some((value) => value.trim())) records.push(record);
  const [rawHeaders = [], ...rows] = records;
  const headers = rawHeaders.map((header, index) => header.trim() || `kolom_${index + 1}`);
  return { delimiter, headers, rows };
}

function readRequired(formData: FormData, field: string) {
  const value = String(formData.get(field) ?? "").trim();
  if (!value) throw new Error(`${field} is required`);
  return value;
}
function readOptional(formData: FormData, field: string) { return String(formData.get(field) ?? "").trim() || null; }
function readEnum(formData: FormData, field: string, values: Set<string>) { const value = readRequired(formData, field); if (!values.has(value)) throw new Error(`${field} is invalid`); return value; }
function readColor(formData: FormData, field: string, fallback: string) { const value = String(formData.get(field) ?? fallback); return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
