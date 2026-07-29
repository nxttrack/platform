export type ShadowEvaluationStatus = "within" | "approaching" | "exceeded" | "not_measured";

export type ShadowEntitlementEvaluation = {
  allowed: true;
  wouldAllow: boolean;
  mode: "shadow";
  status: ShadowEvaluationStatus;
  headline: string;
  reasons: string[];
  sources: Array<{ label: string; value: string }>;
};

export function evaluateShadowEntitlement(input: {
  featureIncluded?: boolean;
  featureName?: string;
  metricLabel?: string;
  observedValue?: number;
  softLimit?: number | null;
  unit?: "count" | "gigabytes";
}): ShadowEntitlementEvaluation {
  const featureIncluded = input.featureIncluded ?? true;
  const hasLimit = typeof input.softLimit === "number" && input.softLimit > 0;
  const hasUsage = typeof input.observedValue === "number" && input.observedValue >= 0;
  const ratio = hasLimit && hasUsage ? input.observedValue! / input.softLimit! : null;
  const status: ShadowEvaluationStatus = ratio === null
    ? "not_measured"
    : ratio > 1
      ? "exceeded"
      : ratio >= 0.8
        ? "approaching"
        : "within";
  const wouldAllow = featureIncluded && status !== "exceeded";
  const reasons: string[] = [];

  if (!featureIncluded) {
    reasons.push(`${input.featureName ?? "Deze functie"} valt buiten het gekozen simulatiepakket.`);
  } else if (input.featureName) {
    reasons.push(`${input.featureName} is opgenomen in het gekozen simulatiepakket.`);
  }

  if (!hasLimit) {
    reasons.push("Voor deze metriek is geen zachte pakketlimiet ingesteld.");
  } else if (hasUsage) {
    const unit = input.unit === "gigabytes" ? "GB" : "";
    reasons.push(`${input.metricLabel ?? "Gebruik"}: ${formatNumber(input.observedValue!)}${unit ? ` ${unit}` : ""} van ${formatNumber(input.softLimit!)}${unit ? ` ${unit}` : ""}.`);
  }

  reasons.push("Shadow mode meet alleen: toegang blijft volledig beschikbaar.");

  return {
    allowed: true,
    wouldAllow,
    mode: "shadow",
    status,
    headline: shadowHeadline(status, featureIncluded),
    reasons,
    sources: [
      { label: "Evaluatiemodus", value: "Shadow — geen handhaving" },
      { label: "Pakketsimulatie", value: featureIncluded ? "Opgenomen" : "Niet opgenomen" },
      ...(hasLimit && hasUsage
        ? [{ label: input.metricLabel ?? "Gemeten gebruik", value: `${formatNumber(input.observedValue!)} / ${formatNumber(input.softLimit!)}` }]
        : [])
    ]
  };
}

export function summarizeShadowLimits(
  evaluations: ShadowEntitlementEvaluation[]
): ShadowEvaluationStatus {
  if (evaluations.some((evaluation) => evaluation.status === "exceeded")) return "exceeded";
  if (evaluations.some((evaluation) => evaluation.status === "approaching")) return "approaching";
  if (evaluations.some((evaluation) => evaluation.status === "within")) return "within";
  return "not_measured";
}

function shadowHeadline(status: ShadowEvaluationStatus, featureIncluded: boolean) {
  if (!featureIncluded) return "Buiten pakket — toegang blijft actief";
  if (status === "exceeded") return "Zachte limiet overschreden — geen blokkade";
  if (status === "approaching") return "Zachte limiet nadert";
  if (status === "within") return "Binnen de zachte limiet";
  return "Volledige toegang — nog geen limiet";
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);
}
