export type JourneyContractNode = {
  id: string;
  label?: string;
  progressPercent: number;
  completed: boolean;
  completedAt?: string | null;
  completionSequence?: number | null;
  completionOrderStatus?: "event_sequence" | "legacy_inferred" | null;
  curriculumOrder?: number;
};

export type JourneyTimelineEvent = {
  id: string;
  label: string;
  earnedAt: string;
  eventType: "badge" | "surprise_badge";
  anchorNodeId?: string | null;
  description?: string | null;
};

export type JourneyTimelineEntry<T extends JourneyContractNode = JourneyContractNode> =
  | { id: string; kind: "main"; node: T }
  | { id: string; kind: "event_cluster"; anchorKey: string; events: JourneyTimelineEvent[] };

export type JourneyTimeline<T extends JourneyContractNode = JourneyContractNode> = {
  currentGoalId: string | null;
  entries: JourneyTimelineEntry<T>[];
  orderedNodes: T[];
};

export type JourneyRect = { height: number; width: number; x: number; y: number };

export type JourneyMascotPlacement = {
  height: number;
  mode: "candidate" | "dock" | "hidden";
  width: number;
  x: number;
  y: number;
};

export function resolveJourneyDestination(input: {
  stages: ReadonlyArray<{ id: string; name: string }>;
  currentStageId: string | null | undefined;
  programName: string | null | undefined;
  fallback?: string;
}) {
  const currentStageIndex = input.stages.findIndex((stage) => stage.id === input.currentStageId);
  const nextStage = currentStageIndex >= 0 ? input.stages[currentStageIndex + 1] : input.stages[0];
  if (nextStage) return nextStage.name;

  const programName = input.programName?.trim();
  if (programName) return programName;

  return input.stages[currentStageIndex]?.name ?? input.fallback ?? "jouw volgende doel";
}

export function selectDefaultJourneyNode<T extends JourneyContractNode>(nodes: readonly T[]) {
  return nodes
    .filter((node) => !node.completed)
    .sort(compareIncompleteJourneyNodes)[0]
    ?? null;
}

export function orderJourneyNodes<T extends JourneyContractNode>(nodes: readonly T[]) {
  const currentGoal = selectCurrentGoal(nodes);
  const historicallyPositioned = nodes
    .filter((node) => node.completed || validSequence(node.completionSequence))
    .sort((left, right) => {
      const sequenceDifference = sequence(left.completionSequence) - sequence(right.completionSequence);
      if (sequenceDifference) return sequenceDifference;
      const completedDifference = timestamp(left.completedAt) - timestamp(right.completedAt);
      return completedDifference || stableNodeTieBreaker(left, right);
    });
  const incomplete = nodes
    .filter((node) => !historicallyPositioned.includes(node) && node.id !== currentGoal?.id)
    .sort(compareCurriculumNodes);
  return [
    ...historicallyPositioned,
    ...(currentGoal && !historicallyPositioned.includes(currentGoal) ? [currentGoal] : []),
    ...incomplete
  ];
}

export function buildJourneyTimeline<T extends JourneyContractNode>(input: {
  nodes: readonly T[];
  events?: readonly JourneyTimelineEvent[];
}): JourneyTimeline<T> {
  const orderedNodes = orderJourneyNodes(input.nodes);
  const currentGoalId = selectCurrentGoal(input.nodes)?.id ?? null;
  const nodeIndexById = new Map(orderedNodes.map((node, index) => [node.id, index]));
  const uniqueEvents = new Map<string, JourneyTimelineEvent>();
  for (const event of input.events ?? []) {
    if (!uniqueEvents.has(event.id)) uniqueEvents.set(event.id, event);
  }
  const clusters = new Map<string, JourneyTimelineEvent[]>();
  for (const event of uniqueEvents.values()) {
    const anchorIndex = event.anchorNodeId && nodeIndexById.has(event.anchorNodeId)
      ? nodeIndexById.get(event.anchorNodeId)!
      : inferEventAnchorIndex(event, orderedNodes);
    const anchorKey = anchorIndex < 0 ? "before:first" : `after:${anchorIndex}`;
    const cluster = clusters.get(anchorKey) ?? [];
    cluster.push(event);
    clusters.set(anchorKey, cluster);
  }
  for (const events of clusters.values()) {
    events.sort((left, right) => timestamp(left.earnedAt) - timestamp(right.earnedAt) || left.id.localeCompare(right.id));
  }
  const entries: JourneyTimelineEntry<T>[] = [];
  const beforeFirst = clusters.get("before:first");
  if (beforeFirst?.length) entries.push(eventCluster("before:first", beforeFirst));
  orderedNodes.forEach((node, index) => {
    entries.push({ id: `main:${node.id}`, kind: "main", node });
    const events = clusters.get(`after:${index}`);
    if (events?.length) entries.push(eventCluster(`after:${index}`, events));
  });
  return { currentGoalId, entries, orderedNodes };
}

export function journeyNodePosition(index: number, count: number) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || index < 0 || index >= count) {
    throw new Error("Invalid journey node position");
  }
  const ratio = count > 1 ? index / (count - 1) : 0.5;
  return {
    desktopXPercent: 6 + ratio * 86,
    desktopYPercent: 78 - ratio * 52 + Math.sin(index * 1.35) * 5,
    mobileXPercent: 50 + Math.sin(index * 1.55) * 12,
    mobileYPercent: 78 - ratio * 56
  };
}

export function journeyNodeFocusPosition(relativeIndex: number) {
  if (!Number.isInteger(relativeIndex) || relativeIndex < -2 || relativeIndex > 2) {
    throw new Error("Invalid focused journey node position");
  }
  const desktop = {
    [-2]: { x: 16, y: 75 },
    [-1]: { x: 36, y: 66 },
    [0]: { x: 56, y: 57 },
    [1]: { x: 76, y: 42 },
    [2]: { x: 94, y: 29 }
  } as const;
  const mobile = {
    [-2]: { x: 44, y: 83 },
    [-1]: { x: 58, y: 68 },
    [0]: { x: 53, y: 53 },
    [1]: { x: 42, y: 38 },
    [2]: { x: 56, y: 23 }
  } as const;
  const desktopPosition = desktop[relativeIndex as keyof typeof desktop];
  const mobilePosition = mobile[relativeIndex as keyof typeof mobile];
  return {
    desktopXPercent: desktopPosition.x,
    desktopYPercent: desktopPosition.y,
    mobileXPercent: mobilePosition.x,
    mobileYPercent: mobilePosition.y
  };
}

export function focusedJourneyWindow<T extends JourneyContractNode>(
  nodes: readonly T[],
  selectedId: string | null
) {
  const ordered = orderJourneyNodes(nodes);
  const selectedIndex = Math.max(
    0,
    ordered.findIndex((node) => node.id === selectedId)
  );
  return ordered
    .map((node, index) => ({ node, relativeIndex: index - selectedIndex }))
    .filter(({ relativeIndex }) => relativeIndex >= -2 && relativeIndex <= 2);
}

function compareIncompleteJourneyNodes<T extends JourneyContractNode>(left: T, right: T) {
  return right.progressPercent - left.progressPercent || compareCurriculumNodes(left, right);
}

function compareCurriculumNodes<T extends JourneyContractNode>(left: T, right: T) {
  return (left.curriculumOrder ?? Number.MAX_SAFE_INTEGER)
    - (right.curriculumOrder ?? Number.MAX_SAFE_INTEGER)
    || (left.label ?? "").localeCompare(right.label ?? "", "nl")
    || left.id.localeCompare(right.id);
}

export function journeyRouteGeometry(input: {
  entryCount: number;
  orientation: "desktop" | "mobile";
  selectedIndex: number;
  viewportHeight: number;
  viewportWidth: number;
}) {
  const count = Math.max(0, Math.floor(input.entryCount));
  const selectedIndex = count ? clamp(Math.floor(input.selectedIndex), 0, count - 1) : 0;
  if (input.orientation === "desktop") {
    const gap = input.viewportWidth < 700 ? 150 : 184;
    const padding = Math.max(input.viewportWidth * 0.5, 180);
    const worldWidth = count ? padding * 2 + Math.max(0, count - 1) * gap : input.viewportWidth;
    const positions = Array.from({ length: count }, (_, index) => ({
      x: padding + index * gap,
      y: input.viewportHeight * (0.58 + Math.sin(index * 1.35) * 0.075)
    }));
    return {
      cameraX: count ? input.viewportWidth * 0.54 - positions[selectedIndex]!.x : 0,
      cameraY: 0,
      positions,
      worldHeight: input.viewportHeight,
      worldWidth
    };
  }
  const gap = input.viewportHeight < 520 ? 112 : 138;
  const padding = Math.max(input.viewportHeight * 0.53, 170);
  const worldHeight = count ? padding * 2 + Math.max(0, count - 1) * gap : input.viewportHeight;
  const positions = Array.from({ length: count }, (_, index) => ({
    x: input.viewportWidth * (0.5 + Math.sin(index * 1.55) * 0.12),
    y: worldHeight - padding - index * gap
  }));
  return {
    cameraX: 0,
    cameraY: count ? input.viewportHeight * 0.53 - positions[selectedIndex]!.y : 0,
    positions,
    worldHeight,
    worldWidth: input.viewportWidth
  };
}

export function classifyJourneyGesture(input: {
  deltaX: number;
  deltaY: number;
  threshold?: number;
  hysteresis?: number;
}): "horizontal" | "undecided" | "vertical" {
  const threshold = input.threshold ?? 12;
  const hysteresis = input.hysteresis ?? 1.25;
  const x = Math.abs(input.deltaX);
  const y = Math.abs(input.deltaY);
  if (Math.max(x, y) < threshold) return "undecided";
  if (x > y * hysteresis) return "horizontal";
  if (y > x * hysteresis) return "vertical";
  return "undecided";
}

export function selectMascotPlacement(input: {
  anchor: JourneyRect;
  bounds: JourneyRect;
  exclusions: readonly JourneyRect[];
  preferredHeight: number;
  preferredWidth: number;
  clearance?: number;
}): JourneyMascotPlacement {
  const clearance = Math.max(12, input.clearance ?? 16);
  const scales = [1, 0.86, 0.72];
  const anchorCenterX = input.anchor.x + input.anchor.width / 2;
  const anchorCenterY = input.anchor.y + input.anchor.height / 2;
  for (const scale of scales) {
    const width = input.preferredWidth * scale;
    const height = input.preferredHeight * scale;
    const candidates = [
      { x: input.anchor.x + input.anchor.width + clearance, y: anchorCenterY - height / 2 },
      { x: input.anchor.x - width - clearance, y: anchorCenterY - height / 2 },
      { x: anchorCenterX + clearance, y: input.anchor.y - height - clearance },
      { x: anchorCenterX - width - clearance, y: input.anchor.y + input.anchor.height + clearance }
    ];
    for (const candidate of candidates) {
      const rect = { ...candidate, width, height };
      if (containsRect(input.bounds, rect, clearance) && input.exclusions.every((exclusion) => !rectsOverlap(rect, inflateRect(exclusion, clearance)))) {
        return { ...candidate, width, height, mode: "candidate" };
      }
    }
  }
  const dockWidth = input.preferredWidth * 0.64;
  const dockHeight = input.preferredHeight * 0.64;
  const dockCandidates = [
    { x: input.bounds.x + clearance, y: input.bounds.y + input.bounds.height - dockHeight - clearance },
    { x: input.bounds.x + input.bounds.width - dockWidth - clearance, y: input.bounds.y + clearance }
  ];
  for (const candidate of dockCandidates) {
    const rect = { ...candidate, width: dockWidth, height: dockHeight };
    if (input.exclusions.every((exclusion) => !rectsOverlap(rect, inflateRect(exclusion, clearance)))) {
      return { ...candidate, width: dockWidth, height: dockHeight, mode: "dock" };
    }
  }
  const compactWidth = Math.max(48, input.preferredWidth * 0.52);
  const compactHeight = input.preferredHeight * (compactWidth / input.preferredWidth);
  const maxX = input.bounds.x + input.bounds.width - compactWidth - clearance;
  const maxY = input.bounds.y + input.bounds.height - compactHeight - clearance;
  const grid: Array<{ x: number; y: number }> = [];
  for (let y = input.bounds.y + clearance; y <= maxY; y += Math.max(12, compactHeight * 0.45)) {
    for (let x = input.bounds.x + clearance; x <= maxX; x += Math.max(12, compactWidth * 0.45)) grid.push({ x, y });
  }
  grid.push({ x: maxX, y: maxY });
  grid.sort((left, right) => Math.hypot(left.x - anchorCenterX, left.y - anchorCenterY) - Math.hypot(right.x - anchorCenterX, right.y - anchorCenterY));
  for (const candidate of grid) {
    const rect = { ...candidate, width: compactWidth, height: compactHeight };
    if (containsRect(input.bounds, rect, clearance) && input.exclusions.every((exclusion) => !rectsOverlap(rect, inflateRect(exclusion, clearance)))) {
      return { ...candidate, width: compactWidth, height: compactHeight, mode: "dock" };
    }
  }
  return { x: 0, y: 0, width: 0, height: 0, mode: "hidden" };
}

export function mascotMotionPlan(input: {
  from: JourneyRect;
  to: JourneyRect;
  exclusions: readonly JourneyRect[];
  clearance?: number;
}): { mode: "direct" | "waypoint" | "crossfade"; points: Array<{ x: number; y: number }> } {
  const clearance = Math.max(12, input.clearance ?? 16);
  const isClear = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(2, Math.ceil(distance / 12));
    return Array.from({ length: steps + 1 }, (_, index) => index / steps).every((ratio) => {
      const rect = {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
        width: input.to.width,
        height: input.to.height
      };
      return input.exclusions.every((exclusion) => !rectsOverlap(rect, inflateRect(exclusion, clearance)));
    });
  };
  if (isClear(input.from, input.to)) return { mode: "direct", points: [{ x: input.from.x, y: input.from.y }, { x: input.to.x, y: input.to.y }] };
  const waypoints = [
    { x: input.from.x, y: input.to.y },
    { x: input.to.x, y: input.from.y }
  ];
  for (const waypoint of waypoints) {
    if (isClear(input.from, waypoint) && isClear(waypoint, input.to)) {
      return { mode: "waypoint", points: [{ x: input.from.x, y: input.from.y }, waypoint, { x: input.to.x, y: input.to.y }] };
    }
  }
  return { mode: "crossfade", points: [{ x: input.from.x, y: input.from.y }, { x: input.to.x, y: input.to.y }] };
}

function selectCurrentGoal<T extends JourneyContractNode>(nodes: readonly T[]) {
  return nodes.filter((node) => !node.completed).sort(compareIncompleteJourneyNodes)[0] ?? null;
}

function eventCluster(anchorKey: string, events: JourneyTimelineEvent[]): JourneyTimelineEntry<never> {
  return { id: `cluster:${anchorKey}:${events.map((event) => event.id).join(":")}`, kind: "event_cluster", anchorKey, events };
}

function inferEventAnchorIndex<T extends JourneyContractNode>(event: JourneyTimelineEvent, nodes: readonly T[]) {
  let anchor = -1;
  nodes.forEach((node, index) => {
    if (node.completedAt && timestamp(node.completedAt) <= timestamp(event.earnedAt)) anchor = index;
  });
  return anchor;
}

function stableNodeTieBreaker<T extends JourneyContractNode>(left: T, right: T) {
  return left.id.localeCompare(right.id);
}

function validSequence(value: number | null | undefined): value is number {
  return Number.isInteger(value) && (value ?? 0) > 0;
}

function sequence(value: number | null | undefined) {
  return validSequence(value) ? value : Number.MAX_SAFE_INTEGER;
}

function containsRect(bounds: JourneyRect, rect: JourneyRect, clearance: number) {
  return rect.x >= bounds.x + clearance
    && rect.y >= bounds.y + clearance
    && rect.x + rect.width <= bounds.x + bounds.width - clearance
    && rect.y + rect.height <= bounds.y + bounds.height - clearance;
}

function inflateRect(rect: JourneyRect, amount: number): JourneyRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function rectsOverlap(left: JourneyRect, right: JourneyRect) {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function timestamp(value: string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
