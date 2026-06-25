type LogLevel = "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

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
  const payload = {
    level,
    message,
    service: "nxttrack-platform",
    timestamp: new Date().toISOString(),
    environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    commit: process.env.COMMIT_SHA ?? process.env.GITHUB_SHA ?? null,
    ...context
  };

  const serialized = JSON.stringify(payload);

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
