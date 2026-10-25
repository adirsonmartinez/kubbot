"use client";

// The lab's 3D bench. It goes inside IsoScene and draws what the view model holds: a mat, the parts on it,
// the wires between their pins, the line being drawn while wiring and the printable enclosure. Everything
// the person does here (drag a part, click a pin, click a wire, press R / Delete / Esc) goes back through
// the view model's commands.
//
// - `insets`: pixels of the stage covered by panels (side panel, chat, toolbar); the camera frames the
//   parts, and the box when it is shown, in the free area that is left.
// - `onReady(dropAt)`: gives the page a function that turns a screen point into the floor (snapped), for
//   HTML drops from the catalog; it is called with null when the bench goes away.
// - Dragging a part must not pan the map: MapInput listens on the canvas itself, so it asks
//   `benchInput.claims(x, y)` (./benchInput) before it starts a pan.

import { useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CAMERA, type CameraRig } from "@/models/camera";
import { fitsView, frameBoxes, type Box3, type FrameOptions, type Insets } from "@/models/lab/framing";
import { MM, partBox } from "@/models/lab/layout";
import type { LabViewModel, PlacedPart } from "@/viewmodels/useLabViewModel";
import { labCopy } from "@/views/copy/lab";
import { BenchMat } from "./BenchMat";
import { BenchContext, PoseStore, pinPosition, useBench, type BenchActions, type BenchContextValue } from "./benchContext";
import { benchInput } from "./benchInput";
import { EnclosureObject } from "./EnclosureObject";
import { LID_LIFT, SPREAD } from "./enclosureBuild";
import { PartObject } from "./PartObject";
import { WiringLine } from "./WiringLine";
import { Wires } from "./Wires";
import { WorldLabel } from "./WorldLabel";

const SNAP = 0.25;
const LIMIT = 60;
const STAGGER = 0.045; // seconds between parts of a batch falling in

export type DropAt = (clientX: number, clientY: number) => { x: number; z: number } | null;

type Props = { vm: LabViewModel; rig: CameraRig; insets?: Insets; onReady?: (dropAt: DropAt | null) => void };

const NO_INSETS: Insets = { left: 0, right: 0, top: 0, bottom: 0 };
const PART_AIR = 1.5; // wires arch above the parts: leave room over them

const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const isVisible = (o: THREE.Object3D | null) => {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
};

// A label above the pin under the pointer
function PinTip({ vm }: { vm: LabViewModel }) {
  const { poses } = useBench();
  const hover = vm.hover;
  const part = hover ? vm.design.parts.find((p) => p.id === hover.part) : undefined;
  const text = hover && part ? labCopy.bench.pinTip(vm.partLabel(hover.part), hover.pin) : null;
  return (
    <WorldLabel
      text={text}
      position={() => {
        if (!hover || !part || benchInput.dragging) return null;
        const at = pinPosition(poses, part, hover.pin);
        return at ? [at.x, at.y + 0.5, at.z] : null;
      }}
    />
  );
}

export function LabBench({ vm, rig, insets = NO_INSETS, onReady }: Props) {
  const camera = useThree((s) => s.camera);
  const canvas = useThree((s) => s.gl.domElement);
  const { design } = vm;

  // The newest view model, for handlers that live longer than a render
  const vmRef = useRef(vm);
  const readyRef = useRef(onReady);
  useEffect(() => {
    vmRef.current = vm;
    readyRef.current = onReady;
  });

  const poses = useMemo(() => new PoseStore(), []);
  const partsGroup = useRef<THREE.Group>(null);

  // Screen point -> the floor
  const groundAt = useMemo(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    return (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(floor, hit) ? { x: hit.x, z: hit.z } : null;
    };
  }, [camera, canvas]);

  const actions = useMemo<BenchActions>(
    () => ({
      select: (id) => vmRef.current.select(id),
      move: (id, at) => vmRef.current.move(id, at),
      moveEnd: () => vmRef.current.moveEnd(),
      pickPin: (part, pin) => vmRef.current.pickPin(part, pin),
      hoverPin: (part, pin) => vmRef.current.hoverPin(part, pin),
      hovered: () => vmRef.current.hover,
      isWiring: () => vmRef.current.wiring !== null,
      removeWire: (id) => vmRef.current.removeWire(id),
    }),
    [],
  );

  const context = useMemo<BenchContextValue>(() => ({ poses, actions, groundAt }), [poses, actions, groundAt]);

  // HTML drops: where on the bench would a part land
  useEffect(() => {
    const dropAt: DropAt = (x, y) => {
      const r = canvas.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
      const at = groundAt(x, y);
      return at ? { x: clamp(snap(at.x), -LIMIT, LIMIT), z: clamp(snap(at.z), -LIMIT, LIMIT) } : null;
    };
    readyRef.current?.(dropAt);
    return () => readyRef.current?.(null);
  }, [groundAt, canvas]);

  // MapInput asks before panning: a press on a part or a pin is ours
  useEffect(() => {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    benchInput.claims = (x, y) => {
      const group = partsGroup.current;
      const r = canvas.getBoundingClientRect();
      if (!group || !r.width || !r.height) return false;
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObject(group, true).some((hit) => isVisible(hit.object));
    };
    return () => {
      benchInput.claims = null;
    };
  }, [camera, canvas]);

  // R turns the selected part, Delete removes it, Esc cancels a wire or clears the selection
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, select, [contenteditable]")) return;
      const v = vmRef.current;
      if (e.key === "Escape") {
        v.escape();
        return;
      }
      if (!v.selected) return;
      if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        v.rotate(v.selected);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        v.remove(v.selected);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Frame the bench in the free part of the stage (not under the panels): the first time there is
  // something on it, and again when a new part, a panel or the box would end up out of sight
  const framed = useRef(false);
  const size = useThree((s) => s.size);
  const { left, right, top, bottom } = insets;
  const parts = design.parts.length;
  const box = vm.enclosure.visible;
  const exploded = vm.enclosure.exploded;
  useEffect(() => {
    if (!size.width || !size.height) return;
    const v = vmRef.current;
    const boxes: Box3[] = v.design.parts.map((p) => {
      const b = partBox(p);
      return { min: [b.x - b.w / 2, 0, b.z - b.d / 2], max: [b.x + b.w / 2, b.h + PART_AIR, b.z + b.d / 2] };
    });
    const shell = v.enclosure.data;
    if (box && shell?.ok) {
      const grow = exploded ? SPREAD * MM : 0;
      const lift = exploded ? LID_LIFT * MM : 0;
      boxes.push({
        min: [shell.outer.min[0] * MM - grow, 0, shell.outer.min[2] * MM - grow],
        max: [shell.outer.max[0] * MM + grow, shell.outer.max[1] * MM + lift, shell.outer.max[2] * MM + grow],
      });
    }
    if (!boxes.length) return;
    const opts: FrameOptions = {
      azimuth: rig.azimuthGoal,
      elevation: rig.elevation,
      width: size.width,
      height: size.height,
      insets: { left, right, top, bottom },
      viewHeight: CAMERA.viewHeight,
      zoomMin: 0.5,
      zoomMax: 1.8,
    };
    const frame = frameBoxes(boxes, opts);
    if (!frame) return;
    const at = { ...(rig.targetGoal ?? rig.target), zoom: rig.zoomGoal };
    if (framed.current && fitsView(boxes, at, opts)) return;
    framed.current = true;
    rig.flyTo({ x: frame.x, z: frame.z }, frame.zoom);
  }, [parts, box, exploded, left, right, top, bottom, size, rig]);

  // --- Parts falling in (a batch one after another) and shrinking away (kept a moment as "ghosts") ---
  const [seen, setSeen] = useState<Map<string, number>>(() => new Map());
  const [lastParts, setLastParts] = useState<PlacedPart[]>(design.parts);
  const [ghosts, setGhosts] = useState<PlacedPart[]>([]);
  const ids = new Set(design.parts.map((p) => p.id));
  const fresh = design.parts.filter((p) => !seen.has(p.id));
  const stale = [...seen.keys()].filter((id) => !ids.has(id));
  if (fresh.length || stale.length) {
    const next = new Map(seen);
    stale.forEach((id) => next.delete(id));
    fresh.forEach((p, i) => next.set(p.id, fresh.length > 1 ? Math.min(i, 14) * STAGGER : 0));
    setSeen(next);
  }
  if (lastParts !== design.parts) {
    setLastParts(design.parts);
    const gone = lastParts.filter((p) => !ids.has(p.id));
    if (gone.length || ghosts.some((g) => ids.has(g.id))) setGhosts([...ghosts.filter((g) => !ids.has(g.id)), ...gone]);
  }
  const dropGhost = (id: string) => setGhosts((all) => all.filter((g) => g.id !== id));

  const running = vm.sim.running && vm.simState !== null;
  const levels = vm.check.parts;

  return (
    <BenchContext.Provider value={context}>
      <BenchMat parts={design.parts} />

      {/* a click on the empty bench clears the selection (parts and wires stop their own clicks) */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} onClick={() => actions.select(null)}>
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial visible={false} />
      </mesh>

      <group ref={partsGroup} name="parts">
        {design.parts.map((part) => (
          <PartObject
            key={`${part.id}:${part.type}`}
            part={part}
            level={levels[part.id] ?? "green"}
            selected={vm.selected === part.id}
            hoverPin={vm.hover?.part === part.id ? vm.hover.pin : null}
            sim={vm.simState?.parts[part.id] ?? null}
            delay={seen.get(part.id) ?? 0}
          />
        ))}
        {ghosts
          .filter((g) => !ids.has(g.id))
          .map((part) => (
            <PartObject key={`gone:${part.id}:${part.type}`} part={part} level="green" selected={false} hoverPin={null} sim={null} leaving onGone={dropGhost} />
          ))}
      </group>

      <Wires design={design} flows={vm.simState?.wires ?? null} running={running} />
      <WiringLine design={design} wiring={vm.wiring} hover={vm.hover} />
      <EnclosureObject visible={vm.enclosure.visible} exploded={vm.enclosure.exploded} data={vm.enclosure.data} />

      <PinTip vm={vm} />
      <WorldLabel text={design.parts.length ? null : labCopy.bench.empty} position={() => [0, 0.4, 0]} wrap />
    </BenchContext.Provider>
  );
}
