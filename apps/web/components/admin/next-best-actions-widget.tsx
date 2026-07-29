import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import type { NextBestActionRow } from "@/lib/domain/next-best-actions";
import { nextBestActionTypeLabels } from "@/lib/domain/next-best-actions-contract";

export function NextBestActionsWidget({ actions }: { actions: NextBestActionRow[] }) {
  return (
    <section className="rounded-xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
            <Sparkles className="size-4" aria-hidden="true" />
            Next Best Action
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground">Vandaag belangrijk</h2>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">Adviezen met redenen en brondata; geen automatische besluiten.</p>
        </div>
        <Link className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted" href="/admin/automatisering/acties">
          Alle acties
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      {actions.length > 0 ? (
        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {actions.slice(0, 6).map((action) => (
            <Link className="group rounded-xl border border-border bg-background p-3 transition hover:border-primary/30 hover:shadow-soft" href="/admin/automatisering/acties" key={action.id}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{nextBestActionTypeLabels[action.action_type]}</p>
                  <p className="mt-1 text-[13px] font-bold text-foreground group-hover:text-primary">{action.title}</p>
                </div>
                <StatusPill tone={action.priority === "high" ? "danger" : action.priority === "medium" ? "warning" : "neutral"}>
                  {action.priority === "high" ? "Hoog" : action.priority === "medium" ? "Middel" : "Laag"}
                </StatusPill>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{action.reasons_json[0]?.evidence ?? action.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-background/70 px-4 py-5 text-center text-[13px] text-muted-foreground">
          Geen open actievoorstellen. De dagelijkse generator vult dit overzicht zodra er relevante signalen zijn.
        </p>
      )}
    </section>
  );
}
