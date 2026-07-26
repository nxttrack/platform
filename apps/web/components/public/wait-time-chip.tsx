import { Clock3 } from "lucide-react";

import { waitTimeLabels, type WaitTimeBand } from "@/lib/domain/intake-recommendation-contract";
import { cn } from "@/lib/utils";

const waitTimeStyles: Record<WaitTimeBand, string> = {
  short: "border-emerald-200 bg-emerald-50 text-emerald-800",
  medium: "border-orange-200 bg-orange-50 text-orange-800",
  long: "border-rose-200 bg-rose-50 text-rose-800"
};

export function WaitTimeChip({ band, className }: { band: WaitTimeBand; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", waitTimeStyles[band], className)}>
      <Clock3 aria-hidden="true" className="size-3.5" />
      {waitTimeLabels[band]}
    </span>
  );
}
