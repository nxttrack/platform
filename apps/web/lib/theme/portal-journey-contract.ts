export type JourneyContractNode = {
  id: string;
  label?: string;
  progressPercent: number;
  completed: boolean;
  completedAt?: string | null;
  curriculumOrder?: number;
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
  return orderJourneyNodes(nodes)
    .filter((node) => !node.completed)
    .sort(compareIncompleteJourneyNodes)[0]
    ?? orderJourneyNodes(nodes).at(-1)
    ?? null;
}

export function orderJourneyNodes<T extends JourneyContractNode>(nodes: readonly T[]) {
  const completed = nodes
    .filter((node) => node.completed)
    .sort((left, right) => {
      const completedDifference = timestamp(left.completedAt) - timestamp(right.completedAt);
      return completedDifference || compareCurriculumNodes(left, right);
    });
  const incomplete = nodes
    .filter((node) => !node.completed)
    .sort(compareIncompleteJourneyNodes);
  return [...completed, ...incomplete];
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
    || (left.label ?? left.id).localeCompare(right.label ?? right.id, "nl");
}

function timestamp(value: string | null | undefined) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}
