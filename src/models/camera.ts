// Isometric camera state (no three.js here): where it looks, how it is rotated and zoomed.
// Commands set goals; step(dt) eases the current values toward them every frame.

import { clamp } from "@/lib/math";

export const CAMERA = {
  azimuth: Math.PI / 4,
  elevation: (44 * Math.PI) / 180,
  distance: 60,
  viewHeight: 30, // world units visible from top to bottom at zoom 1
  zoomMin: 0.4,
  zoomMax: 4,
  elevationMin: (22 * Math.PI) / 180, // almost from the street
  elevationMax: (82 * Math.PI) / 180, // almost a floor plan
};

const EASE_SPEED = 10;
const QUARTER_TURN = Math.PI / 2;

export type GroundPoint = { x: number; z: number };

export class CameraRig {
  azimuth = CAMERA.azimuth;
  azimuthGoal = CAMERA.azimuth;
  elevation = CAMERA.elevation;
  zoom = 1;
  zoomGoal = 1;
  target: GroundPoint = { x: 0, z: 0 };
  targetGoal: GroundPoint | null = null; // only set while flying somewhere

  // Camera position relative to its target
  offset(azimuth = this.azimuth) {
    const { elevation } = this;
    const { distance } = CAMERA;
    return {
      x: Math.cos(elevation) * Math.sin(azimuth) * distance,
      y: Math.sin(elevation) * distance,
      z: Math.cos(elevation) * Math.cos(azimuth) * distance,
    };
  }

  rotateQuarter(direction: 1 | -1) {
    this.azimuthGoal += direction * QUARTER_TURN;
  }

  // Free rotation while dragging: applied immediately
  rotateBy(radians: number) {
    this.azimuthGoal += radians;
    this.azimuth = this.azimuthGoal;
  }

  // Dragging up/down tilts the view (applied immediately)
  tiltBy(radians: number) {
    this.elevation = clamp(
      this.elevation + radians,
      CAMERA.elevationMin,
      CAMERA.elevationMax,
    );
  }

  zoomBy(factor: number) {
    this.zoomGoal = clamp(this.zoomGoal * factor, CAMERA.zoomMin, CAMERA.zoomMax);
  }

  // Wheel zoom: applied immediately (the view keeps the point under the cursor fixed)
  setZoomNow(zoom: number) {
    this.zoom = this.zoomGoal = clamp(zoom, CAMERA.zoomMin, CAMERA.zoomMax);
    this.targetGoal = null;
  }

  panBy(dx: number, dz: number) {
    this.target = { x: this.target.x + dx, z: this.target.z + dz };
    this.targetGoal = null;
  }

  // Pan relative to the screen: right = +1 moves right, back = +1 moves toward the camera
  panScreen(right: number, back: number, step: number) {
    const az = this.azimuth;
    const s = step / this.zoom;
    this.panBy(
      (Math.cos(az) * right + Math.sin(az) * back) * s,
      (-Math.sin(az) * right + Math.cos(az) * back) * s,
    );
  }

  cancelFlight() {
    this.targetGoal = null;
  }

  flyTo(point: GroundPoint, zoom = this.zoomGoal) {
    this.targetGoal = { x: point.x, z: point.z };
    this.zoomGoal = clamp(zoom, CAMERA.zoomMin, CAMERA.zoomMax);
  }

  // Back to the initial angle (shortest way), zoom and center
  reset() {
    const turn = Math.PI * 2;
    this.azimuthGoal =
      CAMERA.azimuth + Math.round((this.azimuth - CAMERA.azimuth) / turn) * turn;
    this.elevation = CAMERA.elevation;
    this.flyTo({ x: 0, z: 0 }, 1);
  }

  step(dt: number) {
    const k = 1 - Math.exp(-EASE_SPEED * dt);
    if (Math.abs(this.azimuthGoal - this.azimuth) > 0.0005) {
      this.azimuth += (this.azimuthGoal - this.azimuth) * k;
    }
    if (Math.abs(this.zoomGoal - this.zoom) > 0.0005) {
      this.zoom += (this.zoomGoal - this.zoom) * k;
    }
    if (this.targetGoal) {
      const t = this.target;
      const g = this.targetGoal;
      this.target = { x: t.x + (g.x - t.x) * k, z: t.z + (g.z - t.z) * k };
      if (Math.hypot(g.x - this.target.x, g.z - this.target.z) < 0.001) {
        this.targetGoal = null;
      }
    }
  }
}
