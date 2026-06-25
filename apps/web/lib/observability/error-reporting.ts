import { getErrorReportingConfig } from "@/lib/observability/config";
import { logError } from "@/lib/observability/logger";
import { getReleaseMetadata } from "@/lib/observability/release";

type ErrorReportContext = Record<string, unknown>;

export function reportServerError(error: unknown, context: ErrorReportContext = {}) {
  const normalized = normalizeError(error);

  logError(error instanceof Error ? error.message : String(error), {
    errorName: normalized.name,
    errorStack: normalized.stack,
    ...context
  });

  sendErrorReport(normalized, context);
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
    stack: null
  };
}

function sendErrorReport(error: { name: string; message: string; stack: string | null }, context: ErrorReportContext) {
  const config = getErrorReportingConfig();

  if (!config.url || typeof fetch !== "function") {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  void fetch(config.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.token ? { authorization: `Bearer ${config.token}` } : {})
    },
    body: JSON.stringify({
      provider: config.provider,
      event_type: "server_error",
      service: "nxttrack-platform",
      timestamp: new Date().toISOString(),
      release: getReleaseMetadata(),
      error,
      context
    }),
    signal: controller.signal
  })
    .catch(() => undefined)
    .finally(() => clearTimeout(timeout));
}
