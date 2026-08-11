"use client";

import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from "react";

import {
  focusedJourneyWindow,
  orderJourneyNodes,
  selectDefaultJourneyNode
} from "@/lib/theme/portal-journey-contract";

export type ChildJourneyNodeDto = {
  id: string;
  label: string;
  progressPercent: number;
  completed: boolean;
  assessed: boolean;
  completedAt: string | null;
  curriculumOrder: number;
  lastUpdatedAt: string | null;
};

export function ChildJourneyMap({
  nodes,
  desktopArtwork,
  mobileArtwork,
  mascotUrl
}: {
  nodes: ChildJourneyNodeDto[];
  desktopArtwork: string | null;
  mobileArtwork: string | null;
  mascotUrl: string | null;
}) {
  const orderedNodes = useMemo(() => orderJourneyNodes(nodes), [nodes]);
  const defaultNode = useMemo(() => selectDefaultJourneyNode(orderedNodes), [orderedNodes]);
  const [selectedId, setSelectedId] = useState(defaultNode?.id ?? null);
  const selected = orderedNodes.find((node) => node.id === selectedId) ?? defaultNode ?? null;
  const selectedIndex = Math.max(0, orderedNodes.findIndex((node) => node.id === selected?.id));
  const visible = useMemo(
    () => focusedJourneyWindow(orderedNodes, selected?.id ?? null).map(({ node }) => node),
    [orderedNodes, selected?.id]
  );
  const railRef = useRef<HTMLOListElement>(null);
  const wheelDeltaRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  function selectRelative(delta: -1 | 1) {
    const next = orderedNodes[selectedIndex + delta];
    if (!next) return;
    setSelectedId(next.id);
    requestAnimationFrame(() => {
      railRef.current
        ?.querySelector<HTMLButtonElement>(`[data-child-journey-node="${CSS.escape(next.id)}"]`)
        ?.focus();
    });
  }

  function moveSelection(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? orderedNodes.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? Math.max(0, index - 1)
          : event.key === "ArrowRight" || event.key === "ArrowDown"
            ? Math.min(orderedNodes.length - 1, index + 1)
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = orderedNodes[nextIndex];
    if (!next) return;
    setSelectedId(next.id);
    requestAnimationFrame(() => {
      railRef.current
        ?.querySelector<HTMLButtonElement>(`[data-child-journey-node="${CSS.escape(next.id)}"]`)
        ?.focus();
    });
  }

  function scrollHorizontally(event: WheelEvent<HTMLOListElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    wheelDeltaRef.current += event.deltaX;
    if (Math.abs(wheelDeltaRef.current) < 36) return;
    selectRelative(wheelDeltaRef.current > 0 ? 1 : -1);
    wheelDeltaRef.current = 0;
  }

  function startDrag(event: PointerEvent<HTMLOListElement>) {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function finishDrag(event: PointerEvent<HTMLOListElement>) {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    selectRelative(deltaX < 0 ? 1 : -1);
  }

  return (
    <section
      aria-label="Mijn reis"
      className="child-journey-map"
      style={{
        "--child-journey-desktop": desktopArtwork ? `url("${desktopArtwork}")` : "none",
        "--child-journey-mobile": mobileArtwork ? `url("${mobileArtwork}")` : "none"
      } as React.CSSProperties}
    >
      <div aria-hidden="true" className="child-journey-map__world" />
      <ol
        aria-label="Onderdelen van mijn reis"
        className="child-journey-map__nodes"
        onPointerCancel={() => { dragStartRef.current = null; }}
        onPointerDown={startDrag}
        onPointerUp={finishDrag}
        onWheel={scrollHorizontally}
        ref={railRef}
      >
        {visible.map((node) => {
          const index = orderedNodes.findIndex((candidate) => candidate.id === node.id);
          return <li key={node.id}>
            <button
              aria-current={selected?.id === node.id ? "step" : undefined}
              aria-label={`${node.label}, ${node.assessed ? `${Math.round(node.progressPercent)} procent` : "nog niet beoordeeld"}`}
              className={node.completed ? "is-completed" : selected?.id === node.id ? "is-current" : undefined}
              data-child-journey-node={node.id}
              onClick={() => setSelectedId(node.id)}
              onKeyDown={(event) => moveSelection(event, index)}
              type="button"
            >
              <span>{node.completed ? <Check aria-hidden="true" /> : <Sparkles aria-hidden="true" />}</span>
              <strong>{node.label}</strong>
            </button>
          </li>;
        })}
      </ol>
      {mascotUrl ? <img alt="" aria-hidden="true" className="child-journey-map__mascot" src={mascotUrl} /> : null}
      <div className="child-journey-map__detail" aria-live="polite">
        <span><small>Mijn volgende stap</small><strong>{selected?.label ?? "Je reis begint binnenkort"}</strong>{selected ? <Link href={`/kind/reis?onderdeel=${encodeURIComponent(selected.id)}`}>Bekijk dit doel</Link> : null}</span>
        <b>{selected?.assessed ? `${Math.round(selected.progressPercent)}%` : "Nieuw"}</b>
      </div>
      <div className="child-journey-map__controls">
        <button aria-label="Vorige stap" disabled={selectedIndex <= 0} onClick={() => selectRelative(-1)} type="button"><ChevronLeft /></button>
        <span>{selectedIndex + 1} van {Math.max(orderedNodes.length, 1)}</span>
        <button aria-label="Volgende stap" disabled={selectedIndex >= orderedNodes.length - 1} onClick={() => selectRelative(1)} type="button"><ChevronRight /></button>
      </div>
    </section>
  );
}
