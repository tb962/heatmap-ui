import type { Heatmap3DCamera, ResolvedCell } from "./types.js";

export type Point3D = { x: number; y: number; z: number };
export type ProjectedPoint = { x: number; y: number; depth: number };
export const DEFAULT_CAMERA: Heatmap3DCamera = { yaw: -35, pitch: 38, zoom: 1 };
const radians = Math.PI / 180;
const finite = (value: number | undefined, fallback: number) => Number.isFinite(value) ? value! : fallback;
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeCamera(camera: Partial<Heatmap3DCamera>): Heatmap3DCamera {
  const yaw = finite(camera.yaw, DEFAULT_CAMERA.yaw);
  return {
    yaw: ((yaw + 180) % 360 + 360) % 360 - 180,
    pitch: clamp(finite(camera.pitch, DEFAULT_CAMERA.pitch), 15, 75),
    zoom: clamp(finite(camera.zoom, DEFAULT_CAMERA.zoom), 0.55, 2),
  };
}

export function resolveHeightDomain(
  cells: readonly Pick<ResolvedCell, "known" | "value">[],
  explicit?: readonly [number, number],
): [number, number] {
  if (explicit && explicit.every(Number.isFinite) && explicit[1] > explicit[0]) {
    return [explicit[0], explicit[1]];
  }
  const maximum = cells.reduce((max, cell) => cell.known && Number.isFinite(cell.value) ? Math.max(max, cell.value) : max, 0);
  return [0, maximum || 1];
}

export function valueToHeight(value: number, domain: readonly [number, number], maxHeight: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const span = domain[1] - domain[0];
  if (!Number.isFinite(span) || span <= 0) return 0;
  return clamp((value - domain[0]) / span, 0, 1) * Math.max(0, finite(maxHeight, 100));
}

/** Orthographic projection; increasing depth is nearer the camera. Zoom is
 * applied to the scene, not geometry, so orbit and depth sorting stay stable. */
export function projectPoint(point: Point3D, camera: Heatmap3DCamera): ProjectedPoint {
  const yaw = camera.yaw * radians;
  const pitch = camera.pitch * radians;
  const groundDepth = point.x * Math.sin(yaw) + point.y * Math.cos(yaw);
  return {
    x: point.x * Math.cos(yaw) - point.y * Math.sin(yaw),
    y: groundDepth * Math.sin(pitch) - point.z * Math.cos(pitch),
    depth: groundDepth * Math.cos(pitch) + point.z * Math.sin(pitch),
  };
}

/** A camera-independent fit prevents the grid from breathing while orbiting.
 * Bounds contain the entire data volume at every supported camera angle. */
export function projectionBounds(width: number, depth: number, maxHeight: number) {
  const radius = Math.hypot(Math.max(0, finite(width, 0)), Math.max(0, finite(depth, 0))) / 2;
  const height = Math.max(0, finite(maxHeight, 100));
  const pad = Math.max(20, Math.min(radius * 0.10, 48));
  const extent = Math.max(1, radius * Math.sin(75 * radians));
  return { x: -radius - pad, y: -extent - height - pad, width: Math.max(1, radius * 2) + pad * 2, height: extent * 2 + height + pad * 2 };
}

export function polygonPath(points: readonly Point3D[], camera: Heatmap3DCamera): string {
  return points.map((point, index) => {
    const p = projectPoint(point, camera);
    return `${index ? "L" : "M"}${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  }).join(" ") + " Z";
}
