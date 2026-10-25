"use client";

// The enclosure being printed, layer by layer, drawn where the enclosure is (same placement: millimetres
// scaled by MM). Finished layers are translucent amber PLA; the layer being printed glows and a hot nozzle
// travels its outline.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Layer, LayerFeature, RectFeature } from "@/models/lab/printLayers";
import { MM } from "@/models/lab/layout";

const LAYER_MM = 0.6; // thickness of one printed layer
const LAP_MS = 1200; // the nozzle draws the outline once in this time

// One layer's features as a single geometry (millimetres, y from the layer's height up)
function layerGeometry(layer: Layer): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const f of layer.features) {
    if (f.kind === "rect") {
      const g = new THREE.BoxGeometry(f.x1 - f.x0, LAYER_MM, f.z1 - f.z0);
      g.translate((f.x0 + f.x1) / 2, layer.y + LAYER_MM / 2, (f.z0 + f.z1) / 2);
      parts.push(g.toNonIndexed());
    } else {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, f.r, 0, Math.PI * 2, false);
      if (f.rInner && f.rInner > 0) {
        const hole = new THREE.Path();
        hole.absarc(0, 0, f.rInner, 0, Math.PI * 2, true);
        shape.holes.push(hole);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: LAYER_MM, bevelEnabled: false, curveSegments: 20 });
      g.rotateX(-Math.PI / 2); // the extrusion grows up
      g.translate(f.cx, layer.y, f.cz);
      parts.push(g);
    }
  }
  if (!parts.length) return null;
  for (const g of parts) g.deleteAttribute("uv");
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

// The outline the nozzle follows: the biggest rectangle of the layer
function outlineOf(layer: Layer): RectFeature | null {
  let best: RectFeature | null = null;
  let area = 0;
  for (const f of layer.features as LayerFeature[]) {
    if (f.kind !== "rect") continue;
    const a = (f.x1 - f.x0) * (f.z1 - f.z0);
    if (a > area) {
      area = a;
      best = f;
    }
  }
  return best;
}

// A point at `t` (0..1) around a rectangle's outline
function around(r: RectFeature, t: number): [number, number] {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  let rest = (t % 1) * 2 * (w + d);
  if (rest < w) return [r.x0 + rest, r.z0];
  rest -= w;
  if (rest < d) return [r.x1, r.z0 + rest];
  rest -= d;
  if (rest < w) return [r.x1 - rest, r.z1];
  rest -= w;
  return [r.x0, r.z1 - rest];
}

function Nozzle({ layer }: { layer: Layer }) {
  const ref = useRef<THREE.Group>(null);
  const outline = useMemo(() => outlineOf(layer), [layer]);
  useFrame(() => {
    if (!ref.current || !outline) return;
    const [x, z] = around(outline, performance.now() / LAP_MS);
    ref.current.position.set(x, layer.y + LAYER_MM + 3, z);
  });
  if (!outline) return null;
  return (
    <group ref={ref}>
      <mesh>
        <cylinderGeometry args={[0.5, 1.6, 4, 12]} />
        <meshStandardMaterial color={0xcccccc} roughness={0.3} metalness={0.7} />
      </mesh>
      <pointLight color={0xff8833} intensity={0.6} distance={12} decay={1.5} />
    </group>
  );
}

/** `layers`: the whole print; `count`: how many are printed so far; `printing`: the last one is still being drawn. */
export function PrintPreview({ layers, count, printing }: { layers: Layer[]; count: number; printing: boolean }) {
  const geometries = useMemo(() => layers.map(layerGeometry), [layers]);
  useEffect(() => () => geometries.forEach((g) => g?.dispose()), [geometries]);

  const done = geometries.slice(0, Math.max(0, count - 1));
  const current = count > 0 ? geometries[count - 1] : null;

  return (
    <group name="print-preview" scale={MM}>
      {done.map((g, i) =>
        g ? (
          <mesh key={i} geometry={g}>
            <meshStandardMaterial color={0xd4952a} transparent opacity={0.4} roughness={0.9} />
          </mesh>
        ) : null,
      )}
      {current && (
        <mesh geometry={current}>
          <meshStandardMaterial color={0xd4952a} emissive={0xffaa33} emissiveIntensity={printing ? 1.6 : 0.2} roughness={0.7} />
        </mesh>
      )}
      {printing && count > 0 && <Nozzle layer={layers[count - 1]} />}
    </group>
  );
}
