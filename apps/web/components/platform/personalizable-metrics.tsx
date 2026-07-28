"use client";

import { Activity, AlertTriangle, CheckCircle2, CircleGauge, Clock3, GripVertical, Settings2, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AdminMetricCard } from "@/components/admin/admin-patterns";
import { Button } from "@/components/ui/button";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { savePlatformDashboardWidgetsAction } from "@/lib/ui/dashboard-preference-actions";
import type { DashboardWidgetPreference } from "@/lib/ui/dashboard-preferences";

type Widget = DashboardWidgetPreference & {
  label: string;
  tone?: "danger" | "info" | "neutral" | "success" | "warning";
  value: number | string;
};
const icons = { organizations: Users, average_health: CircleGauge, healthy: CheckCircle2, watch: Clock3, risk: AlertTriangle, incidents: Activity };

export function PersonalizablePlatformMetrics({ initial }: { initial: Widget[] }) {
  const [widgets, setWidgets] = useState(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const visible = widgets.filter((row) => row.visible);
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= widgets.length) return;
    setWidgets((current) => { const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((row, position) => ({ ...row, position })); });
  }
  async function save() {
    setBusy(true);
    const result = await savePlatformDashboardWidgetsAction(widgets.map((row, position) => ({ key: row.key, position, visible: row.visible })));
    setBusy(false);
    if (!result.ok) return toast.error(result.error);
    toast.success("Dashboardindeling op alle apparaten opgeslagen.");
    setOpen(false);
  }
  return <section>
    <div className="mb-2 flex justify-end"><Button onClick={() => setOpen(true)} size="sm" variant="ghost"><Settings2 className="size-4" />Widgets</Button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{visible.map((widget) => { const Icon = icons[widget.key as keyof typeof icons] ?? Activity; return <AdminMetricCard icon={Icon} key={widget.key} label={widget.label} tone={widget.tone} value={widget.value} />; })}</div>
    <DetailsSheet description="Kies welke kerncijfers je ziet en in welke volgorde. Deze voorkeur synchroniseert tussen apparaten." onOpenChange={setOpen} open={open} title="Dashboard personaliseren">
      <div className="grid gap-3">{widgets.map((widget, index) => <article className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3" key={widget.key}><GripVertical className="size-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="font-bold">{widget.label}</p><p className="text-xs text-muted-foreground">Waarde: {widget.value}</p></div><label className="flex items-center gap-2 text-xs font-semibold"><input checked={widget.visible} onChange={(event) => setWidgets((current) => current.map((row) => row.key === widget.key ? { ...row, visible: event.target.checked } : row))} type="checkbox" />Tonen</label><div className="flex gap-1"><Button aria-label={`${widget.label} naar voren`} disabled={index === 0} onClick={() => move(index, -1)} size="icon" variant="outline">↑</Button><Button aria-label={`${widget.label} naar achteren`} disabled={index === widgets.length - 1} onClick={() => move(index, 1)} size="icon" variant="outline">↓</Button></div></article>)}</div>
      <Button className="mt-5 w-full" disabled={busy || !widgets.some((row) => row.visible)} onClick={() => void save()}>{busy ? "Opslaan…" : "Indeling opslaan"}</Button>
    </DetailsSheet>
  </section>;
}
