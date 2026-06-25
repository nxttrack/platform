"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import type { ImportType } from "./admin-imports-read-model";

const tenantWriteRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;
const importTypes = ["participants", "guardians", "groups", "payments"] as const;

type ImportContext = {
  tenantId: string;
  profileId: string;
};

type CsvRow = Record<string, string>;
type MappedRow = Record<string, string>;
type ValidationResult = {
  mapped: MappedRow;
  errors: string[];
  duplicates: string[];
  status: "ready" | "invalid" | "duplicate";
};

type LookupContext = {
  programsByCode: Map<string, { id: string; code: string }>;
  stagesByProgramAndCode: Map<string, { id: string; code: string; program_id: string }>;
  resourcesByCode: Map<string, { id: string; code: string }>;
  instructorsByEmail: Map<string, { id: string; email: string | null }>;
  participantsByReference: Map<string, { id: string; external_reference: string | null; display_name: string; birthdate: string | null }>;
  participantsByIdentity: Map<string, { id: string; display_name: string; birthdate: string | null }>;
  invoicesByNumber: Map<string, { id: string; invoice_number: string; enrollment_id: string; participant_id: string; currency: string }>;
  groupCodes: Set<string>;
  paymentFingerprints: Set<string>;
  guardianFingerprints: Set<string>;
};

const defaultMappings: Record<ImportType, Record<string, string>> = {
  participants: {
    external_reference: "external_reference",
    display_name: "display_name",
    birthdate: "birthdate",
    status: "status"
  },
  guardians: {
    participant_external_reference: "participant_external_reference",
    profile_id: "profile_id",
    relationship: "relationship",
    display_name: "display_name",
    email: "email",
    status: "status"
  },
  groups: {
    code: "code",
    name: "name",
    program_code: "program_code",
    stage_code: "stage_code",
    resource_code: "resource_code",
    instructor_email: "instructor_email",
    weekday: "weekday",
    starts_at: "starts_at",
    ends_at: "ends_at",
    capacity: "capacity",
    status: "status"
  },
  payments: {
    invoice_number: "invoice_number",
    amount: "amount",
    received_on: "received_on",
    payment_method: "payment_method",
    status: "status",
    note: "note"
  }
};

export async function createImportPreviewAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const importType = enumValue(formData, "import_type", importTypes, "participants");
  const sourceName = optionalString(formData, "source_name") ?? `${importType}-${new Date().toISOString().slice(0, 10)}.csv`;
  const csvText = requiredString(formData, "csv_text");
  const mapping = parseMapping(optionalString(formData, "mapping_text"), importType);
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    throw new Error("Geen importregels gevonden.");
  }

  if (rows.length > 500) {
    throw new Error("Deze preview ondersteunt maximaal 500 regels per batch.");
  }

  const lookup = await loadLookup(admin, context.tenantId);
  const validated = rows.map((row) => validateRow(importType, mapRow(row, mapping), lookup));
  const summary = summarize(validated);
  const batchResult = await admin
    .from("import_batches")
    .insert({
      tenant_id: context.tenantId,
      import_type: importType,
      source_name: sourceName,
      status: "previewed",
      mapping,
      summary,
      created_by_profile_id: context.profileId
    })
    .select("id")
    .single();

  if (batchResult.error || !batchResult.data) {
    throw new Error(batchResult.error?.message ?? "Importbatch kon niet worden aangemaakt.");
  }

  const batchId = batchResult.data.id as string;
  const rowPayload = rows.map((row, index) => {
    const result = validated[index]!;
    return {
      tenant_id: context.tenantId,
      batch_id: batchId,
      row_number: index + 1,
      raw_data: row,
      mapped_data: result.mapped,
      validation_errors: result.errors,
      duplicate_warnings: result.duplicates,
      status: result.status
    };
  });

  const rowsResult = await admin.from("import_rows").insert(rowPayload);

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message);
  }

  await addImportAudit(admin, context, batchId, null, "preview_created", `Preview gemaakt: ${summary.ready} klaar, ${summary.duplicate} duplicaat, ${summary.invalid} ongeldig.`, {
    import_type: importType,
    source_name: sourceName,
    total: rows.length
  });

  revalidateImports();
}

export async function applyImportBatchAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const batchId = requiredString(formData, "batch_id");
  const batch = await getBatch(admin, context.tenantId, batchId);

  if (batch.status !== "previewed" && batch.status !== "failed") {
    throw new Error("Alleen previewed of failed importbatches kunnen worden toegepast.");
  }

  const rowsResult = await admin
    .from("import_rows")
    .select("id, row_number, mapped_data, status")
    .eq("tenant_id", context.tenantId)
    .eq("batch_id", batchId)
    .eq("status", "ready")
    .order("row_number", { ascending: true });

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message);
  }

  const rows = (rowsResult.data ?? []) as { id: string; row_number: number; mapped_data: MappedRow; status: string }[];

  if (rows.length === 0) {
    throw new Error("Er zijn geen geldige regels om toe te passen.");
  }

  await admin.from("import_batches").update({ status: "applying", error_message: null }).eq("tenant_id", context.tenantId).eq("id", batchId);

  try {
    for (const row of rows) {
      const created = await applyRow(admin, context, batch.import_type as ImportType, row.mapped_data);
      await admin
        .from("import_rows")
        .update({
          status: "applied",
          created_table: created.table,
          created_record_id: created.id
        })
        .eq("tenant_id", context.tenantId)
        .eq("id", row.id);
      await addImportAudit(admin, context, batchId, row.id, "row_applied", `Regel ${row.row_number} toegepast in ${created.table}.`, created);
    }

    await admin
      .from("import_batches")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
        summary: {
          ...(batch.summary ?? {}),
          applied: rows.length
        }
      })
      .eq("tenant_id", context.tenantId)
      .eq("id", batchId);

    await addImportAudit(admin, context, batchId, null, "batch_applied", `${rows.length} importregels toegepast.`, { applied: rows.length });
  } catch (error) {
    await admin
      .from("import_batches")
      .update({ status: "failed", error_message: error instanceof Error ? error.message : "Import toepassen mislukt." })
      .eq("tenant_id", context.tenantId)
      .eq("id", batchId);
    throw error;
  }

  revalidateImports();
}

export async function rollbackImportBatchAction(formData: FormData) {
  const context = await requireTenantWriter();
  const admin = createAdminClient();
  const batchId = requiredString(formData, "batch_id");
  const batch = await getBatch(admin, context.tenantId, batchId);

  if (batch.status !== "applied") {
    throw new Error("Alleen toegepaste importbatches kunnen worden teruggedraaid.");
  }

  const rowsResult = await admin
    .from("import_rows")
    .select("id, row_number, created_table, created_record_id")
    .eq("tenant_id", context.tenantId)
    .eq("batch_id", batchId)
    .eq("status", "applied")
    .order("row_number", { ascending: false });

  if (rowsResult.error) {
    throw new Error(rowsResult.error.message);
  }

  const rows = (rowsResult.data ?? []) as { id: string; row_number: number; created_table: string | null; created_record_id: string | null }[];
  await addImportAudit(admin, context, batchId, null, "rollback_started", `Rollback gestart voor ${rows.length} regels.`, { rows: rows.length });

  for (const row of rows) {
    try {
      if (!row.created_table || !row.created_record_id) {
        throw new Error("Geen aangemaakt record gekoppeld.");
      }

      await deleteCreatedRecord(admin, context.tenantId, row.created_table, row.created_record_id);
      await admin.from("import_rows").update({ status: "rolled_back" }).eq("tenant_id", context.tenantId).eq("id", row.id);
      await addImportAudit(admin, context, batchId, row.id, "row_rolled_back", `Regel ${row.row_number} teruggedraaid.`, {
        table: row.created_table,
        id: row.created_record_id
      });
    } catch (error) {
      await addImportAudit(admin, context, batchId, row.id, "rollback_failed", `Rollback regel ${row.row_number} mislukt.`, {
        error: error instanceof Error ? error.message : "Onbekende fout"
      });
      throw error;
    }
  }

  await admin
    .from("import_batches")
    .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() })
    .eq("tenant_id", context.tenantId)
    .eq("id", batchId);
  await addImportAudit(admin, context, batchId, null, "batch_rolled_back", "Importbatch volledig teruggedraaid.", { rows: rows.length });

  revalidateImports();
}

async function requireTenantWriter(): Promise<ImportContext> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canWrite = context.activeTenant.roles.some((role) => tenantWriteRoles.includes(role as (typeof tenantWriteRoles)[number]));

  if (!canWrite) {
    throw new Error("Je hebt geen rechten om imports te beheren.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

async function loadLookup(admin: ReturnType<typeof createAdminClient>, tenantId: string): Promise<LookupContext> {
  const [programs, stages, resources, instructors, participants, invoices, groups, payments, guardians] = await Promise.all([
    admin.from("programs").select("id, code").eq("tenant_id", tenantId),
    admin.from("stages").select("id, code, program_id").eq("tenant_id", tenantId),
    admin.from("resources").select("id, code").eq("tenant_id", tenantId),
    admin.from("instructors").select("id, email").eq("tenant_id", tenantId),
    admin.from("participants").select("id, external_reference, display_name, birthdate").eq("tenant_id", tenantId),
    admin.from("invoices").select("id, invoice_number, enrollment_id, participant_id, currency").eq("tenant_id", tenantId),
    admin.from("groups").select("code").eq("tenant_id", tenantId),
    admin.from("payment_records").select("invoice_id, amount_cents, received_on").eq("tenant_id", tenantId),
    admin.from("participant_guardians").select("participant_id, profile_id, relationship").eq("tenant_id", tenantId)
  ]);

  const error = [programs, stages, resources, instructors, participants, invoices, groups, payments, guardians].find((result) => result.error)?.error;

  if (error) {
    throw new Error(error.message);
  }

  const programsByCode = new Map((programs.data ?? []).map((program: { id: string; code: string }) => [normalize(program.code), program]));
  const stagesByProgramAndCode = new Map(
    (stages.data ?? []).map((stage: { id: string; code: string; program_id: string }) => [`${stage.program_id}:${normalize(stage.code)}`, stage])
  );
  const participantsData = (participants.data ?? []) as { id: string; external_reference: string | null; display_name: string; birthdate: string | null }[];

  return {
    programsByCode,
    stagesByProgramAndCode,
    resourcesByCode: new Map((resources.data ?? []).map((resource: { id: string; code: string }) => [normalize(resource.code), resource])),
    instructorsByEmail: new Map((instructors.data ?? []).filter((instructor: { email: string | null }) => instructor.email).map((instructor: { id: string; email: string | null }) => [normalize(instructor.email), instructor])),
    participantsByReference: new Map(participantsData.filter((participant) => participant.external_reference).map((participant) => [normalize(participant.external_reference), participant])),
    participantsByIdentity: new Map(participantsData.map((participant) => [`${normalize(participant.display_name)}:${participant.birthdate ?? ""}`, participant])),
    invoicesByNumber: new Map(
      (invoices.data ?? []).map((invoice: { id: string; invoice_number: string; enrollment_id: string; participant_id: string; currency: string }) => [normalize(invoice.invoice_number), invoice])
    ),
    groupCodes: new Set((groups.data ?? []).map((group: { code: string }) => normalize(group.code))),
    paymentFingerprints: new Set((payments.data ?? []).map((payment: { invoice_id: string; amount_cents: number; received_on: string | null }) => `${payment.invoice_id}:${payment.amount_cents}:${payment.received_on ?? ""}`)),
    guardianFingerprints: new Set((guardians.data ?? []).map((guardian: { participant_id: string; profile_id: string; relationship: string }) => `${guardian.participant_id}:${guardian.profile_id}:${guardian.relationship}`))
  };
}

function validateRow(importType: ImportType, mapped: MappedRow, lookup: LookupContext): ValidationResult {
  const errors: string[] = [];
  const duplicates: string[] = [];

  if (importType === "participants") {
    requireField(mapped, "display_name", errors);
    validateOptionalDate(mapped.birthdate, "birthdate", errors);
    mapped.status = enumText(mapped.status, ["active", "inactive", "archived"], "active");

    if (mapped.external_reference && lookup.participantsByReference.has(normalize(mapped.external_reference))) {
      duplicates.push("Externe referentie bestaat al.");
    }

    if (mapped.display_name && lookup.participantsByIdentity.has(`${normalize(mapped.display_name)}:${mapped.birthdate ?? ""}`)) {
      duplicates.push("Naam + geboortedatum lijkt al te bestaan.");
    }
  }

  if (importType === "guardians") {
    requireField(mapped, "participant_external_reference", errors);
    requireField(mapped, "profile_id", errors);
    mapped.relationship = enumText(mapped.relationship, ["parent", "guardian", "athlete_self"], "parent");
    mapped.status = enumText(mapped.status, ["active", "inactive", "revoked"], "active");
    const participant = lookup.participantsByReference.get(normalize(mapped.participant_external_reference));

    if (!participant) {
      errors.push("Leerling met deze externe referentie bestaat niet.");
    } else {
      mapped.participant_id = participant.id;
      const fingerprint = `${participant.id}:${mapped.profile_id}:${mapped.relationship}`;
      if (lookup.guardianFingerprints.has(fingerprint)) {
        duplicates.push("Deze ouder/verzorgerkoppeling bestaat al.");
      }
    }
  }

  if (importType === "groups") {
    requireField(mapped, "code", errors);
    requireField(mapped, "name", errors);
    requireField(mapped, "program_code", errors);
    requireField(mapped, "stage_code", errors);
    validateTime(mapped.starts_at, "starts_at", errors);
    validateTime(mapped.ends_at, "ends_at", errors);
    mapped.weekday = parseInteger(mapped.weekday, "weekday", errors, 1, 7);
    mapped.capacity = parseInteger(mapped.capacity, "capacity", errors, 1, 999);
    mapped.status = enumText(mapped.status, ["draft", "active", "paused", "archived"], "active");

    const program = lookup.programsByCode.get(normalize(mapped.program_code));
    if (!program) {
      errors.push("Programma-code bestaat niet.");
    } else {
      mapped.program_id = program.id;
      const stage = lookup.stagesByProgramAndCode.get(`${program.id}:${normalize(mapped.stage_code)}`);
      if (!stage) {
        errors.push("Niveau-code bestaat niet binnen dit programma.");
      } else {
        mapped.stage_id = stage.id;
      }
    }

    if (mapped.resource_code) {
      const resource = lookup.resourcesByCode.get(normalize(mapped.resource_code));
      if (!resource) {
        errors.push("Resource-code bestaat niet.");
      } else {
        mapped.resource_id = resource.id;
      }
    }

    if (mapped.instructor_email) {
      const instructor = lookup.instructorsByEmail.get(normalize(mapped.instructor_email));
      if (!instructor) {
        errors.push("Instructeur e-mail bestaat niet.");
      } else {
        mapped.instructor_id = instructor.id;
      }
    }

    if (mapped.code && lookup.groupCodes.has(normalize(mapped.code))) {
      duplicates.push("Groepcode bestaat al.");
    }
  }

  if (importType === "payments") {
    requireField(mapped, "invoice_number", errors);
    validateOptionalDate(mapped.received_on, "received_on", errors);
    mapped.amount_cents = String(parseMoneyCents(mapped.amount, "amount", errors));
    mapped.payment_method = enumText(mapped.payment_method, ["manual_bank_transfer", "cash", "card_terminal", "ideal", "mollie", "external"], "manual_bank_transfer");
    mapped.status = enumText(mapped.status, ["recorded", "pending", "paid", "failed", "refunded", "cancelled"], "recorded");
    const invoice = lookup.invoicesByNumber.get(normalize(mapped.invoice_number));

    if (!invoice) {
      errors.push("Factuurnummer bestaat niet.");
    } else {
      mapped.invoice_id = invoice.id;
      mapped.enrollment_id = invoice.enrollment_id;
      mapped.participant_id = invoice.participant_id;
      mapped.currency = invoice.currency;
      const fingerprint = `${invoice.id}:${mapped.amount_cents}:${mapped.received_on ?? ""}`;
      if (lookup.paymentFingerprints.has(fingerprint)) {
        duplicates.push("Betaling met factuur + bedrag + ontvangstdatum lijkt al te bestaan.");
      }
    }
  }

  return {
    mapped,
    errors,
    duplicates,
    status: errors.length > 0 ? "invalid" : duplicates.length > 0 ? "duplicate" : "ready"
  };
}

async function applyRow(admin: ReturnType<typeof createAdminClient>, context: ImportContext, importType: ImportType, mapped: MappedRow) {
  if (importType === "participants") {
    const result = await admin
      .from("participants")
      .insert({
        tenant_id: context.tenantId,
        external_reference: nullable(mapped.external_reference),
        display_name: mapped.display_name,
        birthdate: nullable(mapped.birthdate),
        status: mapped.status ?? "active"
      })
      .select("id")
      .single();
    return createdOrThrow(result, "participants");
  }

  if (importType === "guardians") {
    const result = await admin
      .from("participant_guardians")
      .insert({
        tenant_id: context.tenantId,
        participant_id: mapped.participant_id,
        profile_id: mapped.profile_id,
        relationship: mapped.relationship ?? "parent",
        display_name: nullable(mapped.display_name),
        email: nullable(mapped.email),
        status: mapped.status ?? "active"
      })
      .select("id")
      .single();
    return createdOrThrow(result, "participant_guardians");
  }

  if (importType === "groups") {
    const result = await admin
      .from("groups")
      .insert({
        tenant_id: context.tenantId,
        program_id: mapped.program_id,
        stage_id: mapped.stage_id,
        resource_id: nullable(mapped.resource_id),
        instructor_id: nullable(mapped.instructor_id),
        code: slugify(mapped.code),
        name: mapped.name,
        weekday: Number(mapped.weekday),
        starts_at: mapped.starts_at,
        ends_at: mapped.ends_at,
        capacity: Number(mapped.capacity),
        status: mapped.status ?? "active"
      })
      .select("id")
      .single();
    return createdOrThrow(result, "groups");
  }

  const result = await admin
    .from("payment_records")
    .insert({
      tenant_id: context.tenantId,
      invoice_id: mapped.invoice_id,
      enrollment_id: mapped.enrollment_id,
      participant_id: mapped.participant_id,
      provider: "manual",
      payment_method: mapped.payment_method ?? "manual_bank_transfer",
      amount_cents: Number(mapped.amount_cents),
      currency: mapped.currency ?? "EUR",
      status: mapped.status ?? "recorded",
      received_on: nullable(mapped.received_on),
      recorded_by_profile_id: context.profileId,
      note: nullable(mapped.note),
      metadata: { source: "admin_import" }
    })
    .select("id")
    .single();
  return createdOrThrow(result, "payment_records");
}

async function deleteCreatedRecord(admin: ReturnType<typeof createAdminClient>, tenantId: string, table: string, id: string) {
  if (!["participants", "participant_guardians", "groups", "payment_records"].includes(table)) {
    throw new Error(`Rollback voor ${table} wordt niet ondersteund.`);
  }

  const result = await admin.from(table).delete().eq("tenant_id", tenantId).eq("id", id);

  if (result.error) {
    throw new Error(result.error.message);
  }
}

async function getBatch(admin: ReturnType<typeof createAdminClient>, tenantId: string, batchId: string) {
  const result = await admin
    .from("import_batches")
    .select("id, import_type, status, summary")
    .eq("tenant_id", tenantId)
    .eq("id", batchId)
    .single();

  if (result.error || !result.data) {
    throw new Error(result.error?.message ?? "Importbatch niet gevonden.");
  }

  return result.data as { id: string; import_type: string; status: string; summary: Record<string, number> | null };
}

async function addImportAudit(
  admin: ReturnType<typeof createAdminClient>,
  context: ImportContext,
  batchId: string,
  rowId: string | null,
  eventType: string,
  summary: string,
  metadata: Record<string, unknown>
) {
  const result = await admin.from("import_audit_events").insert({
    tenant_id: context.tenantId,
    batch_id: batchId,
    row_id: rowId,
    actor_profile_id: context.profileId,
    event_type: eventType,
    summary,
    metadata
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

function parseCsv(input: string): CsvRow[] {
  const lines = input.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "");
  const headers = parseCsvLine(lines.shift() ?? "").map((header) => header.trim());

  if (headers.length === 0 || headers.some((header) => !header)) {
    throw new Error("CSV-header ontbreekt of bevat lege kolommen.");
  }

  return lines.map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = (values[index] ?? "").trim();
      return row;
    }, {});
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      values.push(value);
      value = "";
      continue;
    }

    value += char;
  }

  values.push(value);
  return values;
}

function parseMapping(mappingText: string | null, importType: ImportType) {
  const mapping = { ...defaultMappings[importType] };

  for (const line of (mappingText ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [target, ...sourceParts] = trimmed.split("=");
    const targetField = target?.trim();
    const sourceField = sourceParts.join("=").trim();

    if (targetField && sourceField) {
      mapping[targetField] = sourceField;
    }
  }

  return mapping;
}

function mapRow(row: CsvRow, mapping: Record<string, string>): MappedRow {
  return Object.entries(mapping).reduce<MappedRow>((mapped, [targetField, sourceField]) => {
    mapped[targetField] = row[sourceField]?.trim() ?? "";
    return mapped;
  }, {});
}

function summarize(results: ValidationResult[]) {
  return results.reduce(
    (summary, result) => {
      summary.total += 1;
      summary[result.status] += 1;
      return summary;
    },
    { total: 0, ready: 0, duplicate: 0, invalid: 0 }
  );
}

function createdOrThrow(result: { data: { id?: string } | null; error: { message: string } | null }, table: string) {
  if (result.error || !result.data?.id) {
    throw new Error(result.error?.message ?? `${table} record kon niet worden aangemaakt.`);
  }

  return { table, id: result.data.id };
}

function requireField(mapped: MappedRow, key: string, errors: string[]) {
  if (!mapped[key]) {
    errors.push(`${key} is verplicht.`);
  }
}

function validateOptionalDate(value: string | undefined, key: string, errors: string[]) {
  if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${key} moet YYYY-MM-DD zijn.`);
  }
}

function validateTime(value: string | undefined, key: string, errors: string[]) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) {
    errors.push(`${key} moet HH:MM zijn.`);
  }
}

function parseInteger(value: string | undefined, key: string, errors: string[], min: number, max: number) {
  const parsed = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${key} moet tussen ${min} en ${max} liggen.`);
    return "";
  }

  return String(parsed);
}

function parseMoneyCents(value: string | undefined, key: string, errors: string[]) {
  const parsed = Number.parseFloat((value ?? "").replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push(`${key} moet een geldig bedrag zijn.`);
    return 0;
  }

  return Math.round(parsed * 100);
}

function enumText(value: string | undefined, allowed: readonly string[], fallback: string) {
  return value && allowed.includes(value) ? value : fallback;
}

function enumValue<const Value extends string>(formData: FormData, key: string, allowed: readonly Value[], fallback: Value) {
  const value = optionalString(formData, key) ?? fallback;
  return allowed.includes(value as Value) ? (value as Value) : fallback;
}

function requiredString(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) {
    throw new Error(`${key} is verplicht.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nullable(value: string | null | undefined) {
  return value && value.trim() ? value.trim() : null;
}

function revalidateImports() {
  for (const path of ["/admin/imports", "/admin/leerlingen", "/admin/groups", "/admin/payments", "/admin/rapportages"]) {
    revalidatePath(path);
  }
}
