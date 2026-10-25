"use client";

// The bench's wires: tubes that arc between pins, with a plug at each end and glowing particles when the
// simulation runs. They follow the parts as they are dragged, turned or dropped (the eased poses in
// PoseStore), rise to clear any part under them, and a click removes one.

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { wireKind, type WireKind } from "@/models/lab/layout";
import type { Design, PlacedPart, Wire } from "@/viewmodels/useLabViewModel";
import { labCopy } from "@/views/copy/lab";
import { benchInput } from "./benchInput";
import { pinPosition, setCursor, useBench } from "./benchContext";
import { useDeferredDispose } from "./useDeferredDispose";
import { WorldLabel } from "./WorldLabel";
import { wireCurve, type Vec3 } from "./wireCurve";
import { flowsBackwards } from "./wireFlow";
import { buildWire, CONNECTOR } from "./wireVisual";

type End = { part: PlacedPart; pin: string };
type Item = { key: string; wire: Wire; kind: WireKind; reverse: boolean; index: number; swap: boolean; a: End; b: End };

const EPS = 1e-4;
const START: Vec3[] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0.1, z: 0 }];

// Wires between the same two parts fan out sideways; the curve is always built from the part with the
// smaller id, so two wires going opposite ways do not fall on the same side
function itemsOf(design: Design): Item[] {
  const pairs = new Map<string, number>();
  const items: Item[] = [];
  for (const wire of design.wires) {
    const pa = design.parts.find((p) => p.id === wire.from.part);
    const pb = design.parts.find((p) => p.id === wire.to.part);
    if (!pa || !pb) continue;
    const pair = [pa.id, pb.id].sort().join("|");
    const index = pairs.get(pair) ?? 0;
    pairs.set(pair, index + 1);
    const kind = wireKind(design, wire);
    items.push({
      // a reused id (the lowest free one) with other ends is a new wire: it grows in again
      key: `${wire.id}:${kind}:${pa.id}.${wire.from.pin}>${pb.id}.${wire.to.pin}`,
      wire,
      kind,
      reverse: flowsBackwards(design, wire, kind),
      index,
      swap: pa.id > pb.id,
      a: { part: pa, pin: wire.from.pin },
      b: { part: pb, pin: wire.to.pin },
    });
  }
  return items;
}

type Flow = { flows: React.RefObject<Record<string, number> | null>; running: React.RefObject<boolean> };

const WireView = memo(function WireView({ item, flow }: { item: Item; flow: Flow }) {
  const { poses, actions } = useBench();
  const gl = useThree((s) => s.gl);
  const [visual] = useState(() => buildWire({ id: item.wire.id, kind: item.kind, points: START, reverse: item.reverse, reveal: true }));
  const [hot, setHot] = useState(false);
  const hotRef = useRef(false);
  const last = useRef<{ version: number; item: Item | null; sig: number[] }>({ version: -1, item: null, sig: [] });
  useDeferredDispose(visual);

  useEffect(() => {
    visual.setVisible(false); // until the first frame places it
  }, [visual]);
  useEffect(() => visual.setReverse(item.reverse), [visual, item.reverse]);
  useEffect(() => {
    hotRef.current = hot;
    visual.setHot(hot);
  }, [visual, hot]);
  useEffect(() => {
    const canvas = gl.domElement;
    return () => {
      if (hotRef.current) setCursor(canvas, "");
    };
  }, [gl]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const poseA = poses.get(item.a.part.id);
    const poseB = poses.get(item.b.part.id);
    const a = pinPosition(poses, item.a.part, item.a.pin);
    const b = pinPosition(poses, item.b.part, item.b.pin);
    // wait for both parts to be on the bench (one may still be falling in)
    if (!a || !b || (poseA && !poseA.shown) || (poseB && !poseB.shown)) {
      visual.setVisible(false);
      return;
    }
    visual.setVisible(true);
    const memo = last.current;
    if (memo.version !== poses.version || memo.item !== item) {
      memo.version = poses.version;
      memo.item = item;
      const [p, q] = item.swap ? [b, a] : [a, b];
      const start = { x: p.x, y: p.y + CONNECTOR.top, z: p.z };
      const end = { x: q.x, y: q.y + CONNECTOR.top, z: q.z };
      const points = wireCurve(start, end, { index: item.index, obstacles: poses.obstacles(), skip: [item.a.part.id, item.b.part.id] });
      const apex = points.reduce((m, pt) => Math.max(m, pt.y), 0);
      const sig = [start.x, start.y, start.z, end.x, end.y, end.z, apex];
      if (sig.some((v, i) => Math.abs(v - (memo.sig[i] ?? Infinity)) > EPS)) {
        memo.sig = sig;
        visual.setPoints(item.swap ? points.reverse() : points);
      }
    }
    visual.update(dt, flow.flows.current?.[item.wire.id] ?? 0, flow.running.current);
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (benchInput.dragging || actions.isWiring()) return;
    setHot(true);
    setCursor(gl.domElement, "pointer");
  };
  const out = () => {
    if (!hotRef.current) return;
    setHot(false);
    setCursor(gl.domElement, "");
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (benchInput.dragging || actions.isWiring()) return;
    actions.removeWire(item.wire.id);
  };

  return (
    <>
      <primitive object={visual.group} onPointerOver={over} onPointerOut={out} onClick={click} />
      <WorldLabel
        text={hot ? labCopy.bench.removeWire : null}
        position={() => {
          const m = visual.mid();
          return [m.x, m.y + 0.3, m.z];
        }}
      />
    </>
  );
});

export function Wires({ design, flows, running }: { design: Design; flows: Record<string, number> | null; running: boolean }) {
  const items = useMemo(() => itemsOf(design), [design]);
  const flowsRef = useRef(flows);
  const runningRef = useRef(running);
  useEffect(() => {
    flowsRef.current = flows;
    runningRef.current = running;
  });
  const flow = useMemo<Flow>(() => ({ flows: flowsRef, running: runningRef }), []);
  return (
    <group name="wires">
      {items.map((item) => (
        <WireView key={item.key} item={item} flow={flow} />
      ))}
    </group>
  );
}
