import test from "node:test";
import assert from "node:assert/strict";
import { enclosureFor, solidVolume, type Group, type Triangle, type Vec3 } from "../src/models/lab/enclosure.ts";
import { meshEnclosure, unionSolids } from "../src/models/lab/enclosureMesh.ts";
import { parkingSensor } from "../src/models/lab/examples.ts";
import { loadManifold } from "../src/services/manifoldService.ts";

const wasm = await loadManifold();
const enclosure = enclosureFor(parkingSensor());

function readTriangles(buffer: ArrayBuffer): Triangle[] {
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  return Array.from({ length: count }, (_, i) => {
    const at = 84 + i * 50 + 12;
    const f = (k: number) => view.getFloat32(at + k * 4, true);
    return [[f(0), f(1), f(2)], [f(3), f(4), f(5)], [f(6), f(7), f(8)]] as Triangle;
  });
}
// Independent of manifold-3d: every directed edge appears once and has its reverse once (closed, consistently wound)
function edgesPair(tris: Triangle[]) {
  const key = (p: Vec3) => p.map((n) => n.toFixed(4)).join(",");
  const edges = new Map<string, number>();
  for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]] as const) edges.set(`${key(p)}>${key(q)}`, (edges.get(`${key(p)}>${key(q)}`) ?? 0) + 1);
  for (const [e, n] of edges) {
    const [p, q] = e.split(">");
    if (n !== 1 || edges.get(`${q}>${p}`) !== 1) return false;
  }
  return true;
}
const volumeOf = (tris: Triangle[]) =>
  tris.reduce((s, [a, b, c]) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);
const solidsVolume = (g: Group) => enclosure.solids.filter((s) => s.group === g).reduce((s, x) => s + solidVolume(x), 0);

test("the WASM loads in Node", () => {
  assert.ok(wasm, "manifold-3d did not load");
  assert.ok(enclosure.ok);
});

for (const group of ["base", "lid"] as const) {
  test(`parking sensor ${group}: one closed shell, volume matches the solids`, () => {
    assert.ok(wasm);
    const { piece, tris } = unionSolids(enclosure, group, wasm);
    assert.equal(piece.isManifold, true);
    assert.equal(piece.shells, 1, "one connected shell");
    // The wall openings are carved into the boxes: each one that goes through the wall is a handle (genus +1);
    // the standoffs' screw holes are blind. So genus equals the number of through-openings on this piece.
    assert.ok(piece.genus >= 0);
    if (group === "lid") assert.equal(piece.genus, enclosure.cutouts.filter((c) => c.wall === "lid").length);
    assert.ok(Math.abs(piece.volume - solidsVolume(group)) / solidsVolume(group) < 0.1, `${piece.volume} vs ${solidsVolume(group)}`);
    assert.ok(Math.abs(volumeOf(tris) - piece.volume) < 1e-2 * piece.volume);
    assert.ok(volumeOf(tris) > 0, "outward windings");
    assert.equal(edgesPair(tris), true);
    assert.equal(piece.triangles, tris.length);
    assert.ok(piece.bbox.min.every((n) => Math.abs(n) < 1e-4), "lowest corner at the origin");
  });
}

test("the base has genus equal to its through-openings", () => {
  assert.ok(wasm);
  const { piece } = unionSolids(enclosure, "base", wasm);
  const through = enclosure.cutouts.filter((c) => c.wall !== "lid").length;
  console.log(`base genus ${piece.genus} (${through} wall cutouts), lid genus ${unionSolids(enclosure, "lid", wasm).piece.genus}`);
  assert.equal(piece.genus, through);
});

test("the STL is binary, consistent and one file for both pieces", () => {
  assert.ok(wasm);
  const mesh = meshEnclosure(enclosure, wasm);
  assert.equal(mesh.stl.byteLength, 84 + 50 * mesh.triangles);
  assert.equal(new DataView(mesh.stl).getUint32(80, true), mesh.triangles);
  assert.equal(mesh.triangles, mesh.pieces[0].triangles + mesh.pieces[1].triangles);
  assert.equal(mesh.isManifold, true);
  const tris = readTriangles(mesh.stl);
  assert.equal(edgesPair(tris), true);
  const one = meshEnclosure(enclosure, wasm, "base");
  assert.equal(one.pieces.length, 1);
  assert.equal(one.triangles, mesh.pieces[0].triangles);
});
