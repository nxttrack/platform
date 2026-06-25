export type ObservabilityRuntimeStatus = {
  logSink: {
    configured: boolean;
    provider: string;
    endpointHost: string | null;
  };
  errorReporting: {
    configured: boolean;
    provider: string;
    endpointHost: string | null;
  };
  uptime: {
    healthPath: string;
    readyPath: string;
    externalMonitorUrl: string | null;
    externalMonitorConfigured: boolean;
  };
};

export function getObservabilityRuntimeStatus(): ObservabilityRuntimeStatus {
  return {
    logSink: {
      configured: Boolean(process.env.OBSERVABILITY_LOG_SINK_URL),
      provider: process.env.OBSERVABILITY_LOG_SINK_PROVIDER ?? "generic_http",
      endpointHost: redactUrlHost(process.env.OBSERVABILITY_LOG_SINK_URL)
    },
    errorReporting: {
      configured: Boolean(process.env.ERROR_REPORTING_URL),
      provider: process.env.ERROR_REPORTING_PROVIDER ?? "generic_http",
      endpointHost: redactUrlHost(process.env.ERROR_REPORTING_URL)
    },
    uptime: {
      healthPath: "/api/health",
      readyPath: "/api/health/ready",
      externalMonitorUrl: redactUrlHost(process.env.UPTIME_MONITOR_URL),
      externalMonitorConfigured: Boolean(process.env.UPTIME_MONITOR_URL)
    }
  };
}

export function getLogSinkConfig() {
  return {
    url: process.env.OBSERVABILITY_LOG_SINK_URL ?? null,
    token: process.env.OBSERVABILITY_LOG_SINK_TOKEN ?? null,
    provider: process.env.OBSERVABILITY_LOG_SINK_PROVIDER ?? "generic_http"
  };
}

export function getErrorReportingConfig() {
  return {
    url: process.env.ERROR_REPORTING_URL ?? null,
    token: process.env.ERROR_REPORTING_TOKEN ?? null,
    provider: process.env.ERROR_REPORTING_PROVIDER ?? "generic_http"
  };
}

function redactUrlHost(value: string | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.host;
  } catch {
    return "configured";
  }
}
