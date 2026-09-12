import { projectPoint, valueToHeight, type Point3D } from "./projection3d.js";
import type {
  Heatmap3DBlockStyle,
  Heatmap3DCamera,
  Heatmap3DShape,
  Heatmap3DFace,
  ResolvedCell,
} from "./types.js";

export type Heatmap3DFaceGeometry = {
  points: Point3D[];
  shade: number;
  face: Heatmap3DFace;
  windows?: Point3D[][];
};

export type Heatmap3DObjectGeometry = {
  faces: Heatmap3DFaceGeometry[];
  studs: Heatmap3DFaceGeometry[][];
  footprint: Point3D[];
  roof?: Point3D[];
};

export type Heatmap3DCellGeometry = {
  cell: ResolvedCell;
  x: number;
  y: number;
  height: number;
  depth: number;
  geometry: Heatmap3DObjectGeometry;
};

export const point = (x: number, y: number, z: number): Point3D => ({ x, y, z });

export function cameraDirection(camera: Heatmap3DCamera) {
  const radians = Math.PI / 180;
  return {
    x: Math.sin(camera.yaw * radians),
    y: Math.cos(camera.yaw * radians),
  };
}

export function rectangle(x: number, y: number, width: number, depth: number, z: number): Point3D[] {
  return [
    point(x - width / 2, y - depth / 2, z),
    point(x + width / 2, y - depth / 2, z),
    point(x + width / 2, y + depth / 2, z),
    point(x - width / 2, y + depth / 2, z),
  ];
}

export function circle(x: number, y: number, radius: number, z: number, segments = 24): Point3D[] {
  return Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return point(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z);
  });
}

export function extrude(
  footprint: Point3D[],
  base: number,
  height: number,
  camera: Heatmap3DCamera,
  building = false,
): Heatmap3DFaceGeometry[] {
  const direction = cameraDirection(camera);
  const faces: Heatmap3DFaceGeometry[] = [];
  if (height > base) {
    footprint.forEach((a, index) => {
      const b = footprint[(index + 1) % footprint.length];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length <= 0) return;
      const normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
      if (normal.x * direction.x + normal.y * direction.y <= 0.00001) return;
      const windows: Point3D[][] = [];
      if (building && height > 5) {
        const windowColumns = Math.max(1, Math.min(3, Math.floor(length / 5)));
        const floors = Math.max(1, Math.min(12, Math.floor(height / 7)));
        for (let floor = 0; floor < floors; floor += 1) {
          for (let column = 0; column < windowColumns; column += 1) {
            const left = (column + 0.28) / windowColumns;
            const right = (column + 0.66) / windowColumns;
            const low = base + (height - base) * (floor + 0.26) / floors;
            const high = base + (height - base) * (floor + 0.58) / floors;
            const at = (fraction: number, z: number) => point(
              a.x + (b.x - a.x) * fraction,
              a.y + (b.y - a.y) * fraction,
              z,
            );
            windows.push([at(left, low), at(right, low), at(right, high), at(left, high)]);
          }
        }
      }
      faces.push({
        points: [point(a.x, a.y, base), point(b.x, b.y, base), point(b.x, b.y, height), point(a.x, a.y, height)],
        shade: -0.14 - normal.x * 0.12 - normal.y * 0.12,
        face: normal.x >= 0 ? "right" : "left",
        windows,
      });
    });
  }
  faces.push({ points: footprint.map((p) => ({ ...p, z: height })), shade: 0.14, face: "top" });
  return faces;
}

export function geometryFor(
  x: number,
  y: number,
  size: number,
  height: number,
  shape: Heatmap3DShape,
  blockStyle: Heatmap3DBlockStyle,
  camera: Heatmap3DCamera,
): Heatmap3DObjectGeometry {
  const width = size * (shape === "bar" ? 0.42 : 0.94);
  const depth = size * 0.94;
  const footprint = shape === "circle" ? circle(x, y, size * 0.47, 0) : rectangle(x, y, width, depth, 0);
  const studHeight = blockStyle === "lego" ? Math.min(size * 0.15, height * 0.2) : 0;
  const faces = extrude(footprint, 0, height - studHeight, camera, blockStyle === "building");
  const studs: Heatmap3DFaceGeometry[][] = [];
  if (studHeight > 0) {
    const positions = shape === "circle"
      ? [[x, y]]
      : shape === "bar"
        ? [[x, y - depth * 0.24], [x, y + depth * 0.24]]
        : [[x - width * 0.24, y - depth * 0.24], [x + width * 0.24, y - depth * 0.24], [x - width * 0.24, y + depth * 0.24], [x + width * 0.24, y + depth * 0.24]];
    positions.sort((a, b) => projectPoint(point(a[0], a[1], 0), camera).depth - projectPoint(point(b[0], b[1], 0), camera).depth);
    positions.forEach(([sx, sy]) => studs.push(extrude(
      circle(sx, sy, size * (shape === "circle" ? 0.24 : 0.135), height - studHeight, 12),
      height - studHeight,
      height,
      camera,
    )));
  }
  const roof = blockStyle === "building" && height > 0
    ? shape === "circle" ? circle(x, y, size * 0.34, height) : rectangle(x, y, width * 0.76, depth * 0.76, height)
    : undefined;
  return { faces, studs, footprint, roof };
}

/**
 * The shared scene model. React and the static SVG renderer consume the same
 * sorted geometry, so a screenshot and an interactive chart cannot disagree
 * about heights, visible faces, or painter order.
 */
export function buildHeatmap3DScene({
  cells,
  cellSize,
  gap,
  width,
  depth,
  domain,
  maxHeight,
  shape,
  blockStyle,
  camera,
}: {
  cells: readonly ResolvedCell[];
  cellSize: number;
  gap: number;
  width: number;
  depth: number;
  domain: readonly [number, number];
  maxHeight: number;
  shape: Heatmap3DShape;
  blockStyle: Heatmap3DBlockStyle;
  camera: Heatmap3DCamera;
}): Heatmap3DCellGeometry[] {
  const step = cellSize + gap;
  return cells.map((cell): Heatmap3DCellGeometry => {
    const x = cell.column * step + cellSize / 2 - width / 2;
    const y = cell.row * step + cellSize / 2 - depth / 2;
    const height = cell.known ? valueToHeight(cell.value, domain, maxHeight) : 0;
    return {
      cell,
      x,
      y,
      height,
      depth: projectPoint(point(x, y, 0), camera).depth,
      geometry: geometryFor(x, y, cellSize, height, shape, blockStyle, camera),
    };
  }).sort((a, b) => a.depth - b.depth || a.cell.row - b.cell.row || a.cell.column - b.cell.column);
}
