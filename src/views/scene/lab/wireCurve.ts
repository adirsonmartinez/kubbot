// Pure math for the bench's wires (no three.js): the arc a jumper wire draws between two pins, points
// along it (for the flowing particles) and how a part's local point lands on the bench.
// Wires clear the parts they pass over: give them the footprints and the apex rises until the
// whole arc is above every part under it. Tested in tests/wireCurve.test.ts.

export type Vec3 = { x: number; y: number; z: number };
// A part seen from above: center, size after turning, height (world units: 1 = 10 mm)
export type Box = { id?: string; x: number; z: number; w: number; d: number; h: number };

export const ARC = {
  base: 0.35, // lift of a short wire
  perUnit: 0.22, // extra lift per unit of distance
  max: 2.6, // a long wire does not fly away
  pull: 0.12, // control points sit this far in from each end: the wire leaves the pin going up
  spread: 0.09, // sideways step between parallel wires
  segments: 28,
};

export const CLEARANCE = {
  side: 0.16, // a part counts this much wider on every side
  up: 0.2, // the arc stays this far above a part
  edge: 0.15, // near the pins (bezier weight below this) the wire is still leaving them: not checked
  cap: 7, // no wire rises higher than this above its pins
};

// Sideways step for the index-th wire between the same two parts: 0, +1, -1, +2, -2...
export const spreadStep = (index = 0) => (index <= 0 ? 0 : (index % 2 ? 1 : -1) * Math.ceil(index / 2));

export type CurveOptions = {
  index?: number;
  segments?: number;
  lift?: number | null;
  obstacles?: readonly Box[];
  skip?: readonly string[]; // ids of obstacles to ignore (the parts the wire starts and ends on)
};

// How high the tallest obstacle under (x, z) is, 0 when there is none
function heightAt(x: number, z: number, obstacles: readonly Box[], skip: readonly string[]) {
  let top = 0;
  for (const o of obstacles) {
    if (o.id !== undefined && skip.includes(o.id)) continue;
    if (Math.abs(x - o.x) <= o.w / 2 + CLEARANCE.side && Math.abs(z - o.z) <= o.d / 2 + CLEARANCE.side) top = Math.max(top, o.h);
  }
  return top;
}

// [{ x, y, z }] from a to b (both included, exact): a cubic bezier raised like a slack jumper wire.
// Its height grows with the distance; `index` shifts parallel wires sideways so they do not overlap.
export function wireCurve(a: Vec3, b: Vec3, { index = 0, segments = ARC.segments, lift = null, obstacles = [], skip = [] }: CurveOptions = {}): Vec3[] {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  const h = lift ?? Math.min(ARC.max, ARC.base + ARC.perUnit * dist);
  // horizontal normal (a vertical pair of pins gets an arbitrary but fixed one)
  const nx = dist > 1e-6 ? -dz / dist : 1;
  const nz = dist > 1e-6 ? dx / dist : 0;
  const side = spreadStep(index) * ARC.spread * (1 + dist * 0.08);
  const base = Math.max(a.y, b.y);
  let top = base + h;
  const c1 = { x: a.x + dx * ARC.pull + nx * side, z: a.z + dz * ARC.pull + nz * side };
  const c2 = { x: b.x - dx * ARC.pull + nx * side, z: b.z - dz * ARC.pull + nz * side };
  const n = Math.max(2, Math.round(segments));

  const at = (t: number) => {
    const u = 1 - t;
    const k0 = u * u * u;
    const k1 = 3 * u * u * t;
    const k2 = 3 * u * t * t;
    const k3 = t * t * t;
    return {
      k0, k3, mid: k1 + k2,
      x: k0 * a.x + k1 * c1.x + k2 * c2.x + k3 * b.x,
      z: k0 * a.z + k1 * c1.z + k2 * c2.z + k3 * b.z,
    };
  };

  // The footprint of the arc does not depend on its height, and y(t) = k0 a.y + (k1 + k2) top + k3 b.y,
  // so the top that clears every part under the wire follows directly
  if (obstacles.length) {
    let tallest = 0;
    let need = top;
    const checks = n * 2;
    for (let i = 1; i < checks; i++) {
      const p = at(i / checks);
      if (p.mid < CLEARANCE.edge) continue;
      const under = heightAt(p.x, p.z, obstacles, skip);
      if (under <= 0) continue;
      tallest = Math.max(tallest, under);
      need = Math.max(need, (under + CLEARANCE.up - p.k0 * a.y - p.k3 * b.y) / p.mid);
    }
    top = Math.min(need, Math.max(top, tallest + CLEARANCE.up + 1.2), base + CLEARANCE.cap);
  }

  const points: Vec3[] = [];
  for (let i = 0; i <= n; i++) {
    const p = at(i / n);
    points.push({ x: p.x, y: p.k0 * a.y + p.mid * top + p.k3 * b.y, z: p.z });
  }
  points[0] = { ...a };
  points[n] = { ...b };
  return points;
}

const gap = (p: Vec3, q: Vec3) => Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);

export function wireLength(points: readonly Vec3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += gap(points[i - 1], points[i]);
  return total;
}

// The point at fraction u (0..1) of the wire's length; u wraps around, so moving particles can loop
export function pointAlong(points: readonly Vec3[], u: number, length = wireLength(points)): Vec3 {
  if (points.length < 2 || length <= 0) return { ...points[0] };
  const f = ((u % 1) + 1) % 1;
  let left = f * length;
  if (u >= 1 && f === 0) return { ...points[points.length - 1] };
  for (let i = 1; i < points.length; i++) {
    const step = gap(points[i - 1], points[i]);
    if (left <= step) {
      const k = step > 0 ? left / step : 0;
      const p = points[i - 1];
      const q = points[i];
      return { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, z: p.z + (q.z - p.z) * k };
    }
    left -= step;
  }
  return { ...points[points.length - 1] };
}

// A part's turn on the bench as three.js rotation.y. layout's turn() maps (x, z) -> (-z, x) per quarter;
// three's rotation.y = a maps (x, z) -> (x cos a + z sin a, -x sin a + z cos a), which is that map for
// a = -PI/2. So rot quarter turns = -rot * PI / 2.
export const partAngle = (rot = 0) => (-(rot % 4) * Math.PI) / 2;

// A local point (centered on a part's footprint) turned by `angle` (rotation.y) and moved to the part
export function benchPoint(local: Vec3, at: { x: number; z: number; angle: number }, lift = 0): Vec3 {
  const c = Math.cos(at.angle);
  const s = Math.sin(at.angle);
  return { x: at.x + local.x * c + local.z * s, y: local.y + lift, z: at.z - local.x * s + local.z * c };
}

// The same for a part sitting at one of the four turns
export function localToBench(local: Vec3, part: { x: number; z: number; rot: number }, lift = 0): Vec3 {
  return benchPoint(local, { x: part.x, z: part.z, angle: partAngle(part.rot) }, lift);
}
