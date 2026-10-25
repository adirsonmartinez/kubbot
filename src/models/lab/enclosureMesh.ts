// The enclosure as one watertight mesh per piece. enclosure.ts keeps the pieces as touching boxes and rings;
// here each piece (base, lid) is turned into a single Manifold by boolean union, so a slicer gets one closed
// shell instead of a pile of solids. Pure given the manifold-3d module (passed in, loaded by manifoldService).
//
// Genus: the walls' openings are already carved out of the boxes by enclosure.ts, so every cutout that goes
// through a wall is a handle of the solid (genus +1); blind holes (the standoffs' screw holes) are not.
// A piece with no through-opening has genus 0.

import type { Manifold, ManifoldToplevel } from "manifold-3d";
import { solidTriangles, triangleNormal, type Enclosure, type Group, type Triangle, type Vec3 } from "./enclosure.ts";

export type PieceMesh = {
  group: Group;
  triangles: number;
  genus: number; // summed over the connected shells
  shells: number;
  volume: number; // mm3
  isManifold: boolean;
  bbox: { min: Vec3; max: Vec3 };
  size: { w: number; d: number; h: number }; // mm, rounded to 0.1
};
export type EnclosureMesh = { pieces: PieceMesh[]; triangles: number; isManifold: boolean; genus: number; stl: ArrayBuffer };
type Wasm = Pick<ManifoldToplevel, "Manifold" | "Mesh">;

const r1 = (n: number) => Math.round(n * 10) / 10;

// Model frame (y up) -> print frame (z up): same proper rotations as enclosure.ts's printFrame (not exported there)
function printPlace(enclosure: Enclosure, group: Group): (p: Vec3) => Vec3 {
  const { min, max } = enclosure.outer;
  const top = max[1];
  return group === "lid"
    ? (p) => [p[0] - min[0], p[2] - min[2], top - p[1]]
    : (p) => [p[0] - min[0], max[2] - p[2], p[1]];
}

// One solid as its own closed Manifold: vertices shared by position, so the soup becomes an indexed mesh
function solidManifold(wasm: Wasm, tris: Triangle[]): Manifold {
  const index = new Map<string, number>();
  const verts: number[] = [];
  const tri: number[] = [];
  for (const t of tris) {
    for (const p of t) {
      const key = p.join(",");
      let i = index.get(key);
      if (i === undefined) {
        i = verts.length / 3;
        index.set(key, i);
        verts.push(p[0], p[1], p[2]);
      }
      tri.push(i);
    }
  }
  return wasm.Manifold.ofMesh(new wasm.Mesh({ numProp: 3, vertProperties: new Float32Array(verts), triVerts: new Uint32Array(tri) }));
}

// The group's solids united into one Manifold, in the print frame -> the manifold and its triangles
export function unionSolids(enclosure: Enclosure, group: Group, wasm: Wasm): { piece: PieceMesh; tris: Triangle[] } {
  const place = printPlace(enclosure, group);
  const parts = enclosure.solids
    .filter((s) => s.group === group)
    .map((s) => solidManifold(wasm, solidTriangles(s).map((t) => t.map(place) as Triangle)));
  const united = wasm.Manifold.union(parts);
  const shells = united.decompose();
  const mesh = united.getMesh();
  const tris: Triangle[] = [];
  const v = (i: number): Vec3 => [mesh.vertProperties[i * mesh.numProp], mesh.vertProperties[i * mesh.numProp + 1], mesh.vertProperties[i * mesh.numProp + 2]];
  for (let i = 0; i < mesh.triVerts.length; i += 3) tris.push([v(mesh.triVerts[i]), v(mesh.triVerts[i + 1]), v(mesh.triVerts[i + 2])]);
  const box = united.boundingBox();
  const piece: PieceMesh = {
    group,
    triangles: tris.length,
    genus: shells.reduce((sum, s) => sum + s.genus(), 0),
    shells: shells.length,
    volume: united.volume(),
    isManifold: united.status() === "NoError" && tris.length > 0,
    bbox: { min: [...box.min] as Vec3, max: [...box.max] as Vec3 },
    size: { w: r1(box.max[0] - box.min[0]), d: r1(box.max[1] - box.min[1]), h: r1(box.max[2] - box.min[2]) },
  };
  for (const m of [...parts, united, ...shells]) m.delete();
  return { piece, tris };
}

// Binary STL (same layout as enclosure.ts's toStl)
function stlOf(tris: Triangle[]): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + 50 * tris.length);
  const view = new DataView(buffer);
  const header = "Qubbot enclosure (binary STL, mm, closed mesh)";
  for (let i = 0; i < header.length; i++) view.setUint8(i, header.charCodeAt(i));
  view.setUint32(80, tris.length, true);
  let at = 84;
  for (const [a, b, c] of tris) {
    for (const vec of [triangleNormal(a, b, c), a, b, c]) {
      for (const n of vec) {
        view.setFloat32(at, n, true);
        at += 4;
      }
    }
    at += 2; // attribute bytes stay 0
  }
  return buffer;
}

// Both pieces (or one) as closed meshes. No group: base and lid side by side on the bed, like toStl.
export function meshEnclosure(enclosure: Enclosure, wasm: Wasm, group: Group | null = null): EnclosureMesh {
  const groups: Group[] = group ? [group] : ["base", "lid"];
  const results = groups.map((g) => unionSolids(enclosure, g, wasm));
  const gap = enclosure.outer.max[0] - enclosure.outer.min[0] + 10;
  const tris = results.flatMap(({ piece, tris: t }) =>
    piece.group === "lid" && !group ? t.map((tri) => tri.map((p): Vec3 => [p[0] + gap, p[1], p[2]]) as Triangle) : t,
  );
  const pieces = results.map((r) => r.piece);
  return {
    pieces,
    triangles: tris.length,
    isManifold: pieces.every((p) => p.isManifold),
    genus: pieces.reduce((sum, p) => sum + p.genus, 0),
    stl: stlOf(tris),
  };
}
