"use client";

import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  ImageIcon,
  LoaderCircle,
  Lock,
  LockOpen,
  Maximize2,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  badgeFormatDimensions,
  moveBadgeLayer,
  reorderBadgeLayers,
  resolveBadgeShortcodes,
  validateBadgeLayers,
  type BadgeFormat,
  type BadgeLayer,
  type BadgeStudioAsset
} from "@/lib/domain/badge-system-contract";
import { saveBadgeTemplateAction, uploadBadgeStudioAssetAction } from "@/lib/domain/badge-system-actions";
import { cn } from "@/lib/utils";

type LayerHistory = {
  future: BadgeLayer[][];
  past: BadgeLayer[][];
};

type Guides = {
  horizontal: boolean;
  vertical: boolean;
};

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
  const normalizedInitialLayers = useMemo(
    () => validateBadgeLayers(initialLayers, dimensions),
    [dimensions, initialLayers]
  );
  const [assets, setAssets] = useState(initialAssets);
  const [layers, setLayers] = useState<BadgeLayer[]>(normalizedInitialLayers);
  const [selectedId, setSelectedId] = useState<string | null>(() => preferredSelection(normalizedInitialLayers));
  const [history, setHistory] = useState<LayerHistory>({ future: [], past: [] });
  const [status, setStatus] = useState(initialStatus);
  const [dirty, setDirty] = useState(false);
  const [scale, setScale] = useState(0.35);
  const [fitScale, setFitScale] = useState(0.35);
  const [autoFit, setAutoFit] = useState(true);
  const [guides, setGuides] = useState<Guides>({ horizontal: false, vertical: false });
  const [draggedLayerId, setDraggedLayerId] = useState<string | null>(null);
  const [isUploading, startUpload] = useTransition();
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const initialSnapshotRef = useRef<BadgeLayer[]>(normalizedInitialLayers);
  const selected = layers.find((layer) => layer.id === selectedId) ?? null;
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const displayLayers = [...layers].reverse();

  useEffect(() => {
    const normalized = validateBadgeLayers(initialLayers, dimensions);
    initialSnapshotRef.current = normalized;
    setLayers(normalized);
    setAssets(initialAssets);
    setSelectedId(preferredSelection(normalized));
    setHistory({ future: [], past: [] });
    setStatus(initialStatus);
    setDirty(false);
    setGuides({ horizontal: false, vertical: false });
  }, [format, initialVersion, templateId]);

  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const fitCanvas = () => {
      const bounds = host.getBoundingClientRect();
      const availableWidth = Math.max(120, bounds.width - 32);
      const availableHeight = Math.max(120, bounds.height - 32);
      const nextFit = clamp(Math.min(availableWidth / dimensions.width, availableHeight / dimensions.height), 0.08, 0.9);
      setFitScale(nextFit);
      if (autoFit) setScale(nextFit);
    };
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    observer.observe(host);
    return () => observer.disconnect();
  }, [autoFit, dimensions.height, dimensions.width]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [dirty]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!canManage || isTextInput(event.target)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (!selected || selected.locked) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeSelected();
        return;
      }
      const directions: Record<string, [number, number]> = {
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1]
      };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const distance = event.shiftKey ? 10 : 1;
      updateSelected({
        x: clamp(selected.x + direction[0] * distance, 0, dimensions.width - selected.width),
        y: clamp(selected.y + direction[1] * distance, 0, dimensions.height - selected.height)
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function commitLayers(updater: BadgeLayer[] | ((current: BadgeLayer[]) => BadgeLayer[])) {
    if (!canManage) return;
    setLayers((current) => {
      const candidate = typeof updater === "function" ? updater(current) : updater;
      const next = validateBadgeLayers(candidate, dimensions);
      if (sameLayers(current, next)) return current;
      setHistory((value) => ({ future: [], past: [...value.past, current].slice(-50) }));
      setDirty(true);
      return next;
    });
  }

  function commitInteraction(before: BadgeLayer[]) {
    setLayers((current) => {
      const next = validateBadgeLayers(current, dimensions);
      if (sameLayers(before, next)) return next;
      setHistory((value) => ({ future: [], past: [...value.past, before].slice(-50) }));
      setDirty(true);
      return next;
    });
    setGuides({ horizontal: false, vertical: false });
  }

  function updateSelected(patch: Partial<BadgeLayer>) {
    if (!selectedId || !canManage) return;
    commitLayers((current) => current.map((layer) => layer.id === selectedId ? { ...layer, ...patch } : layer));
  }

  function addLayer(type: BadgeLayer["type"]) {
    if (!canManage) return;
    const id = `${type}-${crypto.randomUUID()}`;
    const layer: BadgeLayer = {
      id,
      name: defaultLayerName(type),
      type,
      x: dimensions.width * 0.25,
      y: dimensions.height * 0.25,
      width: dimensions.width * 0.5,
      height: type === "text" ? 120 : Math.min(dimensions.width, dimensions.height) * 0.22,
      text: type === "text" ? "Nieuwe tekst" : undefined,
      fill: type === "shape" ? "#12b8a6" : "#10243e",
      opacity: 1,
      fontSize: 44,
      fontWeight: 700,
      align: "center",
      rotation: 0
    };
    commitLayers((current) => [...current, layer]);
    setSelectedId(id);
  }

  function addImageLayer(asset: BadgeStudioAsset) {
    if (!canManage) return;
    const width = Math.min(dimensions.width, dimensions.height) * 0.45;
    const id = `image-${crypto.randomUUID()}`;
    const layer: BadgeLayer = {
      id,
      name: asset.name,
      type: "image",
      assetId: asset.id,
      alt: asset.name,
      objectFit: "contain",
      x: (dimensions.width - width) / 2,
      y: (dimensions.height - width) / 2,
      width,
      height: width,
      opacity: 1,
      rotation: 0
    };
    commitLayers((current) => [...current, layer]);
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
    if (!selected || !canManage) return;
    const copy = {
      ...selected,
      id: `${selected.type}-${crypto.randomUUID()}`,
      name: `${selected.name?.trim() || defaultLayerName(selected.type)} kopie`,
      locked: false,
      x: clamp(selected.x + 24, 0, dimensions.width - selected.width),
      y: clamp(selected.y + 24, 0, dimensions.height - selected.height)
    };
    commitLayers((current) => [...current, copy]);
    setSelectedId(copy.id);
  }

  function removeSelected() {
    if (!selected || selected.locked || !canManage) return;
    const currentIndex = layers.findIndex((layer) => layer.id === selected.id);
    const nextSelection = layers[currentIndex - 1]?.id ?? layers[currentIndex + 1]?.id ?? null;
    commitLayers((current) => current.filter((layer) => layer.id !== selected.id));
    setSelectedId(nextSelection);
  }

  function undo() {
    if (!canManage) return;
    const previous = history.past.at(-1);
    if (!previous) return;
    setHistory({ past: history.past.slice(0, -1), future: [layers, ...history.future].slice(0, 50) });
    setLayers(previous);
    setSelectedId((selection) => selection && previous.some((layer) => layer.id === selection) ? selection : preferredSelection(previous));
    setDirty(true);
  }

  function redo() {
    if (!canManage) return;
    const next = history.future[0];
    if (!next) return;
    setHistory({ past: [...history.past, layers].slice(-50), future: history.future.slice(1) });
    setLayers(next);
    setSelectedId((selection) => selection && next.some((layer) => layer.id === selection) ? selection : preferredSelection(next));
    setDirty(true);
  }

  function resetEditor() {
    if (!canManage || (sameLayers(layers, initialSnapshotRef.current) && status === initialStatus)) return;
    setLayers(initialSnapshotRef.current);
    setStatus(initialStatus);
    setSelectedId(preferredSelection(initialSnapshotRef.current));
    setHistory({ future: [], past: [] });
    setDirty(false);
  }

  function startDrag(event: React.PointerEvent, layer: BadgeLayer) {
    if (!canManage || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(layer.id);
    const before = layers;
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = layer.x;
    const originalY = layer.y;
    const pointerId = event.pointerId;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(pointerId);
    const move = (moveEvent: PointerEvent) => {
      const rawX = clamp(originalX + (moveEvent.clientX - startX) / scale, 0, dimensions.width - layer.width);
      const rawY = clamp(originalY + (moveEvent.clientY - startY) / scale, 0, dimensions.height - layer.height);
      const snapped = snapLayerPosition(rawX, rawY, layer, dimensions);
      setGuides(snapped.guides);
      setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, x: snapped.x, y: snapped.y } : item));
    };
    const stop = () => {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      commitInteraction(before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function startResize(event: React.PointerEvent, layer: BadgeLayer) {
    if (!canManage || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const before = layers;
    const startX = event.clientX;
    const startY = event.clientY;
    const originalWidth = layer.width;
    const originalHeight = layer.height;
    const ratio = originalWidth / originalHeight;
    const move = (moveEvent: PointerEvent) => {
      let width = clamp(originalWidth + (moveEvent.clientX - startX) / scale, 24, dimensions.width - layer.x);
      let height = clamp(originalHeight + (moveEvent.clientY - startY) / scale, 24, dimensions.height - layer.y);
      if (moveEvent.shiftKey) {
        if (Math.abs(moveEvent.clientX - startX) >= Math.abs(moveEvent.clientY - startY)) height = clamp(width / ratio, 24, dimensions.height - layer.y);
        else width = clamp(height * ratio, 24, dimensions.width - layer.x);
      }
      setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, width, height } : item));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      commitInteraction(before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function startRotate(event: React.PointerEvent, layer: BadgeLayer) {
    if (!canManage || layer.locked) return;
    event.preventDefault();
    event.stopPropagation();
    const before = layers;
    const layerElement = (event.currentTarget as HTMLElement).parentElement;
    if (!layerElement) return;
    const bounds = layerElement.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const move = (moveEvent: PointerEvent) => {
      let rotation = normalizeRotation(Math.atan2(moveEvent.clientY - centerY, moveEvent.clientX - centerX) * 180 / Math.PI + 90);
      if (moveEvent.shiftKey || Math.abs(rotation / 15 - Math.round(rotation / 15)) < 0.18) rotation = Math.round(rotation / 15) * 15;
      setLayers((current) => current.map((item) => item.id === layer.id ? { ...item, rotation } : item));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      commitInteraction(before);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function reorder(activeId: string, targetId: string) {
    if (!canManage || activeId === targetId || layers.find((layer) => layer.id === activeId)?.locked) return;
    commitLayers((current) => reorderBadgeLayers(current, activeId, targetId));
  }

  function setZoom(nextScale: number) {
    setAutoFit(false);
    setScale(clamp(nextScale, 0.08, 1.2));
  }

  function fitCanvas() {
    setAutoFit(true);
    setScale(fitScale);
  }

  return (
    <form action={saveBadgeTemplateAction} className="grid gap-3 xl:h-full xl:min-h-0 xl:grid-cols-[230px_minmax(0,1fr)_290px]" data-dirty={dirty ? "true" : "false"} data-testid="badge-studio-editor">
      <input name="templateId" type="hidden" value={templateId} />
      <input name="format" type="hidden" value={format} />
      <input name="version" type="hidden" value={initialVersion} />
      <input name="layersJson" type="hidden" value={JSON.stringify(layers)} />
      <input name="next" type="hidden" value={`/platform/badges/share-templates?template=${templateId}`} />

      <aside className="rounded-2xl border border-border bg-card p-3 shadow-soft xl:min-h-0 xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Lagen · bovenaan is vooraan</p>
          <span className="text-[10px] text-muted-foreground">{layers.length}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 xl:grid-cols-1">
          <Button className="px-2" disabled={!canManage} onClick={() => addLayer("text")} size="sm" type="button" variant="outline"><Type className="size-3.5" /> Tekst</Button>
          <Button className="px-2" disabled={!canManage} onClick={() => addLayer("shape")} size="sm" type="button" variant="outline"><Square className="size-3.5" /> Vorm</Button>
          <Button className="px-2" disabled={!canManage} onClick={() => addLayer("decoration")} size="sm" type="button" variant="outline"><Plus className="size-3.5" /> Decoratie</Button>
        </div>
        <div className="mt-3 space-y-1">
          {displayLayers.map((layer) => {
            const zIndex = layers.findIndex((item) => item.id === layer.id) + 1;
            return (
              <button
                aria-label={`${zIndex}. ${layerDisplayName(layer)}`}
                className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-[11px] font-semibold", selectedId === layer.id ? "border-primary bg-primary/5 text-primary" : "border-transparent bg-muted/30 text-foreground", draggedLayerId === layer.id && "opacity-50")}
                draggable={canManage && !layer.locked}
                key={layer.id}
                onClick={() => setSelectedId(layer.id)}
                onDragEnd={() => setDraggedLayerId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={(event) => {
                  setDraggedLayerId(layer.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", layer.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const activeId = event.dataTransfer.getData("text/plain") || draggedLayerId;
                  if (activeId) reorder(activeId, layer.id);
                  setDraggedLayerId(null);
                }}
                type="button"
              >
                <span className="truncate">{layerDisplayName(layer)}{layer.text ? ` · ${layer.text}` : ""}</span>
                <span className="flex shrink-0 items-center gap-1">{layer.hidden ? <EyeOff className="size-3.5" /> : layer.locked ? <Lock className="size-3.5" /> : <Eye className="size-3.5" />}</span>
              </button>
            );
          })}
          {!layers.length ? <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">Voeg een laag toe.</p> : null}
        </div>

        <div className="mt-4 border-t border-border pt-3">
          <div className="flex items-center gap-2"><ImageIcon className="size-4 text-primary" /><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Template-afbeeldingen</p></div>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">PNG/JPEG · maximaal 5 MB · privé opgeslagen en gescand. Dit zijn decoraties; echte badge-artwork upload je bij de badge.</p>
          {canManage ? (
            <div className="mt-2 grid gap-1.5">
              <input accept="image/jpeg,image/png" aria-label="Afbeelding kiezen" className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1.5 file:text-[11px] file:font-semibold" ref={uploadInputRef} type="file" />
              <Button disabled={isUploading} onClick={uploadImage} size="sm" type="button" variant="outline">{isUploading ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}{isUploading ? "Controleren…" : "Uploaden en plaatsen"}</Button>
            </div>
          ) : null}
          <div aria-label="Afbeeldingsbibliotheek" className="mt-3 grid grid-cols-2 gap-2">
            {assets.map((asset) => (
              <button aria-label={`${asset.name} gebruiken`} className="group overflow-hidden rounded-xl border border-border bg-muted/30 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" disabled={!canManage} key={asset.id} onClick={() => addImageLayer(asset)} type="button">
                {/* Private proxy URLs are intentionally not optimized by Next. */}
                <img alt="" className="h-16 w-full object-contain p-1" draggable={false} src={asset.url} />
                <span className="block truncate border-t border-border px-2 py-1 text-[10px] font-semibold">{asset.name}</span>
              </button>
            ))}
          </div>
          {!assets.length ? <p className="mt-3 rounded-lg border border-dashed border-border p-2 text-center text-[11px] text-muted-foreground">Nog geen template-afbeeldingen.</p> : null}
        </div>
      </aside>

      <section className="flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-slate-100 p-3 shadow-inner xl:min-h-0">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm font-bold">{dimensions.label}</p><p className="text-[11px] text-muted-foreground">{dimensions.width} × {dimensions.height}px · sleep, resize of roteer de selectie</p></div>
          <div className="flex items-center gap-1 rounded-xl border border-border bg-white p-1">
            <Button aria-label="Ongedaan maken" disabled={!canManage || !history.past.length} onClick={undo} size="icon" type="button" variant="ghost"><Undo2 className="size-4" /></Button>
            <Button aria-label="Opnieuw uitvoeren" disabled={!canManage || !history.future.length} onClick={redo} size="icon" type="button" variant="ghost"><Redo2 className="size-4" /></Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button aria-label="Uitzoomen" onClick={() => setZoom(scale - 0.05)} size="icon" type="button" variant="ghost"><ZoomOut className="size-4" /></Button>
            <span className="min-w-12 text-center text-[10px] font-semibold">{Math.round(scale * 100)}%</span>
            <Button aria-label="Inzoomen" onClick={() => setZoom(scale + 0.05)} size="icon" type="button" variant="ghost"><ZoomIn className="size-4" /></Button>
            <Button aria-label="Canvas passend maken" onClick={fitCanvas} size="icon" type="button" variant="ghost"><Maximize2 className="size-4" /></Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/80 bg-slate-200/60 p-4" ref={canvasHostRef}>
          <div className="grid min-h-full min-w-full place-items-center">
            <div className="relative shrink-0 origin-center overflow-hidden rounded-xl bg-white shadow-card" style={{ height: dimensions.height * scale, width: dimensions.width * scale }}>
              <div className="relative origin-top-left overflow-hidden bg-gradient-to-br from-sky-50 via-white to-emerald-50" onClick={() => setSelectedId(null)} style={{ height: dimensions.height, transform: `scale(${scale})`, width: dimensions.width }}>
                {guides.vertical ? <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-[10000] border-l-2 border-dashed border-fuchsia-500" /> : null}
                {guides.horizontal ? <div className="pointer-events-none absolute left-0 right-0 top-1/2 z-[10000] border-t-2 border-dashed border-fuchsia-500" /> : null}
                {layers.map((layer) => {
                  if (layer.hidden) return null;
                  const imageAsset = layer.type === "image" && layer.assetId ? assetById.get(layer.assetId) : null;
                  const isSelected = selectedId === layer.id;
                  return (
                    <div
                      aria-label={`Laag ${layerDisplayName(layer)}`}
                      className={cn("absolute select-none", isSelected && "outline outline-[5px] outline-primary/70")}
                      key={layer.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(layer.id);
                      }}
                      onPointerDown={(event) => startDrag(event, layer)}
                      role="group"
                      style={{
                        cursor: !canManage || layer.locked ? "default" : "move",
                        height: layer.height,
                        left: layer.x,
                        opacity: layer.opacity,
                        top: layer.y,
                        touchAction: "none",
                        transform: `rotate(${layer.rotation ?? 0}deg)`,
                        width: layer.width
                      }}
                      tabIndex={0}
                    >
                      <div
                        className="pointer-events-none flex size-full overflow-hidden"
                        style={{
                          alignItems: "center",
                          background: layer.type === "shape" ? layer.fill : undefined,
                          color: layer.type === "text" ? layer.fill : undefined,
                          fontSize: layer.fontSize,
                          fontWeight: layer.fontWeight,
                          justifyContent: layer.align === "left" ? "flex-start" : layer.align === "right" ? "flex-end" : "center",
                          padding: layer.type === "text" ? 12 : 0,
                          textAlign: layer.align
                        }}
                      >
                        {layer.type === "badge" ? <span className="grid size-full place-items-center rounded-full bg-gradient-to-br from-primary to-aqua text-[160px] text-white">★</span> : null}
                        {layer.type === "decoration" ? <span className="grid size-full place-items-center text-[120px] text-amber-400">✦</span> : null}
                        {layer.type === "logo" ? <span className="font-bold text-primary">NXTTRACK</span> : null}
                        {layer.type === "text" ? previewText(layer.text ?? "") : null}
                        {imageAsset ? <img alt={layer.alt ?? ""} className="size-full" draggable={false} src={imageAsset.url} style={{ objectFit: layer.objectFit ?? "contain" }} /> : null}
                        {layer.type === "image" && !imageAsset ? <span className="grid size-full place-items-center bg-muted text-center text-2xl font-bold text-muted-foreground">Afbeelding niet beschikbaar</span> : null}
                      </div>
                      {isSelected && canManage && !layer.locked ? (
                        <>
                          <button aria-label="Laag roteren" className="absolute left-1/2 rounded-full border-2 border-primary bg-white shadow-soft" onPointerDown={(event) => startRotate(event, layer)} style={{ height: 22 / scale, top: -42 / scale, transform: "translateX(-50%)", width: 22 / scale }} type="button"><span className="sr-only">Roteren</span></button>
                          <span className="pointer-events-none absolute left-1/2 bg-primary" style={{ height: 20 / scale, top: -20 / scale, transform: "translateX(-50%)", width: 2 / scale }} />
                          <button aria-label="Laag groter of kleiner maken" className="absolute bottom-0 right-0 rounded-sm border-2 border-primary bg-white shadow-soft" onPointerDown={(event) => startResize(event, layer)} style={{ height: 24 / scale, transform: "translate(50%, 50%)", width: 24 / scale }} type="button"><span className="sr-only">Formaat aanpassen</span></button>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Pijltjes = 1 px · Shift + pijltjes = 10 px · Shift tijdens resize behoudt verhouding · Ctrl/Cmd + Z = ongedaan maken</p>
      </section>

      <aside className="rounded-2xl border border-border bg-card p-3 shadow-soft xl:min-h-0 xl:overflow-y-auto">
        <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary">Eigenschappen</p>{dirty ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">Niet opgeslagen</span> : <span className="text-[10px] text-muted-foreground">Opgeslagen</span>}</div>
        {!selected ? <p className="mt-3 text-sm leading-6 text-muted-foreground">Selecteer een laag om deze te bewerken.</p> : (
          <div className="mt-3 grid gap-2.5">
            <Control label="Laagnaam"><input className="h-9 rounded-lg border border-border px-2 font-normal" disabled={!canManage || selected.locked} maxLength={80} onChange={(event) => updateSelected({ name: event.target.value })} value={selected.name ?? ""} /></Control>
            {selected.type === "text" ? <Control label="Tekst"><textarea className="min-h-16 rounded-lg border border-border p-2 font-normal" disabled={!canManage || selected.locked} maxLength={300} onChange={(event) => updateSelected({ text: event.target.value })} value={selected.text ?? ""} /></Control> : null}
            {selected.type === "image" ? (
              <>
                <Control label="Schaalmodus"><select className="h-9 rounded-lg border border-border bg-background px-2 font-normal" disabled={!canManage || selected.locked} onChange={(event) => updateSelected({ objectFit: event.target.value as BadgeLayer["objectFit"] })} value={selected.objectFit ?? "contain"}><option value="contain">Volledig tonen</option><option value="cover">Vlak vullen</option></select></Control>
                <Control label="Alternatieve tekst"><input className="h-9 rounded-lg border border-border px-2 font-normal" disabled={!canManage || selected.locked} maxLength={200} onChange={(event) => updateSelected({ alt: event.target.value })} value={selected.alt ?? ""} /></Control>
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <NumberControl disabled={!canManage || selected.locked} label="X" max={dimensions.width - selected.width} onChange={(x) => updateSelected({ x })} value={selected.x} />
              <NumberControl disabled={!canManage || selected.locked} label="Y" max={dimensions.height - selected.height} onChange={(y) => updateSelected({ y })} value={selected.y} />
              <NumberControl disabled={!canManage || selected.locked} label="Breedte" max={dimensions.width - selected.x} min={24} onChange={(width) => updateSelected({ width })} value={selected.width} />
              <NumberControl disabled={!canManage || selected.locked} label="Hoogte" max={dimensions.height - selected.y} min={24} onChange={(height) => updateSelected({ height })} value={selected.height} />
              <NumberControl disabled={!canManage || selected.locked} label="Rotatie" max={180} min={-180} onChange={(rotation) => updateSelected({ rotation })} value={selected.rotation ?? 0} />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <Button disabled={!canManage || selected.locked} onClick={() => updateSelected({ x: 0 })} size="sm" type="button" variant="outline">Links</Button>
              <Button disabled={!canManage || selected.locked} onClick={() => updateSelected({ x: (dimensions.width - selected.width) / 2 })} size="sm" type="button" variant="outline">Midden</Button>
              <Button disabled={!canManage || selected.locked} onClick={() => updateSelected({ x: dimensions.width - selected.width })} size="sm" type="button" variant="outline">Rechts</Button>
              <Button disabled={!canManage || selected.locked} onClick={() => updateSelected({ y: 0 })} size="sm" type="button" variant="outline">Boven</Button>
              <Button disabled={!canManage || selected.locked} onClick={() => updateSelected({ y: (dimensions.height - selected.height) / 2 })} size="sm" type="button" variant="outline">Midden</Button>
              <Button disabled={!canManage || selected.locked} onClick={() => updateSelected({ y: dimensions.height - selected.height })} size="sm" type="button" variant="outline">Onder</Button>
            </div>
            {selected.type !== "image" ? <Control label="Kleur"><input className="h-9 w-full rounded-lg border border-border p-1" disabled={!canManage || selected.locked} onChange={(event) => updateSelected({ fill: event.target.value })} type="color" value={selected.fill?.startsWith("#") ? selected.fill : "#10243e"} /></Control> : null}
            <Control label={`Transparantie ${Math.round((selected.opacity ?? 1) * 100)}%`}><input disabled={!canManage || selected.locked} max="1" min="0" onChange={(event) => updateSelected({ opacity: Number(event.target.value) })} step="0.05" type="range" value={selected.opacity ?? 1} /></Control>
            {selected.type === "text" ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <NumberControl disabled={!canManage || selected.locked} label="Tekstgrootte" max={240} min={10} onChange={(fontSize) => updateSelected({ fontSize })} value={selected.fontSize ?? 44} />
                  <NumberControl disabled={!canManage || selected.locked} label="Dikte" max={900} min={100} onChange={(fontWeight) => updateSelected({ fontWeight })} step={100} value={selected.fontWeight ?? 700} />
                </div>
                <div className="grid grid-cols-3 gap-2">{([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([align, Icon]) => <Button aria-label={`Tekst ${align} uitlijnen`} disabled={!canManage || selected.locked} key={align} onClick={() => updateSelected({ align })} size="sm" type="button" variant={selected.align === align ? "default" : "outline"}><Icon className="size-4" /></Button>)}</div>
              </>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={!canManage || selected.locked || layers[0]?.id === selected.id} onClick={() => commitLayers((current) => moveBadgeLayer(current, selected.id, "back"))} size="sm" type="button" variant="outline"><ChevronDown className="size-3.5" /> Naar achter</Button>
              <Button disabled={!canManage || selected.locked || layers.at(-1)?.id === selected.id} onClick={() => commitLayers((current) => moveBadgeLayer(current, selected.id, "front"))} size="sm" type="button" variant="outline"><ChevronUp className="size-3.5" /> Naar voren</Button>
              <Button disabled={!canManage} onClick={duplicateSelected} size="sm" type="button" variant="outline"><Copy className="size-3.5" /> Dupliceer</Button>
              <Button disabled={!canManage} onClick={() => commitLayers((current) => current.map((layer) => layer.id === selected.id ? { ...layer, locked: !selected.locked } : layer))} size="sm" type="button" variant="outline">{selected.locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}{selected.locked ? "Ontgrendel" : "Vergrendel"}</Button>
              <Button disabled={!canManage} onClick={() => commitLayers((current) => current.map((layer) => layer.id === selected.id ? { ...layer, hidden: !selected.hidden } : layer))} size="sm" type="button" variant="outline">{selected.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}{selected.hidden ? "Toon" : "Verberg"}</Button>
              <Button disabled={!canManage || selected.locked} onClick={removeSelected} size="sm" type="button" variant="outline"><Trash2 className="size-3.5" /> Verwijder</Button>
            </div>
          </div>
        )}
        <div className="mt-4 border-t border-border pt-3">
          <Control label="Publicatiestatus"><select className="h-9 rounded-lg border border-border bg-background px-2" disabled={!canManage} name="status" onChange={(event) => { setStatus(event.target.value); setDirty(true); }} value={status}><option value="draft">Concept</option><option value="published">Gepubliceerd</option><option value="archived">Gearchiveerd</option></select></Control>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button disabled={!canManage || (!dirty && status === initialStatus)} onClick={resetEditor} size="sm" type="button" variant="outline"><RotateCcw className="size-3.5" /> Herstel</Button>
            <Button disabled={!canManage || !dirty} size="sm" type="submit"><Save className="size-3.5" /> Opslaan</Button>
          </div>
          <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">Opslaan verhoogt de versie. Alleen een gepubliceerde template wordt gebruikt voor nieuwe deelafbeeldingen.</p>
        </div>
      </aside>
    </form>
  );
}

function previewText(value: string) {
  return resolveBadgeShortcodes(value, {
    badgeDescription: "Een prachtige stap in het water.",
    badgeName: "Eerste Plons",
    childFirstName: "Sam de Vries",
    gender: "unknown",
    organizationName: "De Waterlijn"
  });
}

function preferredSelection(layers: BadgeLayer[]) {
  return [...layers].reverse().find((layer) => !layer.locked && !layer.hidden)?.id ?? layers.at(-1)?.id ?? null;
}

function layerLabel(layer: BadgeLayer) {
  return ({
    badge: "Badge-artwork",
    decoration: "Decoratie",
    image: "Afbeelding",
    logo: "Logo",
    shape: "Vorm",
    text: "Tekst"
  } satisfies Record<BadgeLayer["type"], string>)[layer.type];
}

function layerDisplayName(layer: BadgeLayer) {
  return layer.name?.trim() || layerLabel(layer);
}

function defaultLayerName(type: BadgeLayer["type"]) {
  return ({
    badge: "Badge",
    decoration: "Decoratie",
    image: "Afbeelding",
    logo: "Logo",
    shape: "Vorm",
    text: "Tekst"
  } satisfies Record<BadgeLayer["type"], string>)[type];
}

function snapLayerPosition(x: number, y: number, layer: BadgeLayer, dimensions: { height: number; width: number }) {
  const threshold = 12;
  const centeredX = (dimensions.width - layer.width) / 2;
  const centeredY = (dimensions.height - layer.height) / 2;
  const snappedX = nearestSnap(x, [0, centeredX, dimensions.width - layer.width], threshold);
  const snappedY = nearestSnap(y, [0, centeredY, dimensions.height - layer.height], threshold);
  return {
    x: snappedX.value,
    y: snappedY.value,
    guides: {
      horizontal: snappedY.snapped && Math.abs(snappedY.value - centeredY) < 0.01,
      vertical: snappedX.snapped && Math.abs(snappedX.value - centeredX) < 0.01
    }
  };
}

function nearestSnap(value: number, candidates: number[], threshold: number) {
  const nearest = candidates.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, candidates[0] ?? value);
  return Math.abs(nearest - value) <= threshold ? { snapped: true, value: nearest } : { snapped: false, value };
}

function normalizeRotation(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function sameLayers(left: BadgeLayer[], right: BadgeLayer[]) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function Control({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="grid gap-1 text-[11px] font-bold text-foreground">{label}{children}</label>;
}

function NumberControl({ disabled, label, max, min = 0, onChange, step = 1, value }: { disabled?: boolean; label: string; max?: number; min?: number; onChange: (value: number) => void; step?: number; value: number }) {
  return <Control label={label}><input className="h-9 rounded-lg border border-border px-2 font-normal" disabled={disabled} max={max} min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="number" value={Math.round(value)} /></Control>;
}
