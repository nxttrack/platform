import { Activity, FlaskConical } from "lucide-react";

import { StatusPill } from "@/components/shell/ui";
import {
  smartEventDescription,
  smartEventLabel,
  type SmartActivityItem,
  type SmartEventSeverity
} from "@/lib/domain/smart-event-contract";

export function ActivityTimeline({
  events,
  emptyMessage = "Nog geen slimme activiteit voor dit dossier."
}: {
  events: SmartActivityItem[];
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
        <Activity className="mb-3 size-5 text-primary" aria-hidden="true" />
        {emptyMessage}
      </div>
    );
  }

  return (
    <ol aria-label="Activiteit" className="grid gap-1">
      {events.map((event, index) => (
        <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 pb-4" key={event.id}>
          <span className="relative z-10 grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Activity className="size-4" aria-hidden="true" />
          </span>
          {index < events.length - 1 ? <span aria-hidden="true" className="absolute bottom-0 left-4 top-8 w-px bg-border" /> : null}
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <p className="font-semibold text-foreground">{smartEventLabel(event.eventType)}</p>
                <StatusPill tone={severityTone(event.severity)}>{severityLabel(event.severity)}</StatusPill>
                {event.isTest ? <StatusPill tone="info"><FlaskConical className="mr-1 size-3" aria-hidden="true" />Journey Bot</StatusPill> : null}
              </div>
              <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
            </div>
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{smartEventDescription(event)}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/80">Bron: {sourceLabel(event.source)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function severityTone(severity: SmartEventSeverity) {
  return severity === "critical" || severity === "error" ? "danger" : severity === "warning" ? "warning" : "info";
}

function severityLabel(severity: SmartEventSeverity) {
  return ({ critical: "Kritiek", error: "Fout", warning: "Let op", info: "Info" } as const)[severity];
}

function sourceLabel(source: string) {
  return (
    {
      data_quality_assistant: "Data Quality Assistant",
      database_trigger: "Domeinactie",
      signal_sweep: "Signaalcontrole",
      journey_simulation_bot: "Journey Bot",
      placement: "Plaatsing",
      billing: "Betalingen",
      planning: "Planning",
      public_intake: "Publieke intake"
    } as Record<string, string>
  )[source] ?? source.replaceAll("_", " ");
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
