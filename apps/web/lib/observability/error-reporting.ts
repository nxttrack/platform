import { logError } from "@/lib/observability/logger";

type ErrorReportContext = Record<string, unknown>;

export function reportServerError(error: unknown, context: ErrorReportContext = {}) {
  logError(error instanceof Error ? error.message : String(error), {
    errorName: error instanceof Error ? error.name : "UnknownError",
    errorStack: error instanceof Error ? error.stack : null,
    ...context
  });
}
