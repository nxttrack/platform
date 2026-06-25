import "server-only";

import { logError, logInfo, logWarn } from "@/lib/observability/logger";

export const aiAssistantCapabilities = [
  "intake_summary",
  "admin_explanation",
  "parent_message_draft",
  "progress_note_rewrite",
  "report_insight",
  "risk_signal_summary"
] as const;

export type AiAssistantCapability = (typeof aiAssistantCapabilities)[number];
export type AiAssistantStatus = "drafted" | "blocked" | "failed";

export type AiAssistantGenerationInput = {
  tenantId: string;
  profileId: string;
  capability: AiAssistantCapability;
  capabilityLabel: string;
  promptVersion: string;
  model: string;
  sourceContext: string;
  goal: string;
  subjectType?: string | null;
  subjectId?: string | null;
  sourceOfTruth?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export type AiAssistantGenerationResult = {
  status: AiAssistantStatus;
  provider: "openai";
  model: string;
  promptSnapshot: Record<string, unknown>;
  outputText: string | null;
  errorMessage: string | null;
  redactionSummary: Record<string, unknown>;
};

type OpenAIResponsePayload = {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: unknown;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export function isAiAssistantCapability(value: string | null | undefined): value is AiAssistantCapability {
  return aiAssistantCapabilities.includes(value as AiAssistantCapability);
}

export function aiCapabilityLabel(capability: AiAssistantCapability) {
  return aiCapabilityDefinitions[capability].label;
}

export function aiCapabilityDescription(capability: AiAssistantCapability) {
  return aiCapabilityDefinitions[capability].description;
}

export function defaultAiModel() {
  return process.env.OPENAI_MODEL || process.env.AI_ASSISTANT_MODEL || "gpt-4.1-mini";
}

export async function generateAiSuggestion(input: AiAssistantGenerationInput): Promise<AiAssistantGenerationResult> {
  const config = getAiProviderConfig(input.model);
  const prompt = buildPrompt(input);
  const redactionSummary = createRedactionSummary(input.sourceContext);

  if (!config.enabled) {
    logWarn("AI assistant generation blocked: feature disabled", {
      tenant_id: input.tenantId,
      capability: input.capability
    });

    return {
      status: "blocked",
      provider: "openai",
      model: config.model,
      promptSnapshot: prompt.snapshot,
      outputText: null,
      errorMessage: "AI-assistent staat server-side uit. Zet AI_ASSISTANT_ENABLED=true en configureer OPENAI_API_KEY.",
      redactionSummary
    };
  }

  if (!config.apiKey) {
    logWarn("AI assistant generation blocked: OpenAI API key missing", {
      tenant_id: input.tenantId,
      capability: input.capability
    });

    return {
      status: "blocked",
      provider: "openai",
      model: config.model,
      promptSnapshot: prompt.snapshot,
      outputText: null,
      errorMessage: "OPENAI_API_KEY is niet geconfigureerd.",
      redactionSummary
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        instructions: prompt.instructions,
        input: prompt.input,
        max_output_tokens: 700,
        temperature: 0.2,
        store: config.storeResponses,
        safety_identifier: `tenant:${input.tenantId}:profile:${input.profileId}`
      }),
      signal: controller.signal
    });

    const payload = (await response.json()) as OpenAIResponsePayload;

    if (!response.ok) {
      const message = payload.error?.message ?? `OpenAI request failed with status ${response.status}.`;
      throw new Error(message);
    }

    const outputText = extractOutputText(payload);

    if (!outputText) {
      throw new Error("OpenAI response bevatte geen tekstoutput.");
    }

    logInfo("AI assistant suggestion drafted", {
      tenant_id: input.tenantId,
      capability: input.capability,
      model: config.model
    });

    return {
      status: "drafted",
      provider: "openai",
      model: config.model,
      promptSnapshot: prompt.snapshot,
      outputText,
      errorMessage: null,
      redactionSummary
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI generation failed.";
    logError("AI assistant generation failed", {
      tenant_id: input.tenantId,
      capability: input.capability,
      error: message
    });

    return {
      status: "failed",
      provider: "openai",
      model: config.model,
      promptSnapshot: prompt.snapshot,
      outputText: null,
      errorMessage: message,
      redactionSummary
    };
  } finally {
    clearTimeout(timeout);
  }
}

function getAiProviderConfig(model: string) {
  return {
    enabled: process.env.AI_ASSISTANT_ENABLED === "true",
    apiKey: process.env.OPENAI_API_KEY,
    model: model || defaultAiModel(),
    storeResponses: process.env.AI_ASSISTANT_STORE_RESPONSES === "true",
    timeoutMs: numberFromEnv("AI_ASSISTANT_TIMEOUT_MS", 12000, 1000, 30000)
  };
}

function buildPrompt(input: AiAssistantGenerationInput) {
  const definition = aiCapabilityDefinitions[input.capability];
  const instructions = [
    "Je bent de AI-assistent van NXTTRACK.",
    "Je helpt admins sneller en duidelijker werken, maar je neemt nooit een beslissing.",
    "Alle output moet expliciet als suggestie bruikbaar zijn en door een mens bewerkt kunnen worden.",
    "Gebruik alleen de meegegeven context. Als informatie ontbreekt, benoem dat kort.",
    "Geef geen interne scores of technische details aan ouders.",
    "Schrijf helder Nederlands, professioneel en menselijk."
  ].join("\n");

  const body = [
    `Capability: ${definition.label}`,
    `Doel: ${input.goal || definition.defaultGoal}`,
    `Niet doen: ${definition.notAllowed}`,
    "",
    "Broncontext:",
    input.sourceContext.trim() || "Geen broncontext meegegeven.",
    "",
    "Gewenste output:",
    definition.outputInstruction
  ].join("\n");

  return {
    instructions,
    input: body,
    snapshot: {
      prompt_version: input.promptVersion,
      capability: input.capability,
      goal: input.goal || definition.defaultGoal,
      source_context_length: input.sourceContext.length,
      output_instruction: definition.outputInstruction,
      suggestion_only: true,
      human_accountability_required: true,
      metadata: input.metadata ?? {}
    }
  };
}

function extractOutputText(payload: OpenAIResponsePayload) {
  if (typeof payload.output_text === "string") {
    return payload.output_text.trim();
  }

  const parts = payload.output?.flatMap((item) => item.content ?? []).flatMap((content) => {
    return content.type === "output_text" && typeof content.text === "string" ? [content.text] : [];
  });

  return parts?.join("\n").trim() ?? "";
}

function createRedactionSummary(sourceContext: string) {
  return {
    context_length: sourceContext.length,
    likely_email_present: /[^\s@]+@[^\s@]+\.[^\s@]+/.test(sourceContext),
    likely_phone_present: /(?:\+?\d[\d\s().-]{7,}\d)/.test(sourceContext),
    policy: "Admin-provided context. Sensitive data review is required before tenant activation."
  };
}

function numberFromEnv(key: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[key] ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

const aiCapabilityDefinitions: Record<
  AiAssistantCapability,
  {
    label: string;
    description: string;
    defaultGoal: string;
    outputInstruction: string;
    notAllowed: string;
  }
> = {
  intake_summary: {
    label: "Intake samenvatting",
    description: "Vat intake-antwoorden samen voor admin review.",
    defaultGoal: "Maak een korte admin-samenvatting met ontbrekende informatie en voorgestelde vervolgvraag.",
    outputInstruction: "Geef 4 bullets: samenvatting, aandachtspunten, ontbrekende info, voorgestelde volgende stap.",
    notAllowed: "Geen stage of plaatsing definitief bepalen."
  },
  admin_explanation: {
    label: "Admin uitleg",
    description: "Leg een rules-based smart decision begrijpelijk uit.",
    defaultGoal: "Maak de bestaande rules-based aanbeveling begrijpelijker voor een admin.",
    outputInstruction: "Geef een korte uitleg met redenen, blockers en wat de admin moet controleren.",
    notAllowed: "Geen nieuwe score verzinnen en geen beslissing overnemen."
  },
  parent_message_draft: {
    label: "Ouderbericht concept",
    description: "Maak een bewerkbaar berichtconcept voor ouders.",
    defaultGoal: "Schrijf een vriendelijke oudertekst op basis van de menselijke workflowstatus.",
    outputInstruction: "Schrijf een conceptbericht met onderwerpregel en berichttekst. Houd het warm, kort en duidelijk.",
    notAllowed: "Geen toezeggingen over plek, betaling of diploma doen tenzij ze expliciet in de broncontext staan."
  },
  progress_note_rewrite: {
    label: "Voortgangstekst herschrijven",
    description: "Herschrijf ruwe instructeursnotities naar oudervriendelijke tekst.",
    defaultGoal: "Maak van ruwe voortgangsnotities een positieve oudervriendelijke tekst.",
    outputInstruction: "Geef een korte oudertekst met compliment, observatie en volgende focus.",
    notAllowed: "Geen medisch advies en geen harde diploma-belofte."
  },
  report_insight: {
    label: "Rapportage inzicht",
    description: "Vat rapportagecontext samen als managementinzicht.",
    defaultGoal: "Vat operationele rapportagepunten samen voor de tenant admin.",
    outputInstruction: "Geef 3 inzichten en 3 concrete acties voor vandaag of deze week.",
    notAllowed: "Geen voorspellingen presenteren als feit."
  },
  risk_signal_summary: {
    label: "Risicosignalen samenvatten",
    description: "Bundel blockers en attention signals tot een actielijst.",
    defaultGoal: "Maak een prioriteitenlijst van signalen die admin-aandacht nodig hebben.",
    outputInstruction: "Geef prioriteit, reden, impact en voorgestelde actie per signaal.",
    notAllowed: "Geen automatische workflow uitvoeren."
  }
};
