export type EmailFailureClassification = {
  code: "configuration" | "network" | "provider_4xx" | "provider_5xx" | "rate_limited" | "timeout" | "unknown";
  retryable: boolean;
};

const retryScheduleSeconds = [30, 120, 480, 1_800, 7_200] as const;

export function isEmailSendingEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function classifyEmailHttpFailure(status: number): EmailFailureClassification {
  if (status === 429) return { code: "rate_limited", retryable: true };
  if (status >= 500 && status <= 599) return { code: "provider_5xx", retryable: true };
  if (status >= 400 && status <= 499) return { code: "provider_4xx", retryable: false };
  return { code: "unknown", retryable: false };
}

export function classifyEmailTransportError(error: unknown): EmailFailureClassification {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);

  if (name === "AbortError" || name === "TimeoutError" || /timed?\s*out|timeout/i.test(message)) {
    return { code: "timeout", retryable: true };
  }

  if (error instanceof TypeError || /ECONN|ENET|EAI_AGAIN|socket|network|connection closed/i.test(message)) {
    return { code: "network", retryable: true };
  }

  return { code: "unknown", retryable: false };
}

export function emailRetryDelaySeconds(attemptNumber: number) {
  const index = Math.max(0, Math.min(retryScheduleSeconds.length - 1, Math.trunc(attemptNumber) - 1));
  return retryScheduleSeconds[index];
}
