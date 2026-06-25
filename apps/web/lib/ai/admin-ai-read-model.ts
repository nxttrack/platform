import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { aiAssistantCapabilities, aiCapabilityDescription, aiCapabilityLabel, defaultAiModel, type AiAssistantCapability } from "@/lib/ai/assistant";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type TenantAiAssistantSettingRow = {
  id: string;
  capability: AiAssistantCapability;
  label: string;
  description: string | null;
  enabled: boolean;
  mode: "disabled" | "suggestion_only" | "draft_with_review";
  provider: "openai";
  model: string;
  prompt_version: string;
  allowed_context_level: "minimal" | "operational" | "sensitive";
  sensitive_data_review_status: "pending" | "approved" | "blocked";
  sensitive_data_reviewed_at: string | null;
  metadata: Record<string, unknown>;
  updated_at: string;
};

export type AiAssistantSuggestionRow = {
  id: string;
  capability: AiAssistantCapability;
  subject_type: string | null;
  subject_id: string | null;
  source_engine_key: string | null;
  smart_decision_id: string | null;
  provider: "openai";
  model: string;
  prompt_version: string;
  suggestion_label: string;
  status: "drafted" | "blocked" | "failed" | "edited" | "accepted" | "dismissed";
  input_snapshot: Record<string, unknown>;
  source_of_truth: Record<string, unknown>;
  prompt_snapshot: Record<string, unknown>;
  redaction_summary: Record<string, unknown>;
  output_text: string | null;
  edited_output_text: string | null;
  human_decision: string | null;
  human_note: string | null;
  error_message: string | null;
  created_at: string;
};

export type AiAssistantContextOption = {
  capability: AiAssistantCapability;
  subjectType: string;
  subjectId: string;
  label: string;
  sourceEngineKey?: string | null;
  smartDecisionId?: string | null;
  context: string;
  sourceOfTruth: Record<string, unknown>;
};

export type AdminAiAssistantData = {
  settings: TenantAiAssistantSettingRow[];
  suggestions: AiAssistantSuggestionRow[];
  contextOptions: AiAssistantContextOption[];
  provider: {
    configured: boolean;
    serverEnabled: boolean;
    defaultModel: string;
    storeResponses: boolean;
  };
};

export type AdminAiAssistantSnapshot = {
  status: "ready" | "not_configured" | "no_tenant" | "query_error";
  tenant: {
    id: string;
    name: string;
    slug: string;
    sector: string;
  } | null;
  data: AdminAiAssistantData;
  errors: string[];
};

type IntakeRow = {
  id: string;
  parent_name: string;
  parent_email: string;
  participant_name: string;
  participant_birthdate: string | null;
  intake_type: string;
  status: string;
  preferred_days: string[];
  preferred_time_windows: string[];
  answers: Record<string, unknown>;
  recommendation_snapshot?: Record<string, unknown>;
  duplicate_snapshot?: Record<string, unknown>;
  created_at: string;
};

type SmartDecisionRow = {
  id: string;
  engine_key: string;
  subject_type: string;
  subject_id: string;
  score: number | null;
  confidence: string;
  reasons_json: Array<Record<string, unknown>>;
  blockers_json: Array<Record<string, unknown>>;
  recommendation: Record<string, unknown>;
  decision_status: string;
  created_at: string;
};

type ProgressRow = {
  id: string;
  status: string;
  score: number | null;
  note: string | null;
  assessed_at: string;
};

type InstructorNoteRow = {
  id: string;
  note_type: string;
  body: string;
  created_at: string;
};

type ReportExportRow = {
  id: string;
  report_type: string;
  export_format: string;
  status: string;
  filters: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
};

type AutomationLogRow = {
  id: string;
  engine_key: string;
  action_key: string;
  action_status: string;
  safety_result: Record<string, unknown>;
  failure_reason: string | null;
  created_at: string;
};

export async function getAdminAiAssistantSnapshot(): Promise<AdminAiAssistantSnapshot> {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);
  const emptyData = createEmptyData();

  if (context.status !== "authenticated" || !context.activeTenant) {
    return {
      status: "no_tenant",
      tenant: null,
      data: emptyData,
      errors: ["Geen actieve tenant gevonden voor de AI-assistent."]
    };
  }

  const tenant = {
    id: context.activeTenant.tenantId,
    name: context.activeTenant.name,
    slug: context.activeTenant.slug,
    sector: context.activeTenant.sector
  };

  if (!getSupabasePublicConfig()) {
    return {
      status: "not_configured",
      tenant,
      data: emptyData,
      errors: ["Supabase is nog niet geconfigureerd in deze runtime."]
    };
  }

  const supabase = await createClient();
  const tenantId = tenant.id;
  const [
    settingsResult,
    suggestionsResult,
    intakeResult,
    decisionsResult,
    progressResult,
    notesResult,
    reportsResult,
    automationResult
  ] = await Promise.all([
    supabase
      .from("tenant_ai_assistant_settings")
      .select("id, capability, label, description, enabled, mode, provider, model, prompt_version, allowed_context_level, sensitive_data_review_status, sensitive_data_reviewed_at, metadata, updated_at")
      .eq("tenant_id", tenantId)
      .order("capability", { ascending: true }),
    supabase
      .from("ai_assistant_suggestions")
      .select("id, capability, subject_type, subject_id, source_engine_key, smart_decision_id, provider, model, prompt_version, suggestion_label, status, input_snapshot, source_of_truth, prompt_snapshot, redaction_summary, output_text, edited_output_text, human_decision, human_note, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("intake_submissions")
      .select("id, parent_name, parent_email, participant_name, participant_birthdate, intake_type, status, preferred_days, preferred_time_windows, answers, recommendation_snapshot, duplicate_snapshot, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("smart_decisions")
      .select("id, engine_key, subject_type, subject_id, score, confidence, reasons_json, blockers_json, recommendation, decision_status, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("progress")
      .select("id, status, score, note, assessed_at")
      .eq("tenant_id", tenantId)
      .order("assessed_at", { ascending: false })
      .limit(8),
    supabase
      .from("instructor_student_notes")
      .select("id, note_type, body, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("report_export_requests")
      .select("id, report_type, export_format, status, filters, error_message, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("automation_execution_logs")
      .select("id, engine_key, action_key, action_status, safety_result, failure_reason, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(12)
  ]);

  const errors = collectErrors({
    tenant_ai_assistant_settings: settingsResult.error,
    ai_assistant_suggestions: suggestionsResult.error,
    intake_submissions: intakeResult.error,
    smart_decisions: decisionsResult.error,
    progress: progressResult.error,
    instructor_student_notes: notesResult.error,
    report_export_requests: reportsResult.error,
    automation_execution_logs: automationResult.error
  });

  const settings = mergeSettings(asRows<TenantAiAssistantSettingRow>(settingsResult.data));
  const suggestions = asRows<AiAssistantSuggestionRow>(suggestionsResult.data);
  const contextOptions = buildContextOptions({
    intakes: asRows<IntakeRow>(intakeResult.data),
    decisions: asRows<SmartDecisionRow>(decisionsResult.data),
    progress: asRows<ProgressRow>(progressResult.data),
    notes: asRows<InstructorNoteRow>(notesResult.data),
    reports: asRows<ReportExportRow>(reportsResult.data),
    automation: asRows<AutomationLogRow>(automationResult.data)
  });

  return {
    status: errors.length > 0 ? "query_error" : "ready",
    tenant,
    errors,
    data: {
      settings,
      suggestions,
      contextOptions,
      provider: {
        configured: Boolean(process.env.OPENAI_API_KEY),
        serverEnabled: process.env.AI_ASSISTANT_ENABLED === "true",
        defaultModel: defaultAiModel(),
        storeResponses: process.env.AI_ASSISTANT_STORE_RESPONSES === "true"
      }
    }
  };
}

function mergeSettings(rows: TenantAiAssistantSettingRow[]): TenantAiAssistantSettingRow[] {
  const byCapability = new Map(rows.map((row) => [row.capability, row]));

  return aiAssistantCapabilities.map((capability) => {
    const row = byCapability.get(capability);

    if (row) {
      return row;
    }

    return {
      id: capability,
      capability,
      label: aiCapabilityLabel(capability),
      description: aiCapabilityDescription(capability),
      enabled: false,
      mode: "suggestion_only",
      provider: "openai",
      model: defaultAiModel(),
      prompt_version: "s13-v1",
      allowed_context_level: "minimal",
      sensitive_data_review_status: "pending",
      sensitive_data_reviewed_at: null,
      metadata: {},
      updated_at: new Date(0).toISOString()
    };
  });
}

function buildContextOptions(input: {
  intakes: IntakeRow[];
  decisions: SmartDecisionRow[];
  progress: ProgressRow[];
  notes: InstructorNoteRow[];
  reports: ReportExportRow[];
  automation: AutomationLogRow[];
}): AiAssistantContextOption[] {
  const intakeOptions = input.intakes.map((row) => ({
    capability: "intake_summary" as const,
    subjectType: "intake_submission",
    subjectId: row.id,
    label: `${row.participant_name} - ${row.intake_type} - ${row.status}`,
    sourceEngineKey: "intake_recommendation",
    context: [
      `Leerling: ${row.participant_name}`,
      `Ouder: ${row.parent_name} (${row.parent_email})`,
      `Geboortedatum: ${row.participant_birthdate ?? "onbekend"}`,
      `Intake type/status: ${row.intake_type}/${row.status}`,
      `Voorkeursdagen: ${row.preferred_days.join(", ") || "geen"}`,
      `Voorkeurstijden: ${row.preferred_time_windows.join(", ") || "geen"}`,
      `Antwoorden: ${JSON.stringify(row.answers)}`,
      `Aanbeveling: ${JSON.stringify(row.recommendation_snapshot ?? {})}`,
      `Duplicaatcheck: ${JSON.stringify(row.duplicate_snapshot ?? {})}`
    ].join("\n"),
    sourceOfTruth: { table: "intake_submissions", id: row.id, status: row.status }
  }));

  const decisionOptions = input.decisions.map((row) => ({
    capability: "admin_explanation" as const,
    subjectType: "smart_decision",
    subjectId: row.id,
    label: `${row.engine_key} - ${row.confidence} - ${row.decision_status}`,
    sourceEngineKey: row.engine_key,
    smartDecisionId: row.id,
    context: [
      `Engine: ${row.engine_key}`,
      `Subject: ${row.subject_type}:${row.subject_id}`,
      `Score/confidence: ${row.score ?? "n.v.t."}/${row.confidence}`,
      `Status: ${row.decision_status}`,
      `Redenen: ${JSON.stringify(row.reasons_json)}`,
      `Blockers: ${JSON.stringify(row.blockers_json)}`,
      `Aanbeveling: ${JSON.stringify(row.recommendation)}`
    ].join("\n"),
    sourceOfTruth: { table: "smart_decisions", id: row.id, engine_key: row.engine_key, decision_status: row.decision_status }
  }));

  const messageOptions = input.decisions.slice(0, 6).map((row) => ({
    capability: "parent_message_draft" as const,
    subjectType: "smart_decision",
    subjectId: row.id,
    label: `Ouderbericht voor ${row.engine_key}`,
    sourceEngineKey: "notification",
    smartDecisionId: row.id,
    context: [
      `Workflow: ${row.engine_key}`,
      `Status: ${row.decision_status}`,
      `Menselijke beslissing moet leidend blijven.`,
      `Aanbeveling/context: ${JSON.stringify(row.recommendation)}`,
      `Redenen: ${JSON.stringify(row.reasons_json)}`
    ].join("\n"),
    sourceOfTruth: { table: "smart_decisions", id: row.id, parent_safe: true }
  }));

  const progressOptions = [...input.progress.map((row) => ({
    subjectType: "progress",
    subjectId: row.id,
    label: `Voortgang - ${row.status} - score ${row.score ?? "-"}`,
    context: [`Status: ${row.status}`, `Score: ${row.score ?? "n.v.t."}`, `Notitie: ${row.note ?? "geen"}`, `Moment: ${row.assessed_at}`].join("\n"),
    sourceOfTruth: { table: "progress", id: row.id, status: row.status }
  })), ...input.notes.map((row) => ({
    subjectType: "instructor_student_note",
    subjectId: row.id,
    label: `Notitie - ${row.note_type}`,
    context: [`Type: ${row.note_type}`, `Notitie: ${row.body}`, `Moment: ${row.created_at}`].join("\n"),
    sourceOfTruth: { table: "instructor_student_notes", id: row.id, note_type: row.note_type }
  }))].slice(0, 8).map((row) => ({
    ...row,
    capability: "progress_note_rewrite" as const,
    sourceEngineKey: "progress"
  }));

  const reportOptions = input.reports.map((row) => ({
    capability: "report_insight" as const,
    subjectType: "report_export_request",
    subjectId: row.id,
    label: `${row.report_type} - ${row.status} - ${row.export_format}`,
    sourceEngineKey: "reporting",
    context: [
      `Rapport: ${row.report_type}`,
      `Status/export: ${row.status}/${row.export_format}`,
      `Filters: ${JSON.stringify(row.filters)}`,
      `Foutmelding: ${row.error_message ?? "geen"}`
    ].join("\n"),
    sourceOfTruth: { table: "report_export_requests", id: row.id, report_type: row.report_type, status: row.status }
  }));

  const riskOptions = [
    {
      capability: "risk_signal_summary" as const,
      subjectType: "tenant_risk_snapshot",
      subjectId: input.automation[0]?.id ?? "00000000-0000-0000-0000-000000000000",
      label: "Laatste automation en smart blockers",
      sourceEngineKey: null,
      context: [
        "Automation logs:",
        JSON.stringify(input.automation.map((row) => ({ engine: row.engine_key, action: row.action_key, status: row.action_status, safety: row.safety_result, failure: row.failure_reason }))),
        "Smart decisions:",
        JSON.stringify(input.decisions.map((row) => ({ engine: row.engine_key, confidence: row.confidence, status: row.decision_status, blockers: row.blockers_json })))
      ].join("\n"),
      sourceOfTruth: { tables: ["automation_execution_logs", "smart_decisions"], generated_snapshot: true }
    }
  ];

  return [...intakeOptions, ...decisionOptions, ...messageOptions, ...progressOptions, ...reportOptions, ...riskOptions];
}

function createEmptyData(): AdminAiAssistantData {
  return {
    settings: [],
    suggestions: [],
    contextOptions: [],
    provider: {
      configured: false,
      serverEnabled: false,
      defaultModel: defaultAiModel(),
      storeResponses: false
    }
  };
}

function collectErrors(errorsByTable: Record<string, { message: string } | null>): string[] {
  return Object.entries(errorsByTable).flatMap(([table, error]) => {
    return error ? [`${table}: ${error.message}`] : [];
  });
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}
