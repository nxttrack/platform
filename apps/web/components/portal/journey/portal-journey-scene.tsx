"use client";

import { ArrowLeft, ArrowRight, Award, Check, List, Minus, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { PortalDialog } from "../portal-dialog";
import type { PortalJourneyView, PortalJourneyViewNode } from "@/lib/domain/portal-journey-view";
import { clampJourneyCamera, distributeJourneyNodes, focusJourneyCamera, journeyPageSize, journeyRoutePath, type JourneyCamera } from "@/lib/theme/portal-journey-geometry";
import { buildJourneyTimeline, selectDefaultJourneyNode, selectMascotPlacement, type JourneyMascotPlacement, type JourneyTimelineEvent } from "@/lib/theme/portal-journey-contract";
import { presentationAssetUrl, resolvePearlArtwork, type PortalJourneyPresentationV1 } from "@/lib/theme/portal-journey-presentation";

import styles from "./portal-journey-scene.module.css";

type StoredView = { selectedId: string | null; camera: JourneyCamera; layoutKey: string; at: number };
const noEvents: readonly JourneyTimelineEvent[] = [];
const hiddenGuide: JourneyMascotPlacement = { x: 0, y: 0, width: 0, height: 0, mode: "hidden" };

/** Shared parent/child/guarded-preview renderer. Receives no domain mutation capability. */
export function PortalJourneyScene({ presentation, worldId, model, contextKey, title, lesson, events = noEvents, detailHref, selectedId: requestedId, onSelect, assetUrls, reducedMotion = false, collectionControls }: {
  presentation: PortalJourneyPresentationV1; worldId: string; model: PortalJourneyView | null; contextKey: string; title: string;
  events?: readonly JourneyTimelineEvent[];
  collectionControls?: ReactNode;
  lesson?: { label: string; href: string } | null; detailHref: (id: string) => string;
  selectedId?: string | null; onSelect?: (id: string) => void; assetUrls?: Readonly<Record<string, string>>; reducedMotion?: boolean;
}) {
  const world = presentation.worlds[worldId];
  if (!world) return <section className={styles.missing}><h1>{title}</h1><p>Er is nog geen wereld gekoppeld aan dit niveau. Je onderdelen blijven beschikbaar bij Ontwikkeling.</p></section>;
  return <RegisteredScene key={contextKey} {...{ presentation, worldId, model, contextKey, title, lesson, events, detailHref, requestedId, onSelect, assetUrls, reducedMotion, collectionControls }} />;
}

function RegisteredScene({ presentation, worldId, model, contextKey, title, lesson, events, detailHref, requestedId, onSelect, assetUrls, reducedMotion, collectionControls }: Omit<Parameters<typeof PortalJourneyScene>[0], "selectedId"> & { requestedId?: string | null }) {
  const world = presentation.worlds[worldId], nodes = model?.nodes ?? [];
  const root = useRef<HTMLElement>(null), viewportRef = useRef<HTMLDivElement>(null), lastTrigger = useRef<HTMLElement | null>(null), listTrigger = useRef<HTMLButtonElement>(null), momentTrigger = useRef<HTMLElement | null>(null);
  const currentGoalId = selectDefaultJourneyNode(nodes.map((node) => ({ ...node, progressPercent: node.progressPercent ?? 0 })))?.id ?? null;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selected, setSelected] = useState<string | null>(() => nodes.some((node) => node.id === requestedId) ? requestedId! : currentGoalId ?? nodes[0]?.id ?? null);
  const [detailOpen, setDetailOpen] = useState(false), [listOpen, setListOpen] = useState(false), [guideEnabled, setGuideEnabled] = useState(true), [systemReduced, setSystemReduced] = useState(false);
  const [momentsOpen, setMomentsOpen] = useState(false), [momentCluster, setMomentCluster] = useState<string | null>(null);
  const timeline = useMemo(() => buildJourneyTimeline({ nodes: nodes.map((node) => ({ ...node, progressPercent: node.progressPercent ?? 0 })), events }), [nodes, events]);
  const clusters = useMemo(() => timeline.entries.flatMap((entry) => entry.kind === "event_cluster" ? [{ ...entry, anchorId: entry.anchorKey === "before:first" ? timeline.orderedNodes[0]?.id ?? null : timeline.orderedNodes[Number(entry.anchorKey.slice(6))]?.id ?? null }] : []), [timeline]);
  const [momentPositions, setMomentPositions] = useState<Array<{ id: string; x: number; y: number }>>([]);
  const [camera, setCamera] = useState<JourneyCamera>({ x: 0, y: 0, scale: 1 });
  const [guidePlacement, setGuidePlacement] = useState(hiddenGuide), [dragging, setDragging] = useState(false);
  const cameraRef = useRef(camera), initialized = useRef(false), restored = useRef<StoredView | null>(null), animation = useRef<number | null>(null), suppressClick = useRef(false);
  const lastRequestedId = useRef(requestedId);
  const pointer = useRef<{ id: number; x: number; y: number; camera: JourneyCamera; moved: boolean } | null>(null);
  const orientation = viewport.width < viewport.height ? "portrait" : "landscape";
  const scene = world[orientation];
  const minimumScale = viewport.width ? Math.max(viewport.width / scene.intrinsic.width, viewport.height / scene.intrinsic.height) : 1;
  const pageSize = useMemo(() => journeyPageSize(scene, minimumScale), [scene, minimumScale]);
  const selectedIndex = Math.max(0, nodes.findIndex((node) => node.id === selected));
  const pageIndex = Math.floor(selectedIndex / pageSize), visible = nodes.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const points = useMemo(() => distributeJourneyNodes(scene, visible.length), [scene, visible.length]);
  const active = nodes.find((node) => node.id === selected) ?? null;
  const layoutKey = `${worldId}:${presentation.runtimeRelease}:${orientation}:${viewport.width}:${viewport.height}:${JSON.stringify(scene.controlPoints)}`;
  const storageKey = `nxttrack:journey-view:${contextKey}`;
  const latest = useRef({ selected, camera, layoutKey }); latest.current = { selected, camera, layoutKey };
  const quiet = reducedMotion || systemReduced;
  const url = (id: string | null | undefined) => id && presentation.assets[id] ? assetUrls?.[id] ?? presentationAssetUrl(presentation.assets[id]) : null;

  useLayoutEffect(() => {
    const element = root.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)"); const changed = () => setSystemReduced(media.matches);
    changed(); media.addEventListener("change", changed); return () => media.removeEventListener("change", changed);
  }, []);
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(storageKey), value = raw ? JSON.parse(raw) as StoredView : null;
      if (value && Date.now() - value.at < 30 * 60 * 1000 && typeof value.layoutKey === "string" && value.camera && [value.camera.x, value.camera.y, value.camera.scale].every(Number.isFinite) && nodes.some((node) => node.id === value.selectedId)) {
        restored.current = value;
        if (!requestedId) setSelected(value.selectedId);
      }
    } catch { /* View state is optional; blocked storage cannot prevent reading the journey. */ }
    return () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
      try { sessionStorage.setItem(storageKey, JSON.stringify({ selectedId: latest.current.selected, camera: latest.current.camera, layoutKey: latest.current.layoutKey, at: Date.now() })); } catch { /* No data mutation is lost. */ }
    };
    // State belongs to this context; subsequent server refreshes must not restore/reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (requestedId !== lastRequestedId.current && requestedId && nodes.some((node) => node.id === requestedId)) setSelected(requestedId);
    else if (!nodes.some((node) => node.id === selected)) { setSelected(currentGoalId ?? nodes[0]?.id ?? null); setDetailOpen(false); }
    lastRequestedId.current = requestedId;
  }, [requestedId, nodes, selected]);

  function updateCamera(next: JourneyCamera) {
    if (!viewport.width || !viewport.height) return;
    const bounded = clampJourneyCamera(next, scene, viewport); cameraRef.current = bounded;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = requestAnimationFrame(() => { setCamera(bounded); animation.current = null; });
  }
  const updateCameraRef = useRef(updateCamera); updateCameraRef.current = updateCamera;
  useEffect(() => {
    const element = viewportRef.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      // Only horizontal scene exploration is consumed; vertical page scrolling stays native.
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientWidth : 1;
      updateCameraRef.current({ ...cameraRef.current, x: cameraRef.current.x - event.deltaX * unit, y: cameraRef.current.y - event.deltaY * unit });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);
  function focusIndex(index: number, opening = false, scale = cameraRef.current.scale) {
    const currentPage = Math.floor(index / pageSize), count = Math.min(pageSize, nodes.length - currentPage * pageSize);
    const point = distributeJourneyNodes(scene, count)[index % pageSize]; if (!point) return;
    const targetScene = opening && orientation === "portrait" ? { ...scene, safeZones: { topFraction: 0.15, bottomFraction: 0.5 } } : scene;
    updateCamera(focusJourneyCamera(point, { ...cameraRef.current, scale }, targetScene, viewport));
  }
  useLayoutEffect(() => {
    if (!viewport.width || !viewport.height) return;
    const saved = restored.current;
    if (!initialized.current && saved?.layoutKey === layoutKey && (!requestedId || requestedId === saved.selectedId)) updateCamera(saved.camera);
    else if (initialized.current || !quiet) focusIndex(selectedIndex, detailOpen, minimumScale * (orientation === "portrait" ? 1.65 : 1.2));
    else updateCamera({ x: (viewport.width - scene.intrinsic.width * minimumScale) / 2, y: (viewport.height - scene.intrinsic.height * minimumScale) / 2, scale: minimumScale });
    initialized.current = true;
    // Geometry/orientation changes retain the selected ID. Score refreshes leave the camera alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);
  useLayoutEffect(() => {
    if (!root.current || !viewport.width || !viewport.height || !active || !guideEnabled || presentation.guide.mode === "none") { setGuidePlacement(hiddenGuide); return; }
    const bounds = root.current.getBoundingClientRect();
    const rect = (element: Element) => { const box = element.getBoundingClientRect(); return { x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height }; };
    const target = root.current.querySelector(`[data-rich-node="${CSS.escape(active.id)}"]`);
    if (!target) { setGuidePlacement(hiddenGuide); return; }
    const width = presentation.guide.mode === "character" ? orientation === "portrait" ? presentation.guide.widthMobile : presentation.guide.widthDesktop : presentation.guide.halo ? 54 : 22;
    const height = presentation.guide.mode === "character" ? width / presentation.guide.aspectRatio : width;
    const placement = selectMascotPlacement({ anchor: rect(target), bounds: { x: 0, y: 0, width: viewport.width, height: viewport.height }, exclusions: [...root.current.querySelectorAll("[data-rich-obstacle]")].map(rect), preferredWidth: width, preferredHeight: height, clearance: 16 });
    setGuidePlacement((old) => JSON.stringify(old) === JSON.stringify(placement) ? old : placement);
  }, [active, camera, detailOpen, guideEnabled, orientation, presentation.guide, viewport]);

  useLayoutEffect(() => {
    const element = root.current; if (!element || !viewport.width || !viewport.height) return;
    const bounds = element.getBoundingClientRect();
    const rect = (node: Element) => { const box = node.getBoundingClientRect(); return { x: box.x - bounds.x, y: box.y - bounds.y, width: box.width, height: box.height }; };
    const exclusions = [...element.querySelectorAll("[data-rich-obstacle]:not([data-journey-moment]), [data-rich-guide]")].map(rect);
    const placements: typeof momentPositions = [];
    for (const cluster of clusters) {
      const anchor = cluster.anchorId ? element.querySelector(`[data-rich-node="${CSS.escape(cluster.anchorId)}"]`) : null;
      if (!anchor) continue; // Off-page and unanchored moments remain in the complete accessible list.
      const box = rect(anchor);
      if (box.x < 0 || box.y < 0 || box.x + box.width > viewport.width || box.y + box.height > viewport.height) continue;
      const placed = selectMascotPlacement({ anchor: box, bounds: { x: 0, y: 0, ...viewport }, exclusions, preferredWidth: 44, preferredHeight: 44, clearance: 12 });
      if (placed.mode !== "candidate" || placed.width < 44 || placed.height < 44) continue; // Never visually attach a moment to an unrelated distant dock.
      placements.push({ id: cluster.id, x: placed.x, y: placed.y }); exclusions.push(placed);
    }
    setMomentPositions((previous) => JSON.stringify(previous) === JSON.stringify(placements) ? previous : placements);
  }, [clusters, camera, viewport, detailOpen, guidePlacement]);
  function openMoments(cluster: string | null, trigger: HTMLElement) { momentTrigger.current = trigger; setMomentCluster(cluster); setMomentsOpen(true); }

  function selectNode(node: PortalJourneyViewNode, open: boolean, trigger?: HTMLElement) {
    if (trigger) lastTrigger.current = trigger;
    const index = nodes.findIndex((entry) => entry.id === node.id);
    setSelected(node.id); setDetailOpen(open); focusIndex(index, open); onSelect?.(node.id);
  }
  function relative(delta: number) { const node = nodes[selectedIndex + delta]; if (node) selectNode(node, false); }
  function closeDetail() { setDetailOpen(false); requestAnimationFrame(() => lastTrigger.current?.isConnected ? lastTrigger.current.focus({ preventScroll: true }) : root.current?.focus({ preventScroll: true })); }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && detailOpen) { event.preventDefault(); closeDetail(); return; }
    if (event.target instanceof HTMLElement && event.target.closest("a,input,select,textarea,dialog,[role=dialog]")) return;
    const index = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? Math.max(0, selectedIndex - 1) : ["ArrowRight", "ArrowDown"].includes(event.key) ? Math.min(nodes.length - 1, selectedIndex + 1) : null;
    if (index === null || !nodes[index]) return;
    event.preventDefault(); selectNode(nodes[index], false);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`[data-rich-node="${CSS.escape(nodes[index].id)}"]`)?.focus({ preventScroll: true }));
  }
  function startPointer(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, camera: cameraRef.current, moved: false }; suppressClick.current = false;
  }
  function movePointer(event: PointerEvent<HTMLDivElement>) {
    const origin = pointer.current; if (!origin || origin.id !== event.pointerId) return;
    const dx = event.clientX - origin.x, dy = event.clientY - origin.y;
    if (!origin.moved && Math.hypot(dx, dy) < 8) return;
    if (!origin.moved) { origin.moved = true; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }
    suppressClick.current = true; updateCamera({ ...origin.camera, x: origin.camera.x + dx, y: origin.camera.y + dy });
  }
  function stopPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointer.current?.id !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointer.current = null; setDragging(false);
  }
  const guideAsset = presentation.guide.mode === "character" ? url(presentation.guide.poses[dragging ? "travel" : detailOpen ? "look" : "idle"] ?? presentation.guide.poses.idle) : null;
  const route = useMemo(() => journeyRoutePath(scene), [scene]);

  return <section ref={root} className={styles.scene} aria-label={title} tabIndex={0} onKeyDown={keyDown} data-rich-journey data-world-id={worldId} data-orientation={orientation} data-reduced-motion={quiet} data-node-count={nodes.length}>
    <div ref={viewportRef} className={styles.viewport} data-dragging={dragging} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={stopPointer} onPointerCancel={stopPointer} onLostPointerCapture={() => { pointer.current = null; setDragging(false); }} onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
      <div className={styles.world} data-rich-world style={{ width: scene.intrinsic.width, height: scene.intrinsic.height, transform: `translate3d(${camera.x}px,${camera.y}px,0) scale(${camera.scale})` }}>
        {(["back", "mid", "front"] as const).map((layer) => {
          const src = url(scene.layers[layer]); return src ? <img key={`${orientation}:${layer}:${src}`} src={src} alt="" draggable={false} decoding="async" className={`${styles.layer} ${layer === "front" ? styles.front : ""}`} data-rich-layer={layer} style={{ objectFit: scene.quality === "legacy-crop" ? "cover" : "fill" }} width={scene.intrinsic.width} height={scene.intrinsic.height} onError={(event) => { event.currentTarget.style.visibility = "hidden"; }} /> : null;
        })}
        <svg className={styles.route} data-glow={guideEnabled && presentation.guide.mode === "route-light" && presentation.guide.routeGlow} aria-hidden="true" viewBox={`0 0 ${scene.intrinsic.width} ${scene.intrinsic.height}`}><path d={route} fill="none" stroke="white" strokeWidth={3} strokeDasharray="2 9" vectorEffect="non-scaling-stroke" /></svg>
        {visible.map((node, index) => {
          const artwork = resolvePearlArtwork(presentation, node.criterionIdentity);
          return <div key={node.id} className={styles.marker} style={{ left: `${points[index].x}%`, top: `${points[index].y}%`, transform: `translate(-50%, -50%) scale(${1 / camera.scale})` }}>
            <button type="button" className={styles.pearl} data-state={node.state} data-rich-node={node.id} data-rich-obstacle aria-label={`${node.label}. ${nodeStatus(node)}`} data-selected={selected === node.id} aria-current={currentGoalId === node.id ? "step" : undefined} aria-expanded={selected === node.id && detailOpen} onClick={(event) => selectNode(node, true, event.currentTarget)}>
              {artwork ? <img src={assetUrls?.[presentation.pearlArtwork.byCriterionIdentity[node.criterionIdentity]] ?? presentationAssetUrl(artwork)} alt="" /> : null}
              {node.completed ? <Check aria-hidden="true" /> : <span aria-hidden="true">{node.rating ?? "·"}</span>}
            </button>
            {visible.length <= 7 || selected === node.id ? <span className={styles.label} data-rich-label data-rich-obstacle>{node.label}</span> : null}
          </div>;
        })}
        {guideEnabled && guidePlacement.mode !== "hidden" && presentation.guide.mode !== "none" ? <div aria-hidden="true" className={styles.guide} data-rich-guide={presentation.guide.mode} style={{ left: (guidePlacement.x - camera.x) / camera.scale, top: (guidePlacement.y - camera.y) / camera.scale, width: guidePlacement.width, height: guidePlacement.height, transform: `scale(${1 / camera.scale})` }}>
          {presentation.guide.mode === "route-light" ? <span className={styles.light} data-halo={presentation.guide.halo} data-pulse={!quiet && presentation.guide.pulse} /> : guideAsset ? <img src={guideAsset} alt="" draggable={false} /> : null}
        </div> : null}
      </div>
    </div>
    {momentPositions.map((position) => {
      const cluster = clusters.find((entry) => entry.id === position.id)!;
      return <button key={position.id} type="button" className={styles.moment} data-journey-moment data-rich-obstacle style={{ left: position.x, top: position.y }} aria-label={`${cluster.events.length} ${cluster.events.length === 1 ? "moment" : "momenten"} bij ${nodes.find((node) => node.id === cluster.anchorId)?.label ?? "deze reis"}`} onClick={(event) => openMoments(cluster.id, event.currentTarget)}><Award aria-hidden="true" /><span>{cluster.events.length}</span></button>;
    })}
    <header className={styles.heading} data-rich-obstacle><small>{model?.stageName ?? "Mijn reis"}</small><h1>{title}</h1><p>{world.name}</p></header>
    {lesson ? <Link className={styles.lesson} data-rich-obstacle href={lesson.href} aria-label={`Volgende les: ${lesson.label}`}>{lesson.label}</Link> : null}
    {scene.quality === "fixture-only" ? <p className={styles.fixture} data-rich-obstacle>Testweergave · originele wereldbeelden en ankers ontbreken</p> : null}
    {!nodes.length ? <p className={styles.empty}>De onderdelen verschijnen zodra een curriculum is gekoppeld.</p> : null}
    {model?.rings.length ? <div className={styles.pod} data-rich-obstacle aria-label="Voortgang en dekking">
      {model.rings.map((ring) => <div className={styles.ring} key={`${ring.kind}:${ring.key}`} title={`Dekking: ${ring.coveragePercent === null ? "onbekend" : `${ring.coveragePercent}%`}. ${ring.assessedCount} van ${ring.contributingCount} beoordeeld.`}>
        <span role="img" aria-label={`${ring.label}: ${ring.progressPercent === null ? "voortgang onbekend" : `${ring.progressPercent}%`}`}><svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="25" className={styles.ringTrack} /><circle cx="30" cy="30" r="25" className={styles.ringValue} pathLength="100" strokeDasharray={`${ring.progressPercent ?? 0} 100`} /></svg><b>{ring.progressPercent === null ? "—" : `${Math.round(ring.progressPercent)}%`}</b></span><small>{ring.label}</small>
      </div>)}
    </div> : null}
    <nav className={styles.controls} aria-label="Wereld verkennen" data-rich-obstacle>
      {collectionControls}
      <button ref={listTrigger} type="button" onClick={() => setListOpen(true)} aria-label={`Alle ${nodes.length} onderdelen`}><List aria-hidden="true" /></button>
      {clusters.length ? <button type="button" onClick={(event) => openMoments(null, event.currentTarget)} aria-label={`Alle ${clusters.reduce((count, entry) => count + entry.events.length, 0)} momenten`}><Award aria-hidden="true" /></button> : null}
      <button type="button" disabled={!nodes.length || selectedIndex === 0} onClick={() => relative(-1)} aria-label="Vorig onderdeel"><ArrowLeft aria-hidden="true" /></button>
      <button type="button" disabled={!nodes.length || selectedIndex === nodes.length - 1} onClick={() => relative(1)} aria-label="Volgend onderdeel"><ArrowRight aria-hidden="true" /></button>
      <button type="button" onClick={() => focusIndex(selectedIndex, detailOpen, cameraRef.current.scale * 1.2)} aria-label="Inzoomen"><Plus aria-hidden="true" /></button>
      <button type="button" onClick={() => focusIndex(selectedIndex, detailOpen, cameraRef.current.scale / 1.2)} aria-label="Uitzoomen"><Minus aria-hidden="true" /></button>
      <button type="button" onClick={() => focusIndex(selectedIndex, false, minimumScale * 1.2)} aria-label="Camera herstellen"><RotateCcw aria-hidden="true" /></button>
      {presentation.guide.mode !== "none" ? <button type="button" aria-pressed={guideEnabled} onClick={() => setGuideEnabled(!guideEnabled)} aria-label="Gids tonen"><Sparkles aria-hidden="true" /></button> : null}
    </nav>
    <p className={styles.pageInfo} aria-live="polite">{nodes.length > pageSize ? `Deel ${pageIndex + 1} van ${Math.ceil(nodes.length / pageSize)} · alle ${nodes.length} onderdelen beschikbaar in de lijst` : "Sleep door de wereld of gebruik de pijlen"}</p>
    {active && detailOpen ? <aside className={styles.detail} aria-label="Onderdeel bekijken" data-rich-obstacle><button type="button" className={styles.close} onClick={closeDetail} aria-label="Detailkaart sluiten"><X aria-hidden="true" /></button><small>{nodeStatus(active)}</small><h2>{active.label}</h2><p>{active.description ?? "Dit onderdeel oefen je tijdens de les."}</p>{active.positiveLabel ? <p>{active.positiveLabel}</p> : null}<Link href={detailHref(active.id)}>Ontwikkeling en historie <ArrowRight aria-hidden="true" /></Link></aside> : null}
    <PortalDialog open={momentsOpen} onOpenChange={setMomentsOpen} title="Bijzondere momenten" description="Echte behaalde badges, naast je leeronderdelen. Ze veranderen je beoordelingen en lesdoel niet." returnFocusRef={momentTrigger}>
      <ol className={styles.momentList}>{clusters.filter((cluster) => !momentCluster || cluster.id === momentCluster).flatMap((cluster) => cluster.events).map((event) => <li key={event.id} data-journey-event={event.id}><h3>{event.label}</h3><time dateTime={event.earnedAt}>{momentDate(event.earnedAt)}</time><p>{event.eventType === "surprise_badge" ? "Verrassingsbadge" : "Badge behaald"}</p>{event.description ? <p>{event.description}</p> : null}</li>)}</ol>
      {momentCluster ? <button type="button" className={styles.allMoments} onClick={() => setMomentCluster(null)}>Alle momenten bekijken</button> : null}
    </PortalDialog>
    <PortalDialog open={listOpen} onOpenChange={setListOpen} title="Alle onderdelen" description="Ieder onderdeel blijft bereikbaar. Een selectie verandert geen beoordeling of lesdoel." returnFocusRef={listTrigger}>
      <ol className={styles.list}>{nodes.map((node) => <li key={node.id}><button type="button" onClick={() => { setListOpen(false); selectNode(node, true); }}><span>{node.label}<small>{nodeStatus(node)}</small></span><ArrowRight aria-hidden="true" /></button></li>)}</ol>
      {!nodes.length ? <p>Er zijn nog geen onderdelen gekoppeld.</p> : null}
    </PortalDialog>
  </section>;
}

export function nodeStatus(node: PortalJourneyViewNode): string {
  return node.completed ? "Behaald" : node.state === "carryover" ? "Meegenomen onderdeel" : node.rating === null ? "Nog niet beoordeeld" : `${node.rating} van 5 · aan het oefenen`;
}

function momentDate(value: string) { return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeZone: "Europe/Amsterdam" }).format(new Date(value)) : "Datum niet vastgelegd"; }
