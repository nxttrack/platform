import { AlertTriangle, BarChart3, Lightbulb } from "lucide-react";

import { WaitTimeChip } from "@/components/public/wait-time-chip";
import type { WaitTimePrediction } from "@/lib/domain/wait-time-contract";

export function WaitTimeInsight({
  compact = false,
  prediction
}: {
  compact?: boolean;
  prediction: WaitTimePrediction;
}) {
  const confidence = Math.round(prediction.confidence * 100);

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <WaitTimeChip band={prediction.band} />
        <span className="text-[11px] font-semibold text-muted-foreground">
          {prediction.sample_size > 0 ? `${confidence}% confidence · ${prediction.sample_size} plaatsingen` : `${confidence}% confidence`}
        </span>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-muted/25 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Voorspelde wachttijd</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WaitTimeChip band={prediction.band} />
            <span className="text-xs font-semibold text-muted-foreground">{confidence}% confidence</span>
          </div>
        </div>
        <div className="rounded-lg bg-background px-3 py-2 text-right shadow-soft">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brondata</p>
          <p className="mt-0.5 text-sm font-bold text-foreground">{prediction.sample_size} plaatsingen</p>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-5 text-foreground">{prediction.admin_explanation}</p>

      {prediction.sample_size < 8 ? (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Beperkte historische basis. Gebruik deze band als operationeel signaal, niet als belofte.
        </p>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {prediction.reasons.slice(0, 4).map((reason) => (
          <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground" key={reason}>
            <BarChart3 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
            {reason}
          </p>
        ))}
      </div>

      {prediction.suggested_alternatives.length > 0 ? (
        <div className="mt-3 rounded-lg border border-primary/15 bg-primary/5 p-3">
          <p className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Lightbulb className="size-4 text-primary" aria-hidden="true" />
            Mogelijk sneller
          </p>
          <ul className="mt-1.5 grid gap-1 text-xs leading-5 text-muted-foreground">
            {prediction.suggested_alternatives.map((alternative) => (
              <li key={`${alternative.preferredDay}-${alternative.preferredTimeBlock}-${alternative.locationId}`}>
                {alternative.reason}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
