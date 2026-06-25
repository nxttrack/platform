export type EmailProvider = "smtp" | "sendgrid" | "internal";

export type PreparedEmailEnvelope = {
  provider: EmailProvider;
  liveSendEnabled: boolean;
  dispatchStatus: "draft" | "queued";
  note: string;
};

export function prepareEmailEnvelope(provider: EmailProvider, requestedStatus: "draft" | "queued"): PreparedEmailEnvelope {
  if (provider === "sendgrid") {
    return {
      provider,
      liveSendEnabled: true,
      dispatchStatus: requestedStatus,
      note: "SendGrid API adapter is live-ready naast SMTP en wordt door dezelfde outbox worker verwerkt."
    };
  }

  if (provider === "smtp") {
    return {
      provider,
      liveSendEnabled: true,
      dispatchStatus: requestedStatus,
      note: "SMTP via SendGrid is voorbereid als eerste verzendpad; een worker verstuurt later vanuit de outbox."
    };
  }

  return {
    provider,
    liveSendEnabled: false,
    dispatchStatus: requestedStatus,
    note: "In-app bericht is voorbereid zonder externe emailprovider."
  };
}

export function extractTemplateVariables(...templates: Array<string | null | undefined>) {
  const variables = new Set<string>();
  const pattern = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

  for (const template of templates) {
    if (!template) {
      continue;
    }

    for (const match of template.matchAll(pattern)) {
      const variable = match[1];

      if (variable) {
        variables.add(variable);
      }
    }
  }

  return [...variables].sort();
}

export function validateTemplateVariables(requiredVariables: string[], context: Record<string, unknown>) {
  return requiredVariables.filter((variable) => resolveTemplateValue(context, variable) === null);
}

export function renderTemplate(template: string | null | undefined, context: Record<string, unknown>) {
  if (!template) {
    return null;
  }

  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, variable: string) => {
    return resolveTemplateValue(context, variable) ?? "";
  });
}

function resolveTemplateValue(context: Record<string, unknown>, path: string) {
  let current: unknown = context;

  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current) || !(segment in current)) {
      return null;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  if (current === null || current === undefined) {
    return null;
  }

  if (typeof current === "string") {
    return current;
  }

  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }

  return JSON.stringify(current);
}
