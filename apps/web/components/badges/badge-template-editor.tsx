"use client";

import { AlignCenter, AlignLeft, AlignRight, Copy, Eye, EyeOff, Lock, LockOpen, Plus, Square, Trash2, Type } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { badgeFormatDimensions, validateBadgeLayers, type BadgeFormat, type BadgeLayer } from "@/lib/domain/badge-system-contract";
import { saveBadgeTemplateAction } from "@/lib/domain/badge-system-actions";
import { cn } from "@/lib/utils";

export function BadgeTemplateEditor({
  initialLayers,
  initialStatus,
  initialVersion,
  templateId,
  format
}: {
  initialLayers: unknown;
  initialStatus: string;
  initialVersion: number;
  templateId: string;
  format: BadgeFormat;
}) {
  const dimensions = badgeFormatDimensions[format];
  const [layers, setLayers] = useState<BadgeLayer[]>(() => validateBadgeLayers(initialLayers));
  const [selectedId, setSelectedId] = useState<string | null>(() => validateBadgeLayers(initialLayers)[0]?.id ?? null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;
  const scale = useMemo(() => Math.min(0.52, 600 / dimensions.width, 650 / dimensions.height), [dimensions]);

  function updateSelected(patch: Partial<BadgeLayer>) {
    if (!selectedId) return;
    setLayers((current) => current.map((layer) => layer.id === selectedId ? { ...layer, ...patch } : layer));
  }

  function addLayer(type: BadgeLayer["type"]) {
    const id = `${type}-${crypto.randomUUID()}`;
    const layer: BadgeLayer = {
      id,
      type,
      x: dimensions.width * 0.25,
      y: dimensions.height * 0.25,
      width: dimensions.width * 0.5,
      height: type === "text" ? 100 : dimensions.width * 0.22,
      text: type === "text" ? "Nieuwe tekst" : undefined,
      fill: type === "shape" ? "#12B8A6" : "#10243E",
      opacity: 1,
      fontSize: 44,
      fontWeight: 700,
      align: "center"
    };
    setLayers((current) => [...current, layer]);
    setSelectedId(id);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy = { ...selected, id: `${selected.type}-${crypto.randomUUID()}`, x: selected.x + 24, y: selected.y + 24 };
    setLayers((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function removeSelected() {
    if (!selected || selected.locked) return;
    setLayers((current) => current.filter((layer) => layer.id !== selected.id));
    setSelectedId(null);
  }

  function startDrag(event: React.PointerEvent, layer: BadgeLayer) {
    if (layer.locked) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = layer.x;
    const originalY = layer.y;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent) => {
      const x = Math.max(0, Math.min(dimensions.width - layer.width, originalX + (moveEvent.clientX - startX) / scale));
      const y = Math.max(0, Math.min(dimensions.height - layer.height, originalY + (moveEvent.clientY - startY) / scale));
      setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, x, y } : item));
    };
    const stop = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", stop);
      target.removeEventListener("pointercancel", stop);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", stop);
    target.addEventListener("pointercancel", stop);
  }

  return (
    <form action={saveBadgeTemplateAction} className="grid gap-5 2xl:grid-cols-[240px_minmax(0,1fr)_300px]">
      <input name="templateId" type="hidden" value={templateId} />
      <input name="format" type="hidden" value={format} />
      <input name="version" type="hidden" value={initialVersion} />
      <input name="layersJson" type="hidden" value={JSON.stringify(layers)} />
      <input name="next" type="hidden" value={`/platform/badges/share-templates?template=${templateId}`} />

      <aside className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Lagen</p>
        <div className="mt-3 grid gap-2">
          <Button onClick={() => addLayer("text")} type="button" variant="outline"><Type className="size-4" /> Tekst</Button>
          <Button onClick={() => addLayer("shape")} type="button" variant="outline"><Square className="size-4" /> Vorm</Button>
          <Button onClick={() => addLayer("decoration")} type="button" variant="outline"><Plus className="size-4" /> Decoratie</Button>
        </div>
        <div className="mt-5 space-y-1.5">
          {layers.map((layer, index) => (
            <button
              className={cn("flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3 text-left text-xs font-semibold", selectedId === layer.id ? "border-primary bg-primary/5 text-primary" : "border-transparent bg-muted/30 text-foreground")}
              key={layer.id}
              onClick={() => setSelectedId(layer.id)}
              type="button"
            >
              <span className="truncate">{index + 1}. {layer.type} {layer.text ? `· ${layer.text}` : ""}</span>
              {layer.hidden ? <EyeOff className="size-3.5" /> : layer.locked ? <Lock className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          ))}
        </div>
      </aside>

      <section className="overflow-auto rounded-3xl border border-border bg-slate-100 p-5 shadow-inner">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div><p className="font-bold">{dimensions.label}</p><p className="text-xs text-muted-foreground">{dimensions.width} × {dimensions.height}px · sleep lagen op het canvas</p></div>
          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted-foreground">Voorbeelddata · Sam</span>
        </div>
        <div className="mx-auto origin-top-left overflow-hidden rounded-2xl bg-white shadow-card" ref={canvasRef} style={{ height: dimensions.height * scale, width: dimensions.width * scale }}>
          <div className="relative origin-top-left overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50" style={{ height: dimensions.height, transform: `scale(${scale})`, width: dimensions.width }}>
            {layers.map((layer) => layer.hidden ? null : (
              <div
                aria-label={`Laag ${layer.type}`}
                className={cn("absolute select-none", selectedId === layer.id && "outline outline-[5px] outline-primary/60")}
                key={layer.id}
                onClick={() => setSelectedId(layer.id)}
                onPointerDown={(event) => startDrag(event, layer)}
                role="button"
                style={{
                  alignItems: "center",
                  background: layer.type === "shape" ? layer.fill : undefined,
                  color: layer.type === "text" ? layer.fill : undefined,
                  cursor: layer.locked ? "not-allowed" : "move",
                  display: "flex",
                  fontSize: layer.fontSize,
                  fontWeight: layer.fontWeight,
                  height: layer.height,
                  justifyContent: layer.align === "left" ? "flex-start" : layer.align === "right" ? "flex-end" : "center",
                  left: layer.x,
                  opacity: layer.opacity,
                  padding: layer.type === "text" ? 12 : 0,
                  top: layer.y,
                  width: layer.width
                }}
                tabIndex={0}
              >
                {layer.type === "badge" ? <span className="grid size-full place-items-center rounded-full bg-gradient-to-br from-primary to-aqua text-[160px] text-white">★</span> : null}
                {layer.type === "decoration" ? <span className="grid size-full place-items-center text-[120px] text-amber-400">✦</span> : null}
                {layer.type === "logo" ? <span className="font-bold text-primary">NXTTRACK</span> : null}
                {layer.type === "text" ? previewText(layer.text ?? "") : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <aside className="rounded-3xl border border-border bg-card p-4 shadow-soft">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Eigenschappen</p>
        {!selected ? <p className="mt-4 text-sm leading-6 text-muted-foreground">Selecteer een laag om deze te bewerken.</p> : (
          <div className="mt-4 grid gap-3">
            {selected.type === "text" ? <Control label="Tekst"><textarea className="min-h-20 rounded-xl border border-border p-2" onChange={(event) => updateSelected({ text: event.target.value.slice(0, 300) })} value={selected.text ?? ""} /></Control> : null}
            <div className="grid grid-cols-2 gap-2">
              <NumberControl label="X" onChange={(x) => updateSelected({ x })} value={selected.x} />
              <NumberControl label="Y" onChange={(y) => updateSelected({ y })} value={selected.y} />
              <NumberControl label="Breedte" min={24} onChange={(width) => updateSelected({ width })} value={selected.width} />
              <NumberControl label="Hoogte" min={24} onChange={(height) => updateSelected({ height })} value={selected.height} />
            </div>
            <Control label="Kleur"><input className="h-11 w-full rounded-xl border border-border p-1" onChange={(event) => updateSelected({ fill: event.target.value })} type="color" value={selected.fill?.startsWith("#") ? selected.fill : "#10243e"} /></Control>
            <Control label={`Transparantie ${Math.round((selected.opacity ?? 1) * 100)}%`}><input max="1" min="0.1" onChange={(event) => updateSelected({ opacity: Number(event.target.value) })} step="0.05" type="range" value={selected.opacity ?? 1} /></Control>
            {selected.type === "text" ? <>
              <NumberControl label="Tekstgrootte" min={10} onChange={(fontSize) => updateSelected({ fontSize })} value={selected.fontSize ?? 44} />
              <div className="grid grid-cols-3 gap-2">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => <Button aria-label={`Lijn ${align} uit`} key={align} onClick={() => updateSelected({ align })} type="button" variant={selected.align === align ? "default" : "outline"}><Icon className="size-4" /></Button>)}
              </div>
            </> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={duplicateSelected} type="button" variant="outline"><Copy className="size-4" /> Dupliceer</Button>
              <Button onClick={() => updateSelected({ locked: !selected.locked })} type="button" variant="outline">{selected.locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />} {selected.locked ? "Ontgrendel" : "Vergrendel"}</Button>
              <Button onClick={() => updateSelected({ hidden: !selected.hidden })} type="button" variant="outline">{selected.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {selected.hidden ? "Toon" : "Verberg"}</Button>
              <Button disabled={selected.locked} onClick={removeSelected} type="button" variant="outline"><Trash2 className="size-4" /> Verwijder</Button>
            </div>
          </div>
        )}
        <div className="mt-6 border-t border-border pt-4">
          <Control label="Publicatiestatus">
            <select className="h-11 rounded-xl border border-border bg-background px-3" defaultValue={initialStatus} name="status">
              <option value="draft">Concept</option>
              <option value="published">Gepubliceerd</option>
              <option value="archived">Gearchiveerd</option>
            </select>
          </Control>
          <Button className="mt-3 w-full" type="submit">Template opslaan</Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Opslaan verhoogt de versie. Versturen of publiceren gebeurt nooit automatisch.</p>
        </div>
      </aside>
    </form>
  );
}

function previewText(value: string) {
  return value
    .replaceAll("{badge_name_gendered}", "Eerste Plons")
    .replaceAll("{child_first_name}", "Sam")
    .replaceAll("{organization_name}", "De Waterlijn");
}

function Control({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-1.5 text-xs font-bold text-foreground">{label}{children}</label>;
}

function NumberControl({ label, min = 0, onChange, value }: { label: string; min?: number; onChange: (value: number) => void; value: number }) {
  return <Control label={label}><input className="h-10 rounded-xl border border-border px-2 font-normal" min={min} onChange={(event) => onChange(Number(event.target.value))} type="number" value={Math.round(value)} /></Control>;
}
