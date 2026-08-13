"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  LockKeyhole,
  Sparkles,
  Waves
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent
} from "react";

import { ProgressRing } from "@/components/shell/ui";
import { firstNameOnly } from "@/lib/domain/badge-system-contract";
import type { SwimJourneyRing } from "@/lib/domain/swim-progress";
import {
  focusedJourneyWindow,
  journeyNodeFocusPosition,
  orderJourneyNodes,
  selectDefaultJourneyNode
} from "@/lib/theme/portal-journey-contract";
import { cn } from "@/lib/utils";

export type PortalJourneyNode = {
  id: string;
  label: string;
  progressPercent: number;
  assessed: boolean;
  completed: boolean;
  completedAt: string | null;
  curriculumOrder: number;
  lastUpdatedAt: string | null;
  carryover: boolean;
  blocked: boolean;
  blockedReason: string | null;
};

export type PortalJourneyTheme = {
  displayName: string;
  developmentLabel: string;
  key: string;
  mascotUrl: string | null;
  sectorMode: "generic" | "swim" | "swim-abc-gated";
};

export function PortalJourneyEngine({
  childName,
  currentStage,
  destinationStage,
  href,
  location,
  nextLesson,
  nodes,
  participantId,
  program,
  rings,
  theme
}: {
  childName: string;
  currentStage: string;
  destinationStage: string;
  href: string;
  location: string | null;
  nextLesson: string | null;
  nodes: PortalJourneyNode[];
  participantId: string | null;
  program: string;
  rings: SwimJourneyRing[];
  theme: PortalJourneyTheme;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkedId = searchParams.get("onderdeel");
  const orderedNodes = useMemo(() => orderJourneyNodes(nodes), [nodes]);
  const defaultNode = useMemo(() => selectDefaultJourneyNode(orderedNodes), [orderedNodes]);
  const [selectedId, setSelectedId] = useState(
    orderedNodes.some((node) => node.id === deepLinkedId) ? deepLinkedId : defaultNode?.id ?? null
  );
  const [detailOpen, setDetailOpen] = useState(true);
  const selectedNode = orderedNodes.find((node) => node.id === selectedId) ?? defaultNode ?? null;
  const focusedNodes = useMemo(
    () => focusedJourneyWindow(orderedNodes, selectedNode?.id ?? null),
    [orderedNodes, selectedNode?.id]
  );
  const railRef = useRef<HTMLDivElement>(null);
  const wheelDeltaRef = useRef(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const title = theme.sectorMode === "generic"
    ? `De leerreis van ${firstNameOnly(childName)}!`
    : theme.sectorMode === "swim-abc-gated"
      ? `Op weg naar ${program}!`
      : `De zwemreis van ${firstNameOnly(childName)}!`;

  useEffect(() => {
    const nextId = orderedNodes.some((node) => node.id === deepLinkedId)
      ? deepLinkedId
      : defaultNode?.id ?? null;
    setSelectedId(nextId);
    setDetailOpen(Boolean(nextId));
  }, [deepLinkedId, defaultNode, orderedNodes]);

  function selectNode(node: PortalJourneyNode) {
    setSelectedId(node.id);
    setDetailOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.set("onderdeel", node.id);
    if (participantId) params.set("kind", participantId);
    router.replace(`?${params.toString()}`, { scroll: false });
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
    selectNode(next);
    railRef.current
      ?.querySelector<HTMLButtonElement>(`[data-journey-node="${CSS.escape(next.id)}"]`)
      ?.focus();
  }

  function scrollHorizontally(event: WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    wheelDeltaRef.current += event.deltaX;
    if (Math.abs(wheelDeltaRef.current) < 36) return;
    selectRelative(wheelDeltaRef.current > 0 ? 1 : -1);
    wheelDeltaRef.current = 0;
  }

  function selectRelative(delta: -1 | 1) {
    const selectedIndex = orderedNodes.findIndex((node) => node.id === selectedNode?.id);
    const next = orderedNodes[selectedIndex + delta];
    if (!next) return;
    selectNode(next);
    requestAnimationFrame(() => {
      railRef.current
        ?.querySelector<HTMLButtonElement>(`[data-journey-node="${CSS.escape(next.id)}"]`)
        ?.focus();
    });
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    dragStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    selectRelative(deltaX < 0 ? 1 : -1);
  }

  function closeDetail() {
    if (!detailOpen || !selectedNode) return;
    setDetailOpen(false);
    requestAnimationFrame(() => {
      railRef.current
        ?.querySelector<HTMLButtonElement>(`[data-journey-node="${CSS.escape(selectedNode.id)}"]`)
        ?.focus();
    });
  }

  return (
    <section
      aria-label={`${theme.displayName}: ${theme.developmentLabel}`}
      className="portal-journey quest-panel"
      data-journey-node-count={orderedNodes.length}
      data-theme-key={theme.key}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        closeDetail();
      }}
    >
      <div aria-hidden="true" className="portal-journey__scene" />
      <article className="portal-journey__intro">
        <p className="portal-journey__eyebrow">
          <span aria-hidden="true" className="portal-journey__eyebrow-dot" />
          {theme.displayName} · {currentStage} → {destinationStage}
        </p>
        <h1>{title}</h1>
        <div className="portal-journey__goal">
          <span>
            <small>Huidig doel</small>
            <strong>{selectedNode?.label ?? "Nog geen onderdeel geselecteerd"}</strong>
          </span>
          <b>{Math.round(selectedNode?.progressPercent ?? 0)}%</b>
        </div>
        <p className="portal-journey__fact"><span aria-hidden="true">◷</span><strong>{theme.sectorMode === "generic" ? "Volgende activiteit:" : "Volgende les:"}</strong> {nextLesson ?? "Nog niet gepland"}</p>
        <p className="portal-journey__fact"><span aria-hidden="true">⌖</span>{location ?? "Locatie nog niet bekend"}</p>
      </article>

      <div
        aria-label="Onderdelen in deze reis"
        className="portal-journey__rail"
        onPointerCancel={() => { dragStartRef.current = null; }}
        onPointerDown={startDrag}
        onPointerUp={finishDrag}
        onWheel={scrollHorizontally}
        ref={railRef}
      >
        <span aria-hidden="true" className="portal-journey__path" />
        {focusedNodes.length ? focusedNodes.map(({ node, relativeIndex }) => {
          const index = orderedNodes.findIndex((candidate) => candidate.id === node.id);
          const position = journeyNodeFocusPosition(relativeIndex);
          const state = node.blocked
            ? "blocked"
            : node.carryover
              ? "carryover"
              : node.completed
                ? "completed"
                : node.assessed
                  ? "in_progress"
                  : "not_assessed";
          const nodeStyle = {
            "--journey-x": `${position.desktopXPercent}%`,
            "--journey-y": `${position.desktopYPercent}%`,
            "--journey-mobile-x": `${position.mobileXPercent}%`,
            "--journey-mobile-y": `${position.mobileYPercent}%`
          } as CSSProperties;
          return (
          <button
            aria-label={`${node.label}: ${Math.round(node.progressPercent)}%`}
            aria-current={selectedNode?.id === node.id ? "step" : undefined}
            aria-pressed={selectedNode?.id === node.id}
            className={cn(
              "portal-journey__node node",
              node.completed && "is-completed",
              selectedNode?.id === node.id && "is-current"
            )}
            data-journey-node={node.id}
            data-state={state}
            key={node.id}
            onClick={() => selectNode(node)}
            onKeyDown={(event) => moveSelection(event, index)}
            style={nodeStyle}
            type="button"
          >
            <span className="portal-journey__orb">
              {node.blocked ? <LockKeyhole aria-hidden="true" /> : node.completed ? <Check aria-hidden="true" /> : selectedNode?.id === node.id ? <Waves aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            </span>
            <span className="portal-journey__node-label">{node.label}</span>
            <span className="portal-journey__node-state">
              {node.blocked
                ? node.blockedReason ?? "Geblokkeerd"
                : node.carryover
                  ? "Meegenomen"
                  : node.completed
                    ? "Voltooid"
                    : node.assessed
                      ? `${Math.round(node.progressPercent)}%`
                      : "Nog niet beoordeeld"}
            </span>
            {node.assessed ? <span aria-hidden="true" className="portal-journey__node-check"><Check /></span> : null}
          </button>
          );
        }) : (
          <p className="portal-journey__empty">De reis wordt zichtbaar zodra een curriculum is gekoppeld.</p>
        )}
      </div>

      {theme.mascotUrl ? (
        // The mascot is a decorative, separate alpha layer and never part of the journey background.
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" aria-hidden="true" className="portal-journey__mascot" src={theme.mascotUrl} />
      ) : null}

      {selectedNode && detailOpen ? (
        <article aria-live="polite" className="portal-journey__detail" key={selectedNode.id}>
          <span className="portal-journey__detail-orb"><Waves aria-hidden="true" /></span>
          <span>
            <strong>{selectedNode.label}</strong>
            <small>{selectedNode.lastUpdatedAt ? `Bijgewerkt ${formatDate(selectedNode.lastUpdatedAt)}` : "Nog niet beoordeeld"}</small>
            <span className="portal-journey__progress-track">
              <span style={{ width: `${selectedNode.progressPercent}%` }} />
            </span>
            <Link href={`${href}?onderdeel=${encodeURIComponent(selectedNode.id)}${participantId ? `&kind=${encodeURIComponent(participantId)}` : ""}`}>
              Bekijk meer <ArrowRight aria-hidden="true" />
            </Link>
          </span>
          <b>{selectedNode.completed ? "Voltooid" : selectedNode.assessed ? `${Math.round(selectedNode.progressPercent)}% voltooid` : "Nog niet beoordeeld"}</b>
        </article>
      ) : null}

      <div className="portal-journey__controls">
        <button
          aria-label="Vorig onderdeel"
          disabled={orderedNodes.findIndex((node) => node.id === selectedNode?.id) <= 0}
          onClick={() => selectRelative(-1)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <span>Sleep, scroll of gebruik de pijlen om te reizen</span>
        <button
          aria-label="Volgend onderdeel"
          disabled={orderedNodes.findIndex((node) => node.id === selectedNode?.id) >= orderedNodes.length - 1}
          onClick={() => selectRelative(1)}
          type="button"
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </div>

      <div className="portal-journey__rings" data-ring-count={rings.length}>
        {rings.map((ring) => (
          <div className="portal-journey__ring" key={`${ring.kind}:${ring.key}`}>
            <small>{ring.kind === "stage" ? theme.sectorMode === "generic" ? "Voortgang huidig niveau" : "Voortgang huidig badje" : theme.sectorMode === "generic" ? "Richting einddoel" : "Richting diploma"}</small>
            <ProgressRing label={ring.kind === "stage" ? theme.sectorMode === "generic" ? "niveau" : "badje" : theme.sectorMode === "generic" ? "einddoel" : "diploma"} size={82} value={ring.progressPercent} />
            <strong>{ring.label}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium" }).format(new Date(value));
}
