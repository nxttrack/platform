"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Copy,
  Eye,
  EyeOff,
  ImageIcon,
  LoaderCircle,
  Lock,
  LockOpen,
  Plus,
  Square,
  Trash2,
  Type,
  Upload
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  badgeFormatDimensions,
  validateBadgeLayers,
  type BadgeFormat,
  type BadgeLayer,
  type BadgeStudioAsset
} from "@/lib/domain/badge-system-contract";
import { saveBadgeTemplateAction, uploadBadgeStudioAssetAction } from "@/lib/domain/badge-system-actions";
import { cn } from "@/lib/utils";

export function BadgeTemplateEditor({
  canManage,
  initialAssets,
  initialLayers,
  initialStatus,
  initialVersion,
  templateId,
  format
}: {
  canManage: boolean;
  initialAssets: BadgeStudioAsset[];
  initialLayers: unknown;
  initialStatus: string;
  initialVersion: number;
  templateId: string;
  format: BadgeFormat;
}) {
  const dimensions = badgeFormatDimensions[format];
  const validatedLayers = validateBadgeLayers(initialLayers);
  const [assets, setAssets] = useState(initialAssets);
  const [layers, setLayers] = useState<BadgeLayer[]>(validatedLayers);
  const [selectedId, setSelectedId] = useState<string | null>(validatedLayers[0]?.id ?? null);
  const [scale, setScale] = useState(0.35);
  const [isUploading, startUpload] = useTransition();
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;

    const fitCanvas = () => {
      const bounds = host.getBoundingClientRect();
      const availableWidth = Math.max(120, bounds.width - 24);
      const availableHeight = Math.max(120, bounds.height - 24);
      setScale(Math.max(0.08, Math.min(0.72, availableWidth / dimensions.width, availableHeight / dimensions.height)));
    };
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    observer.observe(host);
    return () => observer.disconnect();
  }, [dimensions.height, dimensions.width]);

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

  function addImageLayer(asset: BadgeStudioAsset) {
    const width = dimensions.width * 0.45;
    const id = `image-${crypto.randomUUID()}`;
    const layer: BadgeLayer = {
      id,
      type: "image",
      assetId: asset.id,
      alt: asset.name,
      objectFit: "contain",
      x: (dimensions.width - width) / 2,
      y: dimensions.height * 0.22,
      width,
      height: width,
      opacity: 1
    };
    setLayers((current) => [...current, layer]);
    setSelectedId(id);
  }

  function uploadImage() {
    const input = uploadInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      toast.error("Kies eerst een JPEG- of PNG-afbeelding.");
      return;
    }
    const formData = new FormData();
    formData.set("image", file);
    formData.set("name", file.name.replace(/\.[^.]+$/, ""));

    startUpload(async () => {
      const result = await uploadBadgeStudioAssetAction(formData);
      if (!result.ok || !result.asset) {
        toast.error(result.message);
        return;
      }
      setAssets((current) => [result.asset!, ...current.filter((asset) => asset.id !== result.asset!.id)]);
      addImageLayer(result.asset);
      if (input) input.value = "";
      toast.success(result.message);
    });
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
    <form action={saveBadgeTemplateAction} className="grid gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[210px_minmax(0,1fr)_270px]" data-testid="badge-studio-editor">
      <input name="templateId" type="hidden" value={templateId} />
      <input name="format" type="hidden" value={format} />
      <input name="version" type="hidden" value={initialVersion} />
      <input name="layersJson" type="hidden" value={JSON.stringify(layers)} />
      <input name="next" type="hidden" value={`/platform/badges/share-templates?template=${templateId}`} />

      <aside className="rounded-2xl border border-border bg-card p-3 shadow-soft xl:min-h-0 xl:overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Lagen</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5 xl:grid-cols-1">
          <Button className="px-2" onClick={() => addLayer("text")} size="sm" type="button" variant="outline"><Type className="size-3.5" /> Tekst</Button>
          <Button className="px-2" onClick={() => addLayer("shape")} size="sm" type="button" variant="outline"><Square className="size-3.5" /> Vorm</Button>
          <Button className="px-2" onClick={() => addLayer("decoration")} size="sm" type="button" variant="outline"><Plus className="size-3.5" /> Decoratie</Button>
        </div>
        <div className="mt-3 space-y-1">
          {layers.map((layer, index) => (
            <button
              className={cn("flex min-h-9 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[11px] font-semibold", selectedId === layer.id ? "border-primary bg-primary/5 text-primary" : "border-transparent bg-muted/30 text-foreground")}
              key={layer.id}
              onClick={() => setSelectedId(layer.id)}
              type="button"
            >
              <span className="truncate">{index + 1}. {layerLabel(layer)} {layer.text ? `· ${layer.text}` : ""}</span>
              {layer.hidden ? <EyeOff className="size-3.5" /> : layer.locked ? <Lock className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-primary" />
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Afbeeldingen</p>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">PNG/JPEG · maximaal 5 MB · privé opgeslagen en gescand.</p>
          {canManage ? (
            <div className="mt-2 grid gap-1.5">
              <input
                accept="image/jpeg,image/png"
                aria-label="Afbeelding kiezen"
                className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-[11px] file:font-semibold"
                ref={uploadInputRef}
                type="file"
              />
              <Button disabled={isUploading} onClick={uploadImage} size="sm" type="button" variant="outline">
                {isUploading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                {isUploading ? "Controleren…" : "Uploaden"}
              </Button>
            </div>
          ) : null}
          <div aria-label="Afbeeldingsbibliotheek" className="mt-3 grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button
                aria-label={`${asset.name} gebruiken`}
                className="group overflow-hidden rounded-xl border border-border bg-muted/30 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={asset.id}
                onClick={() => addImageLayer(asset)}
                type="button"
              >
                {/* Signed private URLs are short-lived and intentionally not optimized by Next. */}
                <img alt="" className="h-16 w-full object-contain p-1" draggable={false} src={asset.url} />
                <span className="block truncate border-t border-border px-2 py-1 text-[10px] font-semibold">{asset.name}</span>
              </button>
            ))}
          </div>
          {!assets.length ? <p className="mt-3 rounded-lg border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">Nog geen afbeeldingen.</p> : null}
        </div>
      </aside>

      <section className="flex min-h-[520px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-slate-100 p-3 shadow-inner xl:min-h-0">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-bold">{dimensions.label}</p><p className="text-[11px] text-muted-foreground">{dimensions.width} × {dimensions.height}px · canvas schaalt automatisch mee</p></div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">Voorbeeld · Sam</span>
        </div>
        <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl border border-white/80 bg-slate-200/60 p-3" ref={canvasHostRef}>
          <div className="origin-center overflow-hidden rounded-xl bg-white shadow-card" style={{ height: dimensions.height * scale, width: dimensions.width * scale }}>
            <div className="relative origin-top-left overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50" style={{ height: dimensions.height, transform: `scale(${scale})`, width: dimensions.width }}>
              {layers.map((layer) => {
                if (layer.hidden) return null;
                const imageAsset = layer.type === "image" && layer.assetId ? assetById.get(layer.assetId) : null;
                return (
                  <div
                    aria-label={`Laag ${layerLabel(layer)}`}
                    className={cn("absolute select-none overflow-hidden", selectedId === layer.id && "outline outline-[5px] outline-primary/60")}
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
                    {imageAsset ? <img alt={layer.alt ?? ""} className="pointer-events-none size-full" draggable={false} src={imageAsset.url} style={{ objectFit: layer.objectFit ?? "contain" }} /> : null}
                    {layer.type === "image" && !imageAsset ? <span className="grid size-full place-items-center bg-muted text-center text-2xl font-bold text-muted-foreground">Afbeelding niet beschikbaar</span> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-border bg-card p-3 shadow-soft xl:min-h-0 xl:overflow-y-auto">
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Eigenschappen</p>
        {!selected ? <p className="mt-3 text-sm leading-6 text-muted-foreground">Selecteer een laag om deze te bewerken.</p> : (
          <div className="mt-3 grid gap-2.5">
            {selected.type === "text" ? <Control label="Tekst"><textarea className="min-h-16 rounded-lg border border-border p-2" onChange={(event) => updateSelected({ text: event.target.value.slice(0, 300) })} value={selected.text ?? ""} /></Control> : null}
            {selected.type === "image" ? (
              <>
                <Control label="Schaalmodus">
                  <select className="h-9 rounded-lg border border-border bg-background px-2 font-normal" onChange={(event) => updateSelected({ objectFit: event.target.value as BadgeLayer["objectFit"] })} value={selected.objectFit ?? "contain"}>
                    <option value="contain">Volledig tonen</option>
                    <option value="cover">Vlak vullen</option>
                  </select>
                </Control>
                <Control label="Alternatieve tekst"><input className="h-9 rounded-lg border border-border px-2 font-normal" maxLength={200} onChange={(event) => updateSelected({ alt: event.target.value })} value={selected.alt ?? ""} /></Control>
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <NumberControl label="X" onChange={(x) => updateSelected({ x })} value={selected.x} />
              <NumberControl label="Y" onChange={(y) => updateSelected({ y })} value={selected.y} />
              <NumberControl label="Breedte" min={24} onChange={(width) => updateSelected({ width })} value={selected.width} />
              <NumberControl label="Hoogte" min={24} onChange={(height) => updateSelected({ height })} value={selected.height} />
            </div>
            {selected.type !== "image" ? <Control label="Kleur"><input className="h-9 w-full rounded-lg border border-border p-1" onChange={(event) => updateSelected({ fill: event.target.value })} type="color" value={selected.fill?.startsWith("#") ? selected.fill : "#10243e"} /></Control> : null}
            <Control label={`Transparantie ${Math.round((selected.opacity ?? 1) * 100)}%`}><input max="1" min="0.1" onChange={(event) => updateSelected({ opacity: Number(event.target.value) })} step="0.05" type="range" value={selected.opacity ?? 1} /></Control>
            {selected.type === "text" ? <>
              <NumberControl label="Tekstgrootte" min={10} onChange={(fontSize) => updateSelected({ fontSize })} value={selected.fontSize ?? 44} />
              <div className="grid grid-cols-3 gap-2">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => <Button aria-label={`Lijn ${align} uit`} key={align} onClick={() => updateSelected({ align })} size="sm" type="button" variant={selected.align === align ? "default" : "outline"}><Icon className="size-4" /></Button>)}
              </div>
            </> : null}
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={duplicateSelected} size="sm" type="button" variant="outline"><Copy className="size-3.5" /> Dupliceer</Button>
              <Button onClick={() => updateSelected({ locked: !selected.locked })} size="sm" type="button" variant="outline">{selected.locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />} {selected.locked ? "Open" : "Vergrendel"}</Button>
              <Button onClick={() => updateSelected({ hidden: !selected.hidden })} size="sm" type="button" variant="outline">{selected.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />} {selected.hidden ? "Toon" : "Verberg"}</Button>
              <Button disabled={selected.locked} onClick={removeSelected} size="sm" type="button" variant="outline"><Trash2 className="size-3.5" /> Verwijder</Button>
            </div>
          </div>
        )}
        <div className="mt-4 border-t border-border pt-3">
          <Control label="Publicatiestatus">
            <select className="h-9 rounded-lg border border-border bg-background px-2" defaultValue={initialStatus} name="status">
              <option value="draft">Concept</option>
              <option value="published">Gepubliceerd</option>
              <option value="archived">Gearchiveerd</option>
            </select>
          </Control>
          <Button className="mt-2 w-full" disabled={!canManage} size="sm" type="submit">Template opslaan</Button>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">Opslaan verhoogt de versie. Publicatie of verzending gebeurt nooit automatisch.</p>
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

function layerLabel(layer: BadgeLayer) {
  return ({
    badge: "badge",
    decoration: "decoratie",
    image: "afbeelding",
    logo: "logo",
    shape: "vorm",
    text: "tekst"
  } satisfies Record<BadgeLayer["type"], string>)[layer.type];
}

function Control({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-1 text-[11px] font-bold text-foreground">{label}{children}</label>;
}

function NumberControl({ label, min = 0, onChange, value }: { label: string; min?: number; onChange: (value: number) => void; value: number }) {
  return <Control label={label}><input className="h-9 rounded-lg border border-border px-2 font-normal" min={min} onChange={(event) => onChange(Number(event.target.value))} type="number" value={Math.round(value)} /></Control>;
}
