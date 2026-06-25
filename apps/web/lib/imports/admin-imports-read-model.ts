import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type ImportType = "participants" | "guardians" | "groups" | "payments";
export type ImportBatchStatus = "draft" | "previewed" | "applying" | "applied" | "failed" | "rolled_back";
export type ImportRowStatus = "preview" | "invalid" | "duplicate" | "ready" | "applied" | "skipped" | "rolled_back" | "failed";

export type ImportBatch = {
  id: string;
  import_type: ImportType;
  source_name: string | null;
  status: ImportBatchStatus;
  mapping: Record<string, string>;
  summary: Record<string, number>;
  error_message: string | null;
  applied_at: string | null;
  rolled_back_at: string | null;
  created_at: string;
};

export type ImportRow = {
  id: string;
  batch_id: string;
  row_number: number;
  raw_data: Record<string, string>;
  mapped_data: Record<string, string>;
  validation_errors: string[];
  duplicate_warnings: string[];
  status: ImportRowStatus;
  created_table: string | null;
  created_record_id: string | null;
};

export type ImportAuditEvent = {
  id: string;
  batch_id: string;
  event_type: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ImportLookup = {
  programs: { id: string; code: string; name: string }[];
  stages: { id: string; code: string; name: string; program_id: string }[];
  resources: { id: string; code: string; name: string }[];
  instructors: { id: string; email: string | null; display_name: string }[];
  participants: { id: string; external_reference: string | null; display_name: string; birthdate: string | null }[];
  invoices: { id: string; invoice_number: string; status: string; amount_due_cents: number; amount_paid_cents: number; currency: string }[];
};

export type AdminImportsSnapshot =
  | {
      status: "not_configured" | "unauthenticated" | "no_tenant";
      error: string;
      batches: [];
      rowsByBatch: Record<string, ImportRow[]>;
      auditByBatch: Record<string, ImportAuditEvent[]>;
      lookup: ImportLookup;
    }
  | {
      status: "ready";
      tenantName: string;
      batches: ImportBatch[];
      rowsByBatch: Record<string, ImportRow[]>;
      auditByBatch: Record<string, ImportAuditEvent[]>;
      lookup: ImportLookup;
      errors: Record<string, string | undefined>;
    };

const emptyLookup: ImportLookup = {
  programs: [],
  stages: [],
  resources: [],
  instructors: [],
  participants: [],
  invoices: []
};

export async function getAdminImportsSnapshot(): Promise<AdminImportsSnapshot> {
  if (!getSupabasePublicConfig()) {
    return fallback("not_configured", "Supabase is nog niet geconfigureerd.");
  }

  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated") {
    return fallback("unauthenticated", "Log in om imports te beheren.");
  }

  if (!context.activeTenant) {
    return fallback("no_tenant", "Geen actieve tenant gevonden.");
  }

  const supabase = await createClient();
  const tenantId = context.activeTenant.tenantId;
  const [batchesResult, lookupResult] = await Promise.all([
    supabase
      .from("import_batches")
      .select("id, import_type, source_name, status, mapping, summary, error_message, applied_at, rolled_back_at, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    loadLookup(supabase, tenantId)
  ]);

  const batches = (batchesResult.data ?? []) as ImportBatch[];
  const batchIds = batches.map((batch) => batch.id);
  const [rowsResult, auditResult] =
    batchIds.length > 0
      ? await Promise.all([
          supabase
            .from("import_rows")
            .select("id, batch_id, row_number, raw_data, mapped_data, validation_errors, duplicate_warnings, status, created_table, created_record_id")
            .eq("tenant_id", tenantId)
            .in("batch_id", batchIds)
            .order("row_number", { ascending: true }),
          supabase
            .from("import_audit_events")
            .select("id, batch_id, event_type, summary, metadata, created_at")
            .eq("tenant_id", tenantId)
            .in("batch_id", batchIds)
            .order("created_at", { ascending: false })
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

  return {
    status: "ready",
    tenantName: context.activeTenant.name,
    batches,
    rowsByBatch: groupByBatch((rowsResult.data ?? []) as ImportRow[]),
    auditByBatch: groupByBatch((auditResult.data ?? []) as ImportAuditEvent[]),
    lookup: lookupResult.lookup,
    errors: {
      batches: batchesResult.error?.message,
      rows: rowsResult.error?.message,
      audit: auditResult.error?.message,
      lookup: lookupResult.error
    }
  };
}

async function loadLookup(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  const [programs, stages, resources, instructors, participants, invoices] = await Promise.all([
    supabase.from("programs").select("id, code, name").eq("tenant_id", tenantId).order("sort_order"),
    supabase.from("stages").select("id, code, name, program_id").eq("tenant_id", tenantId).order("sort_order"),
    supabase.from("resources").select("id, code, name").eq("tenant_id", tenantId).order("name"),
    supabase.from("instructors").select("id, email, display_name").eq("tenant_id", tenantId).order("display_name"),
    supabase.from("participants").select("id, external_reference, display_name, birthdate").eq("tenant_id", tenantId).order("display_name"),
    supabase.from("invoices").select("id, invoice_number, status, amount_due_cents, amount_paid_cents, currency").eq("tenant_id", tenantId).order("created_at", { ascending: false })
  ]);

  return {
    lookup: {
      programs: (programs.data ?? []) as ImportLookup["programs"],
      stages: (stages.data ?? []) as ImportLookup["stages"],
      resources: (resources.data ?? []) as ImportLookup["resources"],
      instructors: (instructors.data ?? []) as ImportLookup["instructors"],
      participants: (participants.data ?? []) as ImportLookup["participants"],
      invoices: (invoices.data ?? []) as ImportLookup["invoices"]
    },
    error: [programs, stages, resources, instructors, participants, invoices].find((result) => result.error)?.error?.message
  };
}

function groupByBatch<Row extends { batch_id: string }>(rows: Row[]) {
  return rows.reduce<Record<string, Row[]>>((grouped, row) => {
    grouped[row.batch_id] = grouped[row.batch_id] ?? [];
    grouped[row.batch_id].push(row);
    return grouped;
  }, {});
}

function fallback(status: "not_configured" | "unauthenticated" | "no_tenant", error: string): AdminImportsSnapshot {
  return {
    status,
    error,
    batches: [],
    rowsByBatch: {},
    auditByBatch: {},
    lookup: emptyLookup
  };
}
