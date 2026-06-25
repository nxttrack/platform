"use server";

import { revalidatePath } from "next/cache";

import { getActiveTenantSelection } from "@/lib/auth/tenant-selection";
import { getTrustedAuthContext } from "@/lib/auth/server-context";
import { aiCapabilityDescription, aiCapabilityLabel, defaultAiModel, generateAiSuggestion, isAiAssistantCapability, type AiAssistantCapability } from "@/lib/ai/assistant";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

const tenantAiRoles = ["tenant_owner", "tenant_admin", "tenant_staff"] as const;
const tenantAiAdminRoles = ["tenant_owner", "tenant_admin"] as const;

type AiSetting = {
  capability: AiAssistantCapability;
  enabled: boolean;
  mode: "disabled" | "suggestion_only" | "draft_with_review";
  provider: "openai";
  model: string;
  prompt_version: string;
  allowed_context_level: "minimal" | "operational" | "sensitive";
  sensitive_data_review_status: "pending" | "approved" | "blocked";
};

export async function updateAiAssistantSettingAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAiAdmin();
  const capability = capabilityValue(formData, "capability");
  const enabled = boolValue(formData, "enabled");
  const mode = enumValue(formData, "mode", ["disabled", "suggestion_only", "draft_with_review"], "suggestion_only");
  const model = optionalString(formData, "model") ?? defaultAiModel();
  const allowedContextLevel = enumValue(formData, "allowed_context_level", ["minimal", "operational", "sensitive"], "minimal");
  const reviewStatus = enumValue(formData, "sensitive_data_review_status", ["pending", "approved", "blocked"], "pending");

  await throwOnError(
    supabase.from("tenant_ai_assistant_settings").upsert(
      {
        tenant_id: tenantId,
        capability,
        label: aiCapabilityLabel(capability),
        description: aiCapabilityDescription(capability),
        enabled: enabled && mode !== "disabled",
        mode,
        provider: "openai",
        model,
        prompt_version: "s13-v1",
        allowed_context_level: allowedContextLevel,
        sensitive_data_review_status: reviewStatus,
        sensitive_data_reviewed_at: reviewStatus === "approved" ? new Date().toISOString() : null,
        sensitive_data_reviewed_by_profile_id: reviewStatus === "approved" ? profileId : null,
        metadata: {
          phase: "s13",
          suggestion_only: true,
          ai_cannot_be_source_of_truth: true,
          output_must_be_editable: true
        }
      },
      { onConflict: "tenant_id,capability" }
    )
  );

  revalidateAi();
}

export async function generateAiAssistantSuggestionAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAiUser();
  const capability = capabilityValue(formData, "capability");
  const subjectType = optionalString(formData, "subject_type");
  const subjectId = optionalString(formData, "subject_id");
  const sourceEngineKey = optionalString(formData, "source_engine_key");
  const smartDecisionId = optionalString(formData, "smart_decision_id");
  const sourceContext = requiredString(formData, "source_context").slice(0, 12000);
  const goal = optionalString(formData, "goal") ?? "";
  const sourceOfTruth = jsonObjectValue(formData, "source_of_truth");
  const setting = await getSetting(supabase, tenantId, capability);
  const blockedReason = getSettingBlocker(setting);

  if (blockedReason) {
    await insertSuggestion(supabase, {
      tenantId,
      profileId,
      setting,
      capability,
      subjectType,
      subjectId,
      sourceEngineKey,
      smartDecisionId,
      sourceContext,
      sourceOfTruth,
      goal,
      status: "blocked",
      outputText: null,
      errorMessage: blockedReason,
      promptSnapshot: {
        capability,
        blocked_before_provider_call: true,
        reason: blockedReason,
        suggestion_only: true
      },
      redactionSummary: {
        policy: "Provider call skipped because tenant AI settings are not active."
      }
    });

    revalidateAi();
    return;
  }

  const result = await generateAiSuggestion({
    tenantId,
    profileId,
    capability,
    capabilityLabel: setting.label,
    promptVersion: setting.prompt_version,
    model: setting.model,
    sourceContext,
    goal,
    subjectType,
    subjectId,
    sourceOfTruth,
    metadata: {
      mode: setting.mode,
      allowed_context_level: setting.allowed_context_level
    }
  });

  await insertSuggestion(supabase, {
    tenantId,
    profileId,
    setting,
    capability,
    subjectType,
    subjectId,
    sourceEngineKey,
    smartDecisionId,
    sourceContext,
    sourceOfTruth,
    goal,
    status: result.status,
    outputText: result.outputText,
    errorMessage: result.errorMessage,
    promptSnapshot: result.promptSnapshot,
    redactionSummary: result.redactionSummary
  });

  revalidateAi();
}

export async function updateAiAssistantSuggestionAction(formData: FormData) {
  const { supabase, tenantId, profileId } = await requireTenantAiUser();
  const id = requiredString(formData, "id");
  const editedOutput = optionalString(formData, "edited_output_text");
  const humanDecision = enumValue(formData, "human_decision", ["accepted", "edited", "dismissed"], "edited");
  const humanNote = optionalString(formData, "human_note");
  const status = humanDecision === "accepted" ? "accepted" : humanDecision === "dismissed" ? "dismissed" : "edited";

  await throwOnError(
    supabase
      .from("ai_assistant_suggestions")
      .update({
        status,
        edited_output_text: editedOutput,
        human_decision: humanDecision,
        human_note: humanNote,
        decided_by_profile_id: profileId,
        decided_at: new Date().toISOString(),
        metadata: {
          phase: "s13",
          human_accountable: true,
          final_decision_not_ai: true
        }
      })
      .eq("tenant_id", tenantId)
      .eq("id", id)
  );

  revalidateAi();
}

async function getSetting(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, capability: AiAssistantCapability): Promise<AiSetting & { label: string }> {
  const { data, error } = await supabase
    .from("tenant_ai_assistant_settings")
    .select("capability, label, enabled, mode, provider, model, prompt_version, allowed_context_level, sensitive_data_review_status")
    .eq("tenant_id", tenantId)
    .eq("capability", capability)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      capability,
      label: aiCapabilityLabel(capability),
      enabled: false,
      mode: "disabled",
      provider: "openai",
      model: defaultAiModel(),
      prompt_version: "s13-v1",
      allowed_context_level: "minimal",
      sensitive_data_review_status: "pending"
    };
  }

  return data as AiSetting & { label: string };
}

function getSettingBlocker(setting: AiSetting) {
  if (!setting.enabled || setting.mode === "disabled") {
    return "Deze AI-capability staat uit voor deze tenant.";
  }

  if (setting.sensitive_data_review_status !== "approved") {
    return "Sensitive data review is nog niet goedgekeurd voor deze AI-capability.";
  }

  return null;
}

async function insertSuggestion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    tenantId: string;
    profileId: string;
    setting: AiSetting & { label: string };
    capability: AiAssistantCapability;
    subjectType: string | null;
    subjectId: string | null;
    sourceEngineKey: string | null;
    smartDecisionId: string | null;
    sourceContext: string;
    sourceOfTruth: Record<string, unknown>;
    goal: string;
    status: "drafted" | "blocked" | "failed";
    outputText: string | null;
    errorMessage: string | null;
    promptSnapshot: Record<string, unknown>;
    redactionSummary: Record<string, unknown>;
  }
) {
  await throwOnError(
    supabase.from("ai_assistant_suggestions").insert({
      tenant_id: input.tenantId,
      capability: input.capability,
      subject_type: input.subjectType,
      subject_id: uuidOrNull(input.subjectId),
      source_engine_key: input.sourceEngineKey,
      smart_decision_id: uuidOrNull(input.smartDecisionId),
      provider: input.setting.provider,
      model: input.setting.model,
      prompt_version: input.setting.prompt_version,
      suggestion_label: "AI-suggestie",
      status: input.status,
      input_snapshot: {
        source_context: input.sourceContext,
        goal: input.goal,
        subject_type: input.subjectType,
        subject_id: input.subjectId,
        admin_supplied_context: true
      },
      source_of_truth: {
        ...input.sourceOfTruth,
        ai_not_source_of_truth: true,
        human_review_required: true
      },
      prompt_snapshot: input.promptSnapshot,
      redaction_summary: input.redactionSummary,
      output_text: input.outputText,
      error_message: input.errorMessage,
      created_by_profile_id: input.profileId,
      metadata: {
        phase: "s13",
        editable_output: true,
        suggestion_only: true,
        sensitive_data_review_status: input.setting.sensitive_data_review_status,
        mode: input.setting.mode
      }
    })
  );
}

async function requireTenantAiUser() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canUse = context.activeTenant.roles.some((role) => tenantAiRoles.includes(role as (typeof tenantAiRoles)[number]));

  if (!canUse) {
    throw new Error("Je hebt geen rechten om de AI-assistent te gebruiken.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

async function requireTenantAiAdmin() {
  const selection = await getActiveTenantSelection();
  const context = await getTrustedAuthContext(selection);

  if (context.status !== "authenticated" || !context.activeTenant) {
    throw new Error("Geen actieve tenant gevonden.");
  }

  const canManage = context.activeTenant.roles.some((role) => tenantAiAdminRoles.includes(role as (typeof tenantAiAdminRoles)[number]));

  if (!canManage) {
    throw new Error("Je hebt geen rechten om AI-instellingen te beheren.");
  }

  if (!getSupabasePublicConfig()) {
    throw new Error("Supabase is niet geconfigureerd.");
  }

  return {
    supabase: await createClient(),
    tenantId: context.activeTenant.tenantId,
    profileId: context.user.id
  };
}

function revalidateAi() {
  for (const path of ["/admin", "/admin/ai-assistent"]) {
    revalidatePath(path);
  }
}

async function throwOnError(builder: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await builder;

  if (error) {
    throw new Error(error.message);
  }
}

function capabilityValue(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!isAiAssistantCapability(value)) {
    throw new Error(`${key} is geen geldige AI-capability.`);
  }

  return value;
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

function boolValue(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function jsonObjectValue(formData: FormData, key: string) {
  const raw = optionalString(formData, key);

  if (!raw) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${key} moet een JSON-object zijn.`);
  }

  return parsed as Record<string, unknown>;
}

function uuidOrNull(value: string | null) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
