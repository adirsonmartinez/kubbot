"use client";

// The wiring help on the bench, drawn over the parts:
// - while a wire is being made, every pin that could receive it wears a mark by how well it fits: the best
//   one a pulsing green ring (with a dashed ghost wire to it), the ones that work a soft white ring, the
//   ones that would be a mistake a dim red cross;
// - with a part selected, the wires "Conéctalo por mí" would add show as faint ghost wires;
// - in the step-by-step guide, the two pins of the current step glow with a label each and a marching wire.
// It only draws: what fits and what is suggested comes from the view model. Nothing here takes clicks.

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { wireKind, type WireKind } from "@/models/lab/layout";
import type { Fit, LabViewModel, PinRef, PlacedPart } from "@/viewmodels/useLabViewModel";
import { pinsCopy } from "@/views/copy/pins";
import { PALETTE } from "../palette";
import { pinPosition, useBench } from "./benchContext";
import { pointAlong, wireCurve, wireLength, type Vec3 } from "./wireCurve";
import { CONNECTOR } from "./wireVisual";
import { WorldLabel } from "./WorldLabel";

const NO_RAYCAST = () => {};
const MAX_DASHES = 120;

// --- Pin marks ---
type MarkKit = {
  ringBest: THREE.BufferGeometry;
  discBest: THREE.BufferGeometry;
  ringOk: THREE.BufferGeometry;
  bar: THREE.BufferGeometry;
  best: THREE.MeshBasicMaterial;
  halo: THREE.MeshBasicMaterial;
  ok: THREE.MeshBasicMaterial;
  bad: THREE.MeshBasicMaterial;
};

function makeKit(): MarkKit {
  const flat = (color: THREE.ColorRepresentation, opacity: number, gain = 1) =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(gain),
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
  return {
    ringBest: new THREE.RingGeometry(0.17, 0.27, 32),
    discBest: new THREE.CircleGeometry(0.27, 32),
    ringOk: new THREE.RingGeometry(0.11, 0.165, 24),
    bar: new THREE.PlaneGeometry(0.3, 0.05),
    best: flat(PALETTE.ok, 0.95, 2.2),
    halo: flat(PALETTE.ok, 0.2, 1.4),
    ok: flat("#ffffff", 0.62),
    bad: flat(PALETTE.danger, 0.5),
  };
}

function disposeKit(kit: MarkKit) {
  Object.values(kit).forEach((r) => r.dispose());
}

function PinMark({ part, pin, fit, kit }: { part: PlacedPart; pin: string; fit: Fit; kit: MarkKit }) {
  const { poses } = useBench();
  const group = useRef<THREE.Group>(null);
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const at = pinPosition(poses, part, pin);
    if (!at) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.position.set(at.x, at.y + 0.02, at.z);
    g.scale.setScalar(fit === "best" ? 1 + 0.26 * Math.sin(state.clock.elapsedTime * 5.5) : 1);
  });
  return (
    <group ref={group} visible={false}>
      <group rotation-x={-Math.PI / 2}>
        {fit === "best" && (
          <>
            <mesh geometry={kit.discBest} material={kit.halo} renderOrder={4} raycast={NO_RAYCAST} />
            <mesh geometry={kit.ringBest} material={kit.best} renderOrder={5} raycast={NO_RAYCAST} />
          </>
        )}
        {fit === "ok" && <mesh geometry={kit.ringOk} material={kit.ok} renderOrder={4} raycast={NO_RAYCAST} />}
        {fit === "bad" && (
          <>
            <mesh geometry={kit.bar} material={kit.bad} rotation-z={Math.PI / 4} renderOrder={4} raycast={NO_RAYCAST} />
            <mesh geometry={kit.bar} material={kit.bad} rotation-z={-Math.PI / 4} renderOrder={4} raycast={NO_RAYCAST} />
          </>
        )}
      </group>
    </group>
  );
}

// --- Ghost wires: dashes marching along the arc a real wire would take ---
export type GhostStyle = "best" | "soft" | "step";
const GHOST_TINT: Record<WireKind, string> = { power: "#ff8a80", gnd: "#aab4c4", bus: "#8fc2ff", signal: "#e6e9ec" };
const GHOST = {
  best: { width: 0.055, dash: 0.17, gap: 0.15, speed: 0.55, opacity: 0.95 },
  soft: { width: 0.045, dash: 0.24, gap: 0.08, speed: 0.12, opacity: 0.4 },
  step: { width: 0.075, dash: 0.22, gap: 0.13, speed: 1.1, opacity: 1 },
} as const;

function GhostWire({ parts, from, to, style, kind }: { parts: Map<string, PlacedPart>; from: PinRef; to: PinRef; style: GhostStyle; kind: WireKind }) {
  const { poses } = useBench();
  const mesh = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const spec = GHOST[style];
  const material = useMemo(() => {
    const color = new THREE.Color(style === "best" ? PALETTE.ok : style === "step" ? PALETTE.accent : GHOST_TINT[kind]);
    if (style !== "soft") color.multiplyScalar(style === "step" ? 2.6 : 2);
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: spec.opacity, depthWrite: false, toneMapped: false });
  }, [style, kind, spec.opacity]);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    const m = mesh.current;
    const a = parts.get(from.part);
    const b = parts.get(to.part);
    if (!m || !a || !b) return;
    const p = pinPosition(poses, a, from.pin);
    const q = pinPosition(poses, b, to.pin);
    if (!p || !q) {
      m.count = 0;
      return;
    }
    const start = { x: p.x, y: p.y + CONNECTOR.top, z: p.z };
    const end = { x: q.x, y: q.y + CONNECTOR.top, z: q.z };
    const curve = wireCurve(start, end, { segments: 24, obstacles: poses.obstacles(), skip: [from.part, to.part] });
    const length = wireLength(curve) || 1;
    const period = spec.dash + spec.gap;
    const shift = (state.clock.elapsedTime * spec.speed) % period;
    let n = 0;
    for (let u0 = shift - period; n < MAX_DASHES && u0 < length; u0 += period) {
      const a0 = Math.max(0, u0);
      const a1 = Math.min(length, u0 + spec.dash);
      if (a1 - a0 < 0.02) continue;
      const mid: Vec3 = pointAlong(curve, (a0 + a1) / 2 / length, length);
      const ahead: Vec3 = pointAlong(curve, Math.min(1, (a1 + 0.02) / length), length);
      dummy.position.set(mid.x, mid.y, mid.z);
      dummy.lookAt(look.set(ahead.x, ahead.y, ahead.z));
      dummy.scale.set(spec.width, spec.width, a1 - a0);
      dummy.updateMatrix();
      m.setMatrixAt(n++, dummy.matrix);
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[geometry, material, MAX_DASHES]} frustumCulled={false} raycast={NO_RAYCAST} count={0} renderOrder={3} />;
}

// --- Everything together ---
export function GuideOverlay({ vm }: { vm: LabViewModel }) {
  const { poses } = useBench();
  const kit = useMemo(() => makeKit(), []);
  useEffect(() => () => disposeKit(kit), [kit]);

  const { design, wiring, guide, fits, bestTarget, suggestions, sim } = vm;
  const parts = useMemo(() => new Map(design.parts.map((p) => [p.id, p])), [design.parts]);
  const kindOf = (from: PinRef, to: PinRef) => wireKind(design, { id: "", from, to });
  const step = guide && !guide.step.done ? guide.step : null;
  const showSuggestions = !wiring && !guide && !sim.running;

  // A label over a pin of the current step
  const labelAt = (ref: PinRef) => () => {
    const part = parts.get(ref.part);
    const at = part && pinPosition(poses, part, ref.pin);
    return at ? ([at.x, at.y + 0.55, at.z] as [number, number, number]) : null;
  };

  return (
    <group name="guide-overlay">
      {wiring &&
        fits.map((f) => {
          const part = parts.get(f.part);
          return part ? <PinMark key={`fit:${f.part}.${f.pin}`} part={part} pin={f.pin} fit={f.fit} kit={kit} /> : null;
        })}
      {wiring && bestTarget && <GhostWire key={`best:${kindOf(wiring, bestTarget)}`} parts={parts} from={wiring} to={bestTarget} style="best" kind={kindOf(wiring, bestTarget)} />}

      {showSuggestions &&
        suggestions.map((s) => (
          <GhostWire key={`s:${s.from.part}.${s.from.pin}>${s.to.part}.${s.to.pin}:${kindOf(s.from, s.to)}`} parts={parts} from={s.from} to={s.to} style="soft" kind={kindOf(s.from, s.to)} />
        ))}

      {step && (
        <>
          {[step.from, step.to].map((ref) => {
            const part = parts.get(ref.part);
            return part ? <PinMark key={`step:${ref.part}.${ref.pin}`} part={part} pin={ref.pin} fit="best" kit={kit} /> : null;
          })}
          <GhostWire key={`step:${step.from.part}.${step.from.pin}>${step.to.part}.${step.to.pin}:${kindOf(step.from, step.to)}`} parts={parts} from={step.from} to={step.to} style="step" kind={kindOf(step.from, step.to)} />
          <WorldLabel text={pinsCopy.guide.pickLabel(step.from.pin)} position={labelAt(step.from)} />
          <WorldLabel text={pinsCopy.guide.thenLabel(step.to.pin)} position={labelAt(step.to)} />
        </>
      )}
    </group>
  );
}
