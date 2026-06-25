import { getLogSinkConfig } from "@/lib/observability/config";
import { getReleaseMetadata } from "@/lib/observability/release";

type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

type StructuredLogPayload = {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
  environment: string;
  commit: string | null;
  release: ReturnType<typeof getReleaseMetadata>;
} & LogContext;

export function logInfo(message: string, context: LogContext = {}) {
  writeLog("info", message, context);
}

export function logWarn(message: string, context: LogContext = {}) {
  writeLog("warn", message, context);
}

export function logError(message: string, context: LogContext = {}) {
  writeLog("error", message, context);
}

function writeLog(level: LogLevel, message: string, context: LogContext) {
  const release = getReleaseMetadata();
  const payload = {
    level,
    message,
    service: "nxttrack-platform",
    timestamp: new Date().toISOString(),
    environment: release.environment,
    commit: release.commit,
    release,
    ...context
  } satisfies StructuredLogPayload;

  const serialized = JSON.stringify(payload);
  sendToExternalSink(payload);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
}

function sendToExternalSink(payload: StructuredLogPayload) {
  const config = getLogSinkConfig();

  if (!config.url || typeof fetch !== "function") {
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  void fetch(config.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(config.token ? { authorization: `Bearer ${config.token}` } : {})
    },
    body: JSON.stringify({
      provider: config.provider,
      event_type: "structured_log",
      ...payload
    }),
    signal: controller.signal
  })
    .catch(() => undefined)
    .finally(() => clearTimeout(timeout));
}
