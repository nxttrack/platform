"use client";

import { AlertTriangle, Users, Waves } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

import { StatusPill } from "@/components/shell/ui";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PlanningDayBoardRow = {
  available: number;
  capacity: number;
  catchUpHolds: number;
  endsAt: string;
  groupName: string;
  id: string;
  instructorNames: string[];
  notes: string;
  resourceName: string;
  startsAt: string;
  status: "available" | "full" | "over_capacity";
  used: number;
};

export function PlanningDayBoard({ days }: { days: Array<{ key: string; label: string; sessions: PlanningDayBoardRow[] }> }) {
  const [detail, setDetail] = useState<PlanningDayBoardRow | null>(null);

  return (
    <>
      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {days.map((day) => (
          <section className="flex h-64 flex-col rounded-xl border border-border bg-card p-3 shadow-soft" key={day.key}>
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2 px-1">
              <h3 className="text-sm font-bold text-foreground">{day.label}</h3>
              <StatusPill tone={day.sessions.some((session) => session.status === "over_capacity") ? "danger" : "neutral"}>{day.sessions.length} lessen</StatusPill>
            </div>
            <div
              aria-label={day.sessions.length > 3 ? `Lessen op ${day.label}` : undefined}
              className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto overscroll-contain pr-1"
              role={day.sessions.length > 3 ? "region" : undefined}
              tabIndex={day.sessions.length > 3 ? 0 : undefined}
            >
              {day.sessions.map((session) => (
                <button
                  className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-transparent bg-muted/45 px-3 py-2 text-left transition hover:border-primary/20 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={session.id}
                  onClick={() => setDetail(session)}
                  type="button"
                >
                  <span className="w-12 shrink-0 text-xs font-bold tabular-nums text-foreground">{formatTime(session.startsAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{session.groupName}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{session.resourceName} · {session.instructorNames.join(", ") || "geen instructeur"}</span>
                  </span>
                  <StatusPill tone={session.status === "available" ? "success" : session.status === "full" ? "warning" : "danger"}>{session.used}/{session.capacity}</StatusPill>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {detail ? (
        <DetailsSheet description={`${formatDateTime(detail.startsAt)} · ${detail.resourceName}`} onOpenChange={(open) => { if (!open) setDetail(null); }} open title={detail.groupName}>
          <Tabs defaultValue="overview">
            <TabsList className="justify-start">
              <TabsTrigger className="flex-none" value="overview">Overzicht</TabsTrigger>
              <TabsTrigger className="flex-none" value="capacity">Capaciteit</TabsTrigger>
              <TabsTrigger className="flex-none" value="instructor">Instructeur</TabsTrigger>
              <TabsTrigger className="flex-none" value="conflicts">Conflicten</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <DetailGrid entries={[["Start", formatDateTime(detail.startsAt)], ["Einde", formatDateTime(detail.endsAt)], ["Resource", detail.resourceName], ["Notitie", detail.notes || "Geen notitie"]]} />
            </TabsContent>
            <TabsContent value="capacity">
              <div className="grid gap-4">
                <DetailGrid entries={[["Bezetting", `${detail.used} van ${detail.capacity}`], ["Beschikbaar", String(detail.available)], ["Inhaalreserveringen", String(detail.catchUpHolds)]]} />
                <Progress value={detail.capacity ? Math.min(100, (detail.used / detail.capacity) * 100) : 0} />
                <Link className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground" href={`/admin/agenda?marketplace=${detail.id}#makeup-marketplace`}>
                  Open Inhaalmarktplaats
                </Link>
              </div>
            </TabsContent>
            <TabsContent value="instructor">
              <div className="rounded-xl border border-border bg-muted/40 p-4"><Users className="size-4 text-primary" /><p className="mt-3 text-[13px] font-semibold">{detail.instructorNames.join(", ") || "Nog geen instructeur gekoppeld"}</p></div>
            </TabsContent>
            <TabsContent value="conflicts">
              {detail.status === "over_capacity" ? <p className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/5 p-4 text-[13px] font-semibold text-danger"><AlertTriangle className="mt-0.5 size-4 shrink-0" />Deze les is over capaciteit. Herplan of verlaag de bezetting.</p> : <p className="flex items-start gap-2 rounded-xl border border-success/20 bg-success/5 p-4 text-[13px] font-semibold text-success"><Waves className="mt-0.5 size-4 shrink-0" />Geen capaciteitsconflict voor deze les.</p>}
            </TabsContent>
          </Tabs>
        </DetailsSheet>
      ) : null}
    </>
  );
}

function DetailGrid({ entries }: { entries: Array<[string, string]> }) {
  return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([label, value]) => <div className="rounded-lg border border-border bg-muted/45 p-3" key={label}><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-1 text-[13px] font-medium text-foreground">{value}</dd></div>)}</dl>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
