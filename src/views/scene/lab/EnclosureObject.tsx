"use client";

// The printable enclosure on the bench, drawn from the same solids as the STL. It assembles itself when it
// first appears, opens up when "Ver por dentro" is on, and quietly rebuilds a moment after the design
// stops changing (never while a part is being dragged).

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Enclosure } from "@/models/lab/enclosure";
import { benchInput } from "./benchInput";
import { buildEnclosure, type EnclosureBuild } from "./enclosureBuild";

const SETTLE_MS = 160;

type Props = { visible: boolean; exploded: boolean; data: Enclosure | null };
type Host = { built: EnclosureBuild | null; shownData: Enclosure | null; dirtyAt: number | null; data: Enclosure | null; exploded: boolean };

export function EnclosureObject({ visible, exploded, data }: Props) {
  const holder = useRef<THREE.Group>(null);
  const host = useRef<Host>({ built: null, shownData: null, dirtyAt: null, data: null, exploded: false });

  function mount(intro: boolean) {
    const h = host.current;
    unmount();
    if (!holder.current || !h.data) return;
    try {
      h.built = buildEnclosure(h.data, { intro, exploded: h.exploded });
    } catch (error) {
      console.error("lab: could not build the enclosure", error);
      return;
    }
    h.shownData = h.data;
    holder.current.add(h.built.group);
  }

  function unmount() {
    const h = host.current;
    h.built?.group.removeFromParent();
    h.built?.dispose();
    h.built = null;
    h.shownData = null;
  }

  useEffect(() => {
    const h = host.current;
    h.data = data?.ok ? data : null;
    if (!visible || !h.data) {
      unmount();
      h.dirtyAt = null;
      return;
    }
    if (!h.built) mount(true);
    else if (h.shownData !== h.data) h.dirtyAt = performance.now();
    // mount/unmount only touch the host and the holder
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, data]);

  useEffect(() => {
    host.current.exploded = exploded;
    host.current.built?.setExploded(exploded);
  }, [exploded]);

  useEffect(() => () => unmount(), []);

  useFrame((state, dt) => {
    const h = host.current;
    if (h.dirtyAt !== null && !benchInput.dragging && performance.now() - h.dirtyAt > SETTLE_MS) {
      h.dirtyAt = null;
      mount(false);
    }
    h.built?.update(state.clock.elapsedTime, Math.min(dt, 0.1));
  });

  return <group ref={holder} />;
}
