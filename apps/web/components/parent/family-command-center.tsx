"use client";

import { Award, CalendarDays, CheckCircle2, ChevronRight, Sparkles, TrendingUp, Waves } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export type FamilyChild = {
  id: string;
  name: string;
  program: string;
  stage: string;
  group: string;
  nextLesson: string | null;
  progressPercent: number;
  timeline: Array<{ date: string; detail: string; kind: "badge" | "lesson" | "progress"; title: string }>;
};

export function FamilyCommandCenter({ children }: { children: FamilyChild[] }) {
  const [selectedId, setSelectedId] = useState(children[0]?.id ?? "");
  const child = children.find((item) => item.id === selectedId) ?? children[0];
  if (!child) return null;

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
      <div className="border-b border-border bg-gradient-to-r from-aqua-soft via-card to-primary/5 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Familieoverzicht</p>
        <div className="mt-3 flex snap-x gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Kies een kind">
          {children.map((item) => <button aria-selected={item.id === child.id} className={cn("min-h-12 shrink-0 snap-start rounded-xl border px-4 text-left text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", item.id === child.id ? "border-primary bg-primary text-primary-foreground shadow-glow" : "border-border bg-background text-foreground hover:bg-muted")} key={item.id} onClick={() => setSelectedId(item.id)} role="tab" type="button">{item.name}<span className={cn("ml-2 text-xs", item.id === child.id ? "font-semibold text-primary-foreground" : "font-normal text-muted-foreground")}>{item.stage}</span></button>)}
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
          <h2 className="text-2xl font-bold text-foreground">{child.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{child.program} · {child.group}</p>
          <div className="mt-5 rounded-2xl bg-primary/5 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><Sparkles className="size-4" />Eerstvolgende actie</p>
            <p className="mt-2 text-lg font-bold text-foreground">{child.nextLesson ? "Klaar voor de volgende les" : "Planning wordt aangevuld"}</p>
            <p className="mt-1 text-sm text-muted-foreground">{child.nextLesson ?? "Je ontvangt een melding zodra een nieuwe les is gepland."}</p>
            <Link className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground sm:w-auto" href="/portaal/lessen">Bekijk lessen<ChevronRight className="size-4" /></Link>
          </div>
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm"><span className="font-semibold text-foreground">Voortgang {child.stage}</span><span className="font-bold text-primary">{child.progressPercent}%</span></div>
            <Progress className="mt-2" value={child.progressPercent} aria-label={`Voortgang ${child.progressPercent} procent`} />
          </div>
        </div>

        <div className="p-4 sm:p-5" role="tabpanel">
          <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Tijdlijn</p><h3 className="mt-1 text-lg font-bold text-foreground">Recente ontwikkeling</h3></div><Link className="text-sm font-semibold text-primary hover:underline" href="/portaal/voortgang">Alles bekijken</Link></div>
          <ol className="mt-4 grid gap-1">
            {child.timeline.length ? child.timeline.slice(0, 5).map((event, index) => { const Icon = event.kind === "badge" ? Award : event.kind === "progress" ? TrendingUp : CalendarDays; return <li className="relative grid grid-cols-[40px_1fr] gap-3 pb-4" key={`${event.kind}-${event.date}-${index}`}><div className="relative z-10 grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" /></div>{index < child.timeline.length - 1 ? <span className="absolute bottom-0 left-5 top-10 w-px bg-border" /> : null}<div className="pt-0.5"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-bold text-foreground">{event.title}</p><time className="text-xs text-muted-foreground">{formatDate(event.date)}</time></div><p className="mt-1 text-sm leading-6 text-muted-foreground">{event.detail}</p></div></li>; }) : <li className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground"><Waves className="mb-3 size-5 text-primary" />De tijdlijn vult zich na de eerste les of beoordeling.</li>}
          </ol>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm font-semibold text-foreground"><CheckCircle2 className="size-4 text-success" />Alle updates staan veilig per kind gescheiden.</div>
        </div>
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" }).format(new Date(value));
}
