import type { JourneyPoint, JourneyScene } from "./portal-journey-presentation";

export type JourneyPosition = { x: number; y: number };
export type JourneyCamera = { x: number; y: number; scale: number };

/** Arc length uses intrinsic pixels, so portrait and landscape retain their own registration. */
export function distributeJourneyNodes(scene: JourneyScene, count: number): JourneyPosition[] {
  if (!Number.isInteger(count) || count < 0 || count > 1000) throw new Error("Invalid journey node count");
  if (!count) return [];
  const points = scene.controlPoints;
  const lengths = points.slice(1).map((point, index) => distance(points[index], point, scene));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return Array.from({ length: count }, () => ({ x: points[0].x, y: points[0].y }));
  return Array.from({ length: count }, (_, index) => {
    const target = (count === 1 ? 0.5 : index / (count - 1)) * total;
    let traversed = 0;
    for (let segment = 0; segment < lengths.length; segment++) {
      const length = lengths[segment];
      if (traversed + length >= target || segment === lengths.length - 1) {
        const fraction = length ? Math.max(0, Math.min(1, (target - traversed) / length)) : 0;
        return { x: points[segment].x + (points[segment + 1].x - points[segment].x) * fraction, y: points[segment].y + (points[segment + 1].y - points[segment].y) * fraction };
      }
      traversed += length;
    }
    return { x: points.at(-1)!.x, y: points.at(-1)!.y };
  });
}
function distance(a: JourneyPoint, b: JourneyPoint, scene: JourneyScene): number {
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
