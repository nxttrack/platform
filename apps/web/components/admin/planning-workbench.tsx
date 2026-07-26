"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, GripVertical, Save } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { applyPlanningChangeAction } from "@/lib/domain/planning-actions";
import { cn } from "@/lib/utils";

export type PlanningBoardItem = { endsAt: string; groupName: string; id: string; resourceId: string | null; resourceName: string; startsAt: string };

export function PlanningWorkbench({ initialItems }: { initialItems: PlanningBoardItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [changedId, setChangedId] = useState<string | null>(null);
  const days = useMemo(() => [...new Set(items.map((item) => dayKey(item.startsAt)))].sort().slice(0, 7), [items]);
  const conflicts = useMemo(() => items.flatMap((item, index) => items.slice(index + 1).filter((other) => item.resourceId && item.resourceId === other.resourceId && new Date(item.startsAt) < new Date(other.endsAt) && new Date(item.endsAt) > new Date(other.startsAt)).map((other) => `${item.groupName} ↔ ${other.groupName}`)), [items]);

  function move(itemId: string, delta: number) {
    setItems((current) => current.map((item) => item.id === itemId ? { ...item, startsAt: shiftDays(item.startsAt, delta), endsAt: shiftDays(item.endsAt, delta) } : item));
    setChangedId(itemId);
  }
  function moveToDay(itemId: string, targetDay: string) {
    const item = items.find((candidate) => candidate.id === itemId); if (!item) return;
    const delta = Math.round((new Date(`${targetDay}T12:00:00`).getTime() - new Date(`${dayKey(item.startsAt)}T12:00:00`).getTime()) / 86_400_000); move(itemId, delta);
  }
  const changed = items.find((item) => item.id === changedId);

  return <div className="grid gap-4"><div className="flex flex-wrap items-center gap-3"><p className="mr-auto text-sm text-muted-foreground">Sleep een kaart of gebruik de pijlen. Pas pas toe nadat de conflictengine groen is.</p>{conflicts.length ? <span className="inline-flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1.5 text-xs font-bold text-danger"><AlertTriangle className="size-4" />{conflicts.length} simulatieconflict(en)</span> : <span className="rounded-full bg-success/10 px-3 py-1.5 text-xs font-bold text-success">Geen simulatieconflicten</span>}</div><div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${Math.max(days.length, 1)}, minmax(210px, 1fr))` }}>{days.map((day) => <section className="min-h-44 rounded-2xl border border-border bg-muted/30 p-3" key={day} onDragOver={(event) => event.preventDefault()} onDrop={(event) => moveToDay(event.dataTransfer.getData("text/session"), day)}><h3 className="mb-3 text-sm font-bold text-foreground">{formatDay(day)}</h3><div className="grid gap-2">{items.filter((item) => dayKey(item.startsAt) === day).map((item) => <article className={cn("rounded-xl border bg-card p-3 shadow-soft", changedId === item.id ? "border-primary ring-2 ring-primary/10" : "border-border")} draggable key={item.id} onDragStart={(event) => event.dataTransfer.setData("text/session", item.id)}><div className="flex items-start gap-2"><GripVertical className="mt-0.5 size-4 cursor-grab text-muted-foreground" /><div className="min-w-0 flex-1"><p className="truncate font-bold text-foreground">{item.groupName}</p><p className="mt-1 text-xs text-muted-foreground">{formatTime(item.startsAt)}–{formatTime(item.endsAt)} · {item.resourceName}</p></div></div><div className="mt-3 flex gap-1"><Button aria-label={`${item.groupName} een dag terug`} onClick={() => move(item.id, -1)} size="icon" variant="ghost"><ArrowLeft className="size-4" /></Button><Button aria-label={`${item.groupName} een dag vooruit`} onClick={() => move(item.id, 1)} size="icon" variant="ghost"><ArrowRight className="size-4" /></Button></div></article>)}</div></section>)}</div>{changed ? <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3"><p className="mr-auto text-sm font-semibold text-foreground">What-if: {changed.groupName} naar {formatDay(dayKey(changed.startsAt))}</p><Button onClick={() => { setItems(initialItems); setChangedId(null); }} variant="outline">Reset</Button><form action={applyPlanningChangeAction}><input name="sessionId" type="hidden" value={changed.id} /><input name="startsAt" type="hidden" value={changed.startsAt} /><input name="endsAt" type="hidden" value={changed.endsAt} /><input name="resourceId" type="hidden" value={changed.resourceId ?? ""} /><Button disabled={conflicts.length > 0} type="submit"><Save className="size-4" />Wijziging toepassen</Button></form></div> : null}</div>;
}
function dayKey(value: string) { return value.slice(0, 10); }
function shiftDays(value: string, days: number) { const date = new Date(value); date.setDate(date.getDate() + days); return date.toISOString(); }
function formatDay(value: string) { return new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`)); }
function formatTime(value: string) { return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
