import type { JourneyScene } from "./portal-journey-presentation";

export type JourneyPosition = { x: number; y: number };
export type JourneyCamera = { x: number; y: number; scale: number };

type RouteSegment = { from: JourneyPosition; first: JourneyPosition; second: JourneyPosition; to: JourneyPosition };
function journeyRouteSegments(scene: JourneyScene): RouteSegment[] {
  const portrait = scene.intrinsic.height > scene.intrinsic.width;
  return scene.controlPoints.slice(1).map((to, index) => {
    const from = scene.controlPoints[index], x = (from.x + to.x) / 2, y = (from.y + to.y) / 2;
    // The reference route uses orientation-specific cubic tangents. Controls remain
    // inside each registered anchor rectangle, so smoothing cannot overshoot the art.
    return { from, to, first: portrait ? { x: from.x, y } : { x, y: from.y }, second: portrait ? { x: to.x, y } : { x, y: to.y } };
  });
}

/** The same registered curve drives both visible route and marker arc-length placement. */
export function journeyRoutePath(scene: JourneyScene): string {
  const pixel = (point: JourneyPosition) => `${point.x / 100 * scene.intrinsic.width} ${point.y / 100 * scene.intrinsic.height}`;
  return `M${pixel(scene.controlPoints[0])} ` + journeyRouteSegments(scene).map((segment) => `C${pixel(segment.first)},${pixel(segment.second)},${pixel(segment.to)}`).join(" ");
}

/** Intrinsic-pixel arc length keeps the two supplied orientations independently registered. */
export function distributeJourneyNodes(scene: JourneyScene, count: number): JourneyPosition[] {
  if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error("Invalid journey node count");
  if (!count) return [];
  const points: JourneyPosition[] = [{ x: scene.controlPoints[0].x, y: scene.controlPoints[0].y }];
  for (const segment of journeyRouteSegments(scene)) {
    for (let step = 1; step <= 64; step++) {
      const t = step / 64, u = 1 - t;
      const coordinate = (key: "x" | "y") => u ** 3 * segment.from[key] + 3 * u ** 2 * t * segment.first[key] + 3 * u * t ** 2 * segment.second[key] + t ** 3 * segment.to[key];
      points.push({ x: coordinate("x"), y: coordinate("y") });
    }
  }
  const lengths = points.slice(1).map((point, index) => distance(points[index], point, scene));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
  let segment = 0, traversed = 0;
  return Array.from({ length: count }, (_, index) => {
    const target = (count === 1 ? 0.5 : index / (count - 1)) * total;
    while (segment < lengths.length - 1 && traversed + lengths[segment] < target) traversed += lengths[segment++];
    const fraction = lengths[segment] ? Math.max(0, Math.min(1, (target - traversed) / lengths[segment])) : 0;
    return { x: points[segment].x + (points[segment + 1].x - points[segment].x) * fraction, y: points[segment].y + (points[segment + 1].y - points[segment].y) * fraction };
  });
}
function distance(a: JourneyPosition, b: JourneyPosition, scene: JourneyScene): number {
  return Math.hypot((b.x - a.x) * scene.intrinsic.width / 100, (b.y - a.y) * scene.intrinsic.height / 100);
}
export function clampJourneyCamera(camera: JourneyCamera, scene: JourneyScene, viewport: { width: number; height: number }): JourneyCamera {
  // Keyboard input or a hidden container can precede the first ResizeObserver delivery.
  // Never manufacture scale=0: markers and the guide compensate by dividing by scale.
  if (!(viewport.width > 0 && viewport.height > 0)) return { x: 0, y: 0, scale: Number.isFinite(camera.scale) && camera.scale > 0 ? camera.scale : 1 };
  const cover = Math.max(viewport.width / scene.intrinsic.width, viewport.height / scene.intrinsic.height);
  const scale = Math.max(cover, Math.min(cover * 3, Number.isFinite(camera.scale) ? camera.scale : cover));
  const clamp = (value: number, min: number) => Math.max(min, Math.min(0, Number.isFinite(value) ? value : min / 2));
  return { scale, x: clamp(camera.x, Math.min(0, viewport.width - scene.intrinsic.width * scale)), y: clamp(camera.y, Math.min(0, viewport.height - scene.intrinsic.height * scale)) };
}
export function focusJourneyCamera(point: JourneyPosition, camera: JourneyCamera, scene: JourneyScene, viewport: { width: number; height: number }): JourneyCamera {
  const safeHeight = viewport.height * (1 - scene.safeZones.topFraction - scene.safeZones.bottomFraction);
  return clampJourneyCamera({ ...camera, x: viewport.width / 2 - point.x / 100 * scene.intrinsic.width * camera.scale, y: viewport.height * scene.safeZones.topFraction + safeHeight / 2 - point.y / 100 * scene.intrinsic.height * camera.scale }, scene, viewport);
}

/** When the scene cannot fit every marker, page the scene while retaining the complete HTML list. */
export function journeyPageSize(scene: JourneyScene, scale: number): number {
  for (let count = 12; count >= 2; count--) {
    const points = distributeJourneyNodes(scene, count);
    const fits = points.every((point, index) => points.slice(index + 1).every((other) => Math.hypot((point.x - other.x) * scene.intrinsic.width / 100 * scale, (point.y - other.y) * scene.intrinsic.height / 100 * scale) >= 64));
    if (fits) return count;
  }
  return 1;
}
