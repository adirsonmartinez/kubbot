// Where to point the bench camera so a set of boxes sits inside the part of the stage that is really free
// (not under the chat or the side panel). Pure: the bench passes the camera angle and the stage size in
// pixels and gets the ground point to look at and the zoom. World units, y up. The camera is orthographic:
// at zoom 1 `viewHeight` world units fit from top to bottom of the stage.

export type Box3 = { min: [number, number, number]; max: [number, number, number] };
export type Insets = { left: number; right: number; top: number; bottom: number };
export type FrameOptions = {
  azimuth: number;
  elevation: number;
  width: number; // stage size in pixels
  height: number;
  insets: Insets; // pixels covered by panels on each side
  viewHeight?: number;
  margin?: number; // > 1: breathing room around the boxes
  zoomMin?: number;
  zoomMax?: number;
};
export type Frame = { x: number; z: number; zoom: number };

// Where a world point lands on a screen axis pair: sx to the right, sy down, both in world units
export function screenOf(x: number, y: number, z: number, azimuth: number, elevation: number): [number, number] {
  const right = x * Math.cos(azimuth) - z * Math.sin(azimuth);
  const back = x * Math.sin(azimuth) + z * Math.cos(azimuth);
  return [right, back * Math.sin(elevation) - y * Math.cos(elevation)];
}

export function frameBoxes(boxes: readonly Box3[], opts: FrameOptions): Frame | null {
  const { azimuth, elevation, width, height, insets } = opts;
  const { viewHeight = 30, margin = 1.15, zoomMin = 0.4, zoomMax = 4 } = opts;
  if (!boxes.length || width <= 0 || height <= 0) return null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const { min, max } of boxes) {
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const [sx, sy] = screenOf(x, y, z, azimuth, elevation);
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
      y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
  }
  const freeW = Math.max(120, width - insets.left - insets.right);
  const freeH = Math.max(120, height - insets.top - insets.bottom);
  const fitX = (viewHeight * freeW) / (height * Math.max(x1 - x0, 1e-6) * margin);
  const fitY = (viewHeight * freeH) / (height * Math.max(y1 - y0, 1e-6) * margin);
  const zoom = Math.min(zoomMax, Math.max(zoomMin, Math.min(fitX, fitY)));
  // The boxes' center should land on the middle of the free area, which is off the stage's middle
  const unit = viewHeight / (zoom * height);
  const tx = (x0 + x1) / 2 - ((insets.left - insets.right) / 2) * unit;
  const ty = (y0 + y1) / 2 - ((insets.top - insets.bottom) / 2) * unit;
  const back = ty / Math.sin(elevation);
  return {
    x: tx * Math.cos(azimuth) + back * Math.sin(azimuth),
    z: -tx * Math.sin(azimuth) + back * Math.cos(azimuth),
    zoom,
  };
}

// Do the boxes already sit inside the free area (with a little room) for a camera looking at (x, z)?
export function fitsView(boxes: readonly Box3[], at: { x: number; z: number; zoom: number }, opts: FrameOptions, room = 0.04): boolean {
  const { azimuth, elevation, width, height, insets, viewHeight = 30 } = opts;
  const unit = viewHeight / (at.zoom * height);
  const [cx, cy] = screenOf(at.x, 0, at.z, azimuth, elevation);
  const roomX = width * room;
  const roomY = height * room;
  for (const { min, max } of boxes) {
    for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) {
      const [sx, sy] = screenOf(x, y, z, azimuth, elevation);
      const px = width / 2 + (sx - cx) / unit;
      const py = height / 2 + (sy - cy) / unit;
      if (px < insets.left + roomX || px > width - insets.right - roomX || py < insets.top + roomY || py > height - insets.bottom - roomY) return false;
    }
  }
  return true;
}
