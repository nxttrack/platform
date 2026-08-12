"use client";

import { Award, Check, Sparkles, X } from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from "react";

import {
  buildJourneyTimeline,
  classifyJourneyGesture,
  journeyRouteGeometry,
  mascotMotionPlan,
  selectMascotPlacement,
  type JourneyMascotPlacement,
  type JourneyRect,
  type JourneyTimelineEvent
} from "@/lib/theme/portal-journey-contract";
import { cn } from "@/lib/utils";

const HELP_SCOPE = "journey-direct-manipulation-v1";
const HELP_STORAGE_KEY = `nxttrack:help:${HELP_SCOPE}`;
let memoryHelpDismissed = false;

export type ChildJourneyNodeDto = {
  id: string;
  label: string;
  progressPercent: number;
  completed: boolean;
  assessed: boolean;
  completedAt: string | null;
  completionSequence: number | null;
  completionOrderStatus: "event_sequence" | "legacy_inferred" | null;
  curriculumOrder: number;
  lastUpdatedAt: string | null;
  positiveLabel: string | null;
};

type RenderedEntry =
  | { id: string; kind: "main"; node: ChildJourneyNodeDto }
  | { clusterId: string; clusterOrdinal: number; clusterSize: number; event: JourneyTimelineEvent; id: string; kind: "event" };

type PointerJourney = {
  axis: "horizontal" | "undecided" | "vertical";
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
};

const HIDDEN_PLACEMENT: JourneyMascotPlacement = { height: 0, mode: "hidden", width: 0, x: 0, y: 0 };

export function ChildJourneyMap({
  nodes,
  events = [],
  desktopArtwork,
  mobileArtwork,
  mascotKind,
  mascotUrl
}: {
  nodes: ChildJourneyNodeDto[];
  events?: JourneyTimelineEvent[];
  desktopArtwork: string | null;
  mobileArtwork: string | null;
  mascotKind: "beach-lifeguard" | "dolphin" | "manta" | "penguin" | "sea-turtle" | null;
  mascotUrl: string | null;
}) {
  const timeline = useMemo(() => buildJourneyTimeline({ nodes, events }), [events, nodes]);
  const entries = useMemo<RenderedEntry[]>(() => {
    const result: RenderedEntry[] = [];
    for (const entry of timeline.entries) {
      if (entry.kind === "main") result.push({ id: entry.node.id, kind: "main", node: entry.node });
      else entry.events.forEach((event, clusterOrdinal) => result.push({
        clusterId: entry.id,
        clusterOrdinal,
        clusterSize: entry.events.length,
        event,
        id: `event:${event.id}`,
        kind: "event"
      }));
    }
    return result;
  }, [timeline.entries]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(timeline.currentGoalId ?? entries[0]?.id ?? null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [viewport, setViewport] = useState({ height: 0, width: 0 });
  const [visualReady, setVisualReady] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [mascotPlacement, setMascotPlacement] = useState<JourneyMascotPlacement>(HIDDEN_PLACEMENT);
  const [mascotSettledEntryId, setMascotSettledEntryId] = useState<string | null>(null);
  const [motionSettled, setMotionSettled] = useState(() => !(mascotKind && mascotUrl && entries.length && timeline.currentGoalId));
  const [cameraSettled, setCameraSettled] = useState(true);
  const [cameraEpoch, setCameraEpoch] = useState(0);
  const viewportRef = useRef<HTMLElement>(null);
  const worldRef = useRef<HTMLOListElement>(null);
  const popupRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const mascotRef = useRef<HTMLImageElement>(null);
  const pointerRef = useRef<PointerJourney | null>(null);
  const previousMascotPlacementRef = useRef<JourneyMascotPlacement | null>(null);
  const pendingMascotEntryRef = useRef<string | null>(null);
  const collisionRectsRef = useRef<JourneyRect[]>([]);
  const wheelDeltaRef = useRef(0);
  const suppressClickRef = useRef(false);
  const previousCameraRef = useRef<{ x: number; y: number } | null>(null);
  const selectedIndex = Math.max(0, entries.findIndex((entry) => entry.id === selectedEntryId));
  const currentGoalIndex = entries.findIndex((entry) => entry.id === timeline.currentGoalId);
  const orientation = viewport.width < 768 ? "mobile" as const : "desktop" as const;
  const geometry = useMemo(() => journeyRouteGeometry({
    entryCount: entries.length,
    orientation,
    selectedIndex,
    viewportHeight: viewport.height,
    viewportWidth: viewport.width
  }), [entries.length, orientation, selectedIndex, viewport.height, viewport.width]);
  const renderedPositions = useMemo(() => compactClusterPositions(entries, geometry.positions, orientation), [entries, geometry.positions, orientation]);
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const openEntry = entries.find((entry) => entry.id === openEntryId) ?? null;
  const canShowMascot = Boolean(visualReady && mascotKind && mascotUrl && entries.length && timeline.currentGoalId);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport({ height: element.clientHeight, width: element.clientWidth });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    let active = true;
    Promise.resolve(document.fonts?.ready).then(() => {
      if (!active) return;
      update();
      requestAnimationFrame(() => setVisualReady(true));
    });
    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  const hasOffscreenRoute = visualReady && entries.length > 1 && (orientation === "desktop"
    ? geometry.worldWidth > viewport.width + 1
    : geometry.worldHeight > viewport.height + 1);

  useEffect(() => {
    if (!hasOffscreenRoute) {
      setShowHelp(false);
      return;
    }
    let dismissed = memoryHelpDismissed;
    try {
      dismissed ||= window.localStorage.getItem(HELP_STORAGE_KEY) === "dismissed";
    } catch {
      // Storage can be unavailable in hardened/private browsing. The module-level
      // flag still limits the hint to this document session.
    }
    setShowHelp(!dismissed);
  }, [hasOffscreenRoute]);

  useEffect(() => {
    if (!entries.length) {
      setSelectedEntryId(null);
      setOpenEntryId(null);
      return;
    }
    if (selectedEntryId && entries.some((entry) => entry.id === selectedEntryId)) return;
    const fallback = timeline.currentGoalId ?? entries[0]!.id;
    setSelectedEntryId(fallback);
    setOpenEntryId(null);
    setAnnouncement("De bekeken stap is niet meer beschikbaar. Je huidige doel is weer in beeld.");
  }, [entries, selectedEntryId, timeline.currentGoalId]);

  useLayoutEffect(() => {
    if (!openEntryId || !popupRef.current || !viewportRef.current) return;
    const popup = popupRef.current;
    const marker = markerFor(openEntryId);
    if (!marker) return;
    const viewportBox = viewportRef.current.getBoundingClientRect();
    const markerBox = marker.getBoundingClientRect();
    const popupBox = popup.getBoundingClientRect();
    if (orientation === "mobile") {
      popup.style.removeProperty("left");
      popup.style.top = "8px";
      return;
    }
    const markerX = markerBox.left - viewportBox.left;
    const markerY = markerBox.top - viewportBox.top;
    const placeRight = markerX + markerBox.width + 18 + popupBox.width <= viewportBox.width - 12;
    const left = placeRight ? markerX + markerBox.width + 18 : markerX - popupBox.width - 18;
    const top = Math.min(viewportBox.height - popupBox.height - 12, Math.max(12, markerY - popupBox.height / 2 + markerBox.height / 2));
    popup.style.left = `${Math.max(12, left)}px`;
    popup.style.top = `${top}px`;
  }, [geometry, openEntryId, orientation, viewport]);

  useLayoutEffect(() => {
    const next = { x: geometry.cameraX, y: geometry.cameraY };
    const previous = previousCameraRef.current;
    previousCameraRef.current = next;
    if (previous && (Math.abs(previous.x - next.x) > 0.5 || Math.abs(previous.y - next.y) > 0.5)) {
      setCameraSettled(false);
    }
  }, [geometry.cameraX, geometry.cameraY]);

  useEffect(() => {
    if (cameraSettled) return;
    // `transitionend` is the primary signal. The bounded fallback covers a
    // browser cancelling the event during resize/orientation interruption.
    const timeout = window.setTimeout(() => {
      setCameraSettled(true);
      setCameraEpoch((value) => value + 1);
    }, 520);
    return () => window.clearTimeout(timeout);
  }, [cameraSettled, geometry.cameraX, geometry.cameraY]);

  useLayoutEffect(() => {
    if (!canShowMascot || !viewportRef.current || !selectedEntryId) {
      setMascotPlacement(HIDDEN_PLACEMENT);
      setMascotSettledEntryId(null);
      return;
    }
    if (!cameraSettled) {
      setMotionSettled(false);
      return;
    }
    // Mark geometry as unsettled before the next paint so observers cannot
    // mistake the previous safe endpoint for the newly requested one.
    setMotionSettled(false);
    setMascotSettledEntryId(null);
    const frame = requestAnimationFrame(() => {
      const viewportElement = viewportRef.current;
      const marker = markerFor(selectedEntryId);
      if (!viewportElement || !marker) return;
      const bounds = viewportElement.getBoundingClientRect();
      const localRect = (rect: DOMRect): JourneyRect => ({
        x: rect.left - bounds.left,
        y: rect.top - bounds.top,
        width: rect.width,
        height: rect.height
      });
      const visibleMarkers = [...viewportElement.querySelectorAll<HTMLElement>("[data-child-journey-entry]")]
        .map((entry) => entry.getBoundingClientRect())
        .filter((rect) => rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom)
        .map(localRect);
      const overlays = [popupRef.current, tooltipRef.current]
        .flatMap((element) => element ? [localRect(element.getBoundingClientRect())] : []);
      const externalExclusions = [...(viewportElement.parentElement?.querySelectorAll<HTMLElement>("[data-journey-exclusion]") ?? [])]
        .filter((element) => getComputedStyle(element).display !== "none" && getComputedStyle(element).visibility !== "hidden")
        .map((element) => localRect(element.getBoundingClientRect()));
      const exclusions = visibleMarkers.concat(overlays, externalExclusions);
      collisionRectsRef.current = exclusions;
      const preferredWidth = orientation === "mobile" ? 92 : 138;
      const aspect = mascotAspect(mascotKind);
      const placement = selectMascotPlacement({
        anchor: localRect(marker.getBoundingClientRect()),
        bounds: { x: 0, y: 0, width: bounds.width, height: bounds.height },
        exclusions,
        preferredHeight: preferredWidth / aspect,
        preferredWidth
      });
      if (samePlacement(previousMascotPlacementRef.current, placement)) {
        pendingMascotEntryRef.current = selectedEntryId;
        // A compositor can still be painting the previous WAAPI endpoint even
        // when layout already exposes the new left/top values. Re-enter the
        // endpoint verifier instead of publishing a premature settled signal.
        setMascotPlacement({ ...placement });
        return;
      }
      pendingMascotEntryRef.current = selectedEntryId;
      setMascotPlacement(placement);
    });
    return () => cancelAnimationFrame(frame);
  }, [cameraEpoch, cameraSettled, canShowMascot, geometry, mascotKind, openEntryId, orientation, selectedEntryId, showHelp, viewport]);

  useEffect(() => {
    const element = mascotRef.current;
    if (!element || mascotPlacement.mode === "hidden") {
      previousMascotPlacementRef.current = mascotPlacement;
      setMascotSettledEntryId(null);
      setMotionSettled(true);
      return;
    }
    const targetEntryId = pendingMascotEntryRef.current;
    const previous = previousMascotPlacementRef.current;
    previousMascotPlacementRef.current = mascotPlacement;
    let active = true;
    let paintFrame = 0;
    let endpointAttempts = 0;
    let stableEndpointFrames = 0;
    const settleAfterRenderedEndpoint = () => {
      if (!active) return;
      paintFrame = requestAnimationFrame(() => {
        if (!active) return;
        const viewportElement = viewportRef.current;
        if (!viewportElement) return;
        const viewportBox = viewportElement.getBoundingClientRect();
        const mascotBox = element.getBoundingClientRect();
        const endpointMatches = Math.abs(mascotBox.left - (viewportBox.left + mascotPlacement.x)) <= 1
          && Math.abs(mascotBox.top - (viewportBox.top + mascotPlacement.y)) <= 1
          && Math.abs(mascotBox.width - mascotPlacement.width) <= 1
          && Math.abs(mascotBox.height - mascotPlacement.height) <= 1;
        stableEndpointFrames = endpointMatches ? stableEndpointFrames + 1 : 0;
        endpointAttempts += 1;
        if (stableEndpointFrames >= 2) {
          setMascotSettledEntryId(targetEntryId);
          setMotionSettled(true);
          return;
        }
        if (endpointAttempts >= 90) {
          // Re-measure all live blockers instead of ever publishing a stale
          // compositor position as collision-safe.
          setCameraEpoch((value) => value + 1);
          return;
        }
        settleAfterRenderedEndpoint();
      });
    };
    if (!previous || previous.mode === "hidden" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      settleAfterRenderedEndpoint();
      return () => {
        active = false;
        cancelAnimationFrame(paintFrame);
      };
    }
    const plan = mascotMotionPlan({ from: previous, to: mascotPlacement, exclusions: collisionRectsRef.current });
    setMotionSettled(false);
    const animation = element.animate(
      plan.mode === "crossfade"
        ? [{ opacity: 0 }, { opacity: 1 }]
        : plan.points.map((point) => ({
            opacity: 1,
            transform: `translate(${point.x - mascotPlacement.x}px, ${point.y - mascotPlacement.y}px)`
          })),
      { duration: plan.mode === "crossfade" ? 180 : 420, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
    animation.finished.then(settleAfterRenderedEndpoint).catch(settleAfterRenderedEndpoint);
    return () => {
      active = false;
      cancelAnimationFrame(paintFrame);
      animation.cancel();
    };
  }, [mascotPlacement]);

  function markerFor(id: string) {
    return worldRef.current?.querySelector<HTMLButtonElement>(`[data-child-journey-entry="${CSS.escape(id)}"]`) ?? null;
  }

  function dismissHelp() {
    memoryHelpDismissed = true;
    setShowHelp(false);
    try {
      window.localStorage.setItem(HELP_STORAGE_KEY, "dismissed");
    } catch {
      // The journey remains fully operable when persistent storage is blocked.
    }
  }

  function selectIndex(index: number, options: { focus?: boolean; open?: boolean } = {}) {
    const next = entries[Math.min(entries.length - 1, Math.max(0, index))];
    if (!next) return;
    setSelectedEntryId(next.id);
    if (options.open) setOpenEntryId(next.id);
    if (options.focus) requestAnimationFrame(() => markerFor(next.id)?.focus({ preventScroll: true }));
  }

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedEntryId(entries[index]?.id ?? null);
      setOpenEntryId(entries[index]?.id ?? null);
      return;
    }
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? entries.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? Math.min(entries.length - 1, index + 1)
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    dismissHelp();
    selectIndex(nextIndex, { focus: true });
  }

  function scrollHorizontally(event: WheelEvent<HTMLElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    wheelDeltaRef.current += event.deltaX;
    if (Math.abs(wheelDeltaRef.current) < 36) return;
    dismissHelp();
    selectIndex(selectedIndex + (wheelDeltaRef.current > 0 ? 1 : -1));
    wheelDeltaRef.current = 0;
  }

  function startPointer(event: PointerEvent<HTMLElement>) {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (openEntryId && !target?.closest(".child-journey-map__popup") && !target?.closest("[data-child-journey-entry]")) {
      // Outside-click closure deliberately does not restore focus: the natural
      // pointer destination remains authoritative.
      setOpenEntryId(null);
    }
    if (event.button !== 0) return;
    pointerRef.current = {
      axis: "undecided",
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY
    };
  }

  function movePointer(event: PointerEvent<HTMLElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.axis === "vertical") return;
    const deltaX = event.clientX - pointer.startX;
    const deltaY = event.clientY - pointer.startY;
    if (pointer.axis === "undecided") {
      pointer.axis = classifyJourneyGesture({ deltaX, deltaY });
      if (pointer.axis === "horizontal") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // A browser can revoke an active pointer between classification and
          // capture (for example when native scrolling wins the gesture).
          // Selection still resolves safely on pointerup when it arrives.
        }
      }
    }
    if (pointer.axis !== "horizontal") return;
    event.preventDefault();
    setDragOffset(deltaX);
  }

  function finishPointer(event: PointerEvent<HTMLElement>) {
    const pointer = pointerRef.current;
    pointerRef.current = null;
    setDragOffset(0);
    if (!pointer || pointer.pointerId !== event.pointerId || pointer.axis !== "horizontal") return;
    const deltaX = event.clientX - pointer.startX;
    if (Math.abs(deltaX) < 36) return;
    suppressClickRef.current = true;
    dismissHelp();
    const stepCount = Math.max(1, Math.round(Math.abs(deltaX) / 110));
    selectIndex(selectedIndex + (deltaX < 0 ? stepCount : -stepCount));
    queueMicrotask(() => { suppressClickRef.current = false; });
  }

  function activateEntry(entry: RenderedEntry) {
    if (suppressClickRef.current) return;
    setSelectedEntryId(entry.id);
    setOpenEntryId(entry.id);
  }

  function closePopup() {
    const returnId = openEntryId;
    if (returnId) markerFor(returnId)?.focus({ preventScroll: true });
    setOpenEntryId(null);
  }

  const cameraX = geometry.cameraX + (orientation === "desktop" ? dragOffset : 0);
  const cameraY = geometry.cameraY
    + (orientation === "mobile" ? dragOffset : 0)
    + (orientation === "mobile" && openEntryId ? viewport.height * 0.19 : 0);
  const desktopPreload = journeyArtworkRendition(desktopArtwork, "landscape", "avif");
  const mobilePreload = journeyArtworkRendition(mobileArtwork, "portrait", "avif");

  return (
    <section
      aria-describedby={`${HELP_SCOPE}-description`}
      aria-label="Mijn reis"
      className="child-journey-map"
      data-camera-settled={cameraSettled ? "true" : "false"}
      data-current-goal={timeline.currentGoalId ?? undefined}
      data-dragging={dragOffset !== 0 ? "true" : "false"}
      data-entry-count={entries.length}
      data-mascot-entry={mascotSettledEntryId ?? undefined}
      data-mascot-settled={motionSettled ? "true" : "false"}
      data-motion-settled={visualReady && motionSettled && cameraSettled ? "true" : "false"}
      data-popup-open={openEntryId ? "true" : "false"}
      data-visual-ready={visualReady ? "true" : "false"}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        if (openEntryId) closePopup();
        else if (showHelp) dismissHelp();
      }}
      onPointerCancel={() => { pointerRef.current = null; setDragOffset(0); }}
      onPointerDown={startPointer}
      onPointerMove={movePointer}
      onPointerUp={finishPointer}
      onWheel={scrollHorizontally}
      ref={viewportRef}
      role="region"
      style={{
        "--child-journey-desktop": journeyArtworkSet(desktopArtwork, "landscape"),
        "--child-journey-mobile": journeyArtworkSet(mobileArtwork, "portrait")
      } as CSSProperties}
    >
      {desktopPreload ? <link as="image" fetchPriority="high" href={desktopPreload} media="(min-width: 768px)" rel="preload" type="image/avif" /> : null}
      {mobilePreload ? <link as="image" fetchPriority="high" href={mobilePreload} media="(max-width: 767px)" rel="preload" type="image/avif" /> : null}
      <p className="sr-only" id={`${HELP_SCOPE}-description`}>
        Gebruik Tab of de pijltjestoetsen voor alle stappen. Enter of spatie opent details. Escape sluit details.
      </p>
      <div aria-hidden="true" className="child-journey-map__world" />
      {entries.length ? (
        <ol
          aria-label="Onderdelen en verdiende mijlpalen van mijn reis"
          className="child-journey-map__nodes"
          onTransitionEnd={(event) => {
            if (event.propertyName !== "transform") return;
            setCameraSettled(true);
            setCameraEpoch((value) => value + 1);
          }}
          onTransitionRun={(event) => {
            if (event.propertyName === "transform") setCameraSettled(false);
          }}
          ref={worldRef}
          style={{
            height: geometry.worldHeight,
            transform: `translate3d(${cameraX}px, ${cameraY}px, 0)`,
            visibility: visualReady ? "visible" : "hidden",
            width: geometry.worldWidth
          }}
        >
          {entries.map((entry, index) => {
            const position = renderedPositions[index]!;
            const selected = entry.id === selectedEntryId;
            const current = entry.kind === "main" && entry.node.id === timeline.currentGoalId;
            const label = entry.kind === "main" ? entry.node.label : entry.event.label;
            const state = entry.kind === "main"
              ? entry.node.completed ? "voltooid" : entry.node.assessed ? `${Math.round(entry.node.progressPercent)} procent` : "nog niet beoordeeld"
              : `verdiende ${entry.event.eventType === "surprise_badge" ? "verrassingsbadge" : "badge"}`;
            return (
              <li
                className={cn("child-journey-map__entry", entry.kind === "event" && "is-event")}
                data-cluster-id={entry.kind === "event" ? entry.clusterId : undefined}
                data-cluster-size={entry.kind === "event" ? entry.clusterSize : undefined}
                key={entry.id}
                style={{ left: position.x, top: position.y }}
              >
                <button
                  aria-current={current ? "step" : undefined}
                  aria-label={`${label}, ${entry.kind === "main" ? "onderdeel" : "mijlpaal"}, ${state}${entry.kind === "main" && entry.node.lastUpdatedAt ? `, bijgewerkt ${formatDate(entry.node.lastUpdatedAt)}` : ""}`}
                  aria-pressed={selected}
                  className={cn(
                    entry.kind === "main" && entry.node.completed && "is-completed",
                    current && "is-current",
                    selected && "is-selected",
                    entry.kind === "event" && "is-event"
                  )}
                  data-child-journey-entry={entry.id}
                  onClick={() => activateEntry(entry)}
                  onFocus={() => {
                    viewportRef.current?.scrollTo({ left: 0, top: 0 });
                    setPreviewEntryId(entry.id);
                    setSelectedEntryId(entry.id);
                  }}
                  onKeyDown={(event) => moveSelection(event, index)}
                  onMouseEnter={() => setPreviewEntryId(entry.id)}
                  onMouseLeave={() => setPreviewEntryId((value) => value === entry.id ? null : value)}
                  type="button"
                >
                  <span className="child-journey-map__orb">
                    {entry.kind === "event" ? <Award aria-hidden="true" /> : entry.node.completed ? <Check aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
                  </span>
                  <strong>{label}</strong>
                  {previewEntryId === entry.id ? <small className="child-journey-map__preview">{state}</small> : null}
                </button>
              </li>
            );
          })}
        </ol>
      ) : <p className="child-journey-map__empty">Je reis wordt zichtbaar zodra jouw programma is gestart.</p>}

      {showHelp ? (
        <div className="child-journey-map__help" ref={tooltipRef} role="status">
          <span>Sleep, veeg of gebruik de pijltjestoetsen om je hele reis te bekijken.</span>
          <button aria-label="Uitleg sluiten" onClick={dismissHelp} type="button"><X aria-hidden="true" /></button>
        </div>
      ) : null}

      {canShowMascot && mascotPlacement.mode !== "hidden" ? (
        // The mascot remains a separate decorative alpha layer. Geometry, not z-index,
        // keeps its visible collision box away from markers and overlays.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          aria-hidden="true"
          className="child-journey-map__mascot"
          data-mascot-kind={mascotKind ?? undefined}
          ref={mascotRef}
          sizes="(max-width: 767px) 92px, 138px"
          src={mascotRendition(mascotUrl!, 256)}
          srcSet={`${mascotRendition(mascotUrl!, 256)} 256w, ${mascotRendition(mascotUrl!, 512)} 512w`}
          style={{
            height: mascotPlacement.height,
            left: mascotPlacement.x,
            top: mascotPlacement.y,
            width: mascotPlacement.width
          }}
        />
      ) : null}

      {openEntry ? (
        <article
          aria-describedby="child-journey-popup-description"
          aria-labelledby="child-journey-popup-title"
          className="child-journey-map__popup"
          ref={popupRef}
          role="dialog"
        >
          <button aria-label="Details sluiten" className="child-journey-map__popup-close" onClick={closePopup} type="button"><X aria-hidden="true" /></button>
          <small>{openEntry.kind === "main" ? openEntry.node.completed ? "Voltooide stap" : openEntry.node.id === timeline.currentGoalId ? "Mijn huidige doel" : "Stap in mijn reis" : openEntry.event.eventType === "surprise_badge" ? "Verrassingsbadge verdiend" : "Badge verdiend"}</small>
          <h2 id="child-journey-popup-title">{openEntry.kind === "main" ? openEntry.node.label : openEntry.event.label}</h2>
          <p id="child-journey-popup-description">
            {openEntry.kind === "main"
              ? openEntry.node.positiveLabel ?? (openEntry.node.completed ? "Knap gedaan, deze stap heb je behaald!" : "Iedere keer oefenen brengt je dichter bij dit doel.")
              : openEntry.event.description ?? "Mooi verdiend tijdens jouw reis!"}
          </p>
          {openEntry.kind === "main" ? (
            <>
              <strong>{openEntry.node.assessed ? `${Math.round(openEntry.node.progressPercent)}% voltooid` : "Nog niet beoordeeld"}</strong>
              {openEntry.node.completedAt ? <time dateTime={openEntry.node.completedAt}>Behaald op {formatDate(openEntry.node.completedAt)}</time> : openEntry.node.lastUpdatedAt ? <time dateTime={openEntry.node.lastUpdatedAt}>Bijgewerkt op {formatDate(openEntry.node.lastUpdatedAt)}</time> : null}
              <Link href={`/kind/reis?onderdeel=${encodeURIComponent(openEntry.node.id)}`}>Bekijk doel</Link>
            </>
          ) : (
            <>
              <time dateTime={openEntry.event.earnedAt}>Behaald op {formatDate(openEntry.event.earnedAt)}</time>
              <Link href={`/kind/badges?badge=${encodeURIComponent(openEntry.event.id)}&vier=1`}>Vier dit moment</Link>
            </>
          )}
        </article>
      ) : null}

      {timeline.currentGoalId && currentGoalIndex >= 0 && Math.abs(selectedIndex - currentGoalIndex) >= 3 ? (
        <button className="child-journey-map__return" onClick={() => selectIndex(currentGoalIndex, { focus: true })} type="button">
          Terug naar je doel
        </button>
      ) : null}
      <span aria-live="polite" className="sr-only">{announcement}</span>
    </section>
  );
}

function mascotAspect(kind: "beach-lifeguard" | "dolphin" | "manta" | "penguin" | "sea-turtle" | null) {
  if (kind === "penguin" || kind === "beach-lifeguard") return 0.67;
  if (kind === "manta") return 1.85;
  return 1;
}

function journeyArtworkSet(path: string | null, orientation: "landscape" | "portrait") {
  if (!path) return "none";
  const suffix = orientation === "landscape" ? "/journey-desktop.png" : "/journey-mobile.png";
  if (!path.endsWith(suffix)) return `url("${path}")`;
  const avif = journeyArtworkRendition(path, orientation, "avif")!;
  const webp = journeyArtworkRendition(path, orientation, "webp")!;
  return `image-set(url("${avif}") type("image/avif") 1x, url("${webp}") type("image/webp") 1x, url("${path}") type("image/png") 1x)`;
}

function journeyArtworkRendition(path: string | null, orientation: "landscape" | "portrait", format: "avif" | "webp") {
  if (!path) return null;
  const suffix = orientation === "landscape" ? "/journey-desktop.png" : "/journey-mobile.png";
  if (!path.endsWith(suffix)) return null;
  const width = orientation === "landscape" ? 1440 : 640;
  return `${path.slice(0, -suffix.length)}/progress-journey-${orientation}-${width}.${format}`;
}

function mascotRendition(path: string, width: 256 | 512) {
  return path.endsWith("/mascot.png") ? `${path.slice(0, -"/mascot.png".length)}/mascot-${width}.webp` : path;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}

function samePlacement(left: JourneyMascotPlacement | null, right: JourneyMascotPlacement) {
  return Boolean(left
    && left.mode === right.mode
    && Math.abs(left.x - right.x) < 0.5
    && Math.abs(left.y - right.y) < 0.5
    && Math.abs(left.width - right.width) < 0.5
    && Math.abs(left.height - right.height) < 0.5);
}

function compactClusterPositions(
  entries: readonly RenderedEntry[],
  positions: ReadonlyArray<{ x: number; y: number }>,
  orientation: "desktop" | "mobile"
) {
  const result = positions.map((position) => ({ ...position }));
  const clusters = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    if (entry.kind !== "event" || entry.clusterSize <= 1) return;
    const indices = clusters.get(entry.clusterId) ?? [];
    indices.push(index);
    clusters.set(entry.clusterId, indices);
  });
  for (const indices of clusters.values()) {
    const center = indices.reduce((value, index) => ({
      x: value.x + positions[index]!.x / indices.length,
      y: value.y + positions[index]!.y / indices.length
    }), { x: 0, y: 0 });
    indices.forEach((index, ordinal) => {
      const relative = ordinal - (indices.length - 1) / 2;
      result[index] = orientation === "desktop"
        ? { x: center.x + relative * 104, y: center.y + (ordinal % 2 === 0 ? -34 : 34) }
        : { x: center.x + (ordinal % 2 === 0 ? -38 : 38), y: center.y + relative * 92 };
    });
  }
  return result;
}
