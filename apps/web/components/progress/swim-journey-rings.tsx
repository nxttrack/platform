import { ProgressRing } from "@/components/shell/ui";
import type { SwimJourneyRing } from "@/lib/domain/swim-progress";
import { cn } from "@/lib/utils";

export function SwimJourneyRings({
  compact = false,
  rings,
  className
}: {
  compact?: boolean;
  rings: SwimJourneyRing[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start gap-4", className)} data-formula-version="swim_progress_v3">
      {rings.map((ring) => (
        <div className="flex min-w-28 flex-col items-center text-center" key={`${ring.kind}:${ring.key}`}>
          <ProgressRing
            label={ring.kind === "stage" ? "badje" : "diploma"}
            size={compact ? 88 : 104}
            value={ring.progressPercent}
          />
          <p className="mt-2 max-w-36 text-sm font-bold text-foreground">{ring.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ring.assessedCount} van {ring.contributingCount} beoordeeld · {formatPercent(ring.coveragePercent)} dekking
          </p>
        </div>
      ))}
    </div>
  );
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(value) + "%";
}
