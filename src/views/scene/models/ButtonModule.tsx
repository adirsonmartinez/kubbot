"use client";

// A push-button module: a teal board with mounting lobes, a tactile switch with a black cap
// and a 4-pin connector. About one grid cell wide, sitting on y = 0.

import { useMemo } from "react";
import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

const COLORS = {
  board: "#14a196",
  boardEdge: "#353a30",
  plastic: "#e8eaec",
  cap: "#1d1e21",
};

const BOARD = {
  edge: 0.46, // half the width of the straight edges
  lobe: 0.4, // lobe centers sit on the diagonals
  lobeRadius: 0.12,
  holeRadius: 0.055,
  thickness: 0.07,
};

// Outline: four round lobes joined by straight edges, each lobe with a mounting hole
function boardShape() {
  const { lobe, lobeRadius, holeRadius } = BOARD;
  const shape = new THREE.Shape();
  const sweep = (105 * Math.PI) / 180; // reaches back to where the lobe meets the edges
  for (const angle of [-0.25, 0.25, 0.75, 1.25].map((t) => t * Math.PI)) {
    const cx = Math.sign(Math.cos(angle)) * lobe;
    const cy = Math.sign(Math.sin(angle)) * lobe;
    shape.absarc(cx, cy, lobeRadius, angle - sweep, angle + sweep, false);
    const hole = new THREE.Path();
    hole.absarc(cx, cy, holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  shape.closePath();
  return shape;
}

export function ButtonModule(props: ThreeElements["group"]) {
  const board = useMemo(
    () => new THREE.ExtrudeGeometry(boardShape(), { depth: BOARD.thickness, bevelEnabled: false }),
    [],
  );
  const top = BOARD.thickness;

  return (
    <group {...props}>
      {/* ExtrudeGeometry: material 0 for the faces, 1 for the sides */}
      <mesh geometry={board} rotation-x={-Math.PI / 2} castShadow receiveShadow>
        <meshStandardMaterial attach="material-0" color={COLORS.board} roughness={0.55} />
        <meshStandardMaterial attach="material-1" color={COLORS.boardEdge} roughness={0.8} />
      </mesh>

      {/* Tactile switch */}
      <group position={[-0.06, top, 0.16]}>
        <mesh position-y={0.1} castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.2, 0.36]} />
          <meshStandardMaterial color={COLORS.plastic} roughness={0.6} />
        </mesh>
        <mesh position-y={0.24} castShadow>
          <cylinderGeometry args={[0.085, 0.09, 0.08, 32]} />
          <meshStandardMaterial color={COLORS.cap} roughness={0.35} />
        </mesh>
      </group>

      {/* 4-pin connector: a shell open at the top, with a lower front wall and a latch */}
      <group position={[0.1, top, -0.2]}>
        <Plastic size={[0.42, 0.08, 0.24]} at={[0, 0.04, 0]} />
        <Plastic size={[0.42, 0.42, 0.04]} at={[0, 0.21, -0.1]} />
        <Plastic size={[0.42, 0.3, 0.04]} at={[0, 0.15, 0.1]} />
        <Plastic size={[0.04, 0.42, 0.24]} at={[-0.19, 0.21, 0]} />
        <Plastic size={[0.04, 0.42, 0.24]} at={[0.19, 0.21, 0]} />
        <Plastic size={[0.16, 0.14, 0.03]} at={[0, 0.26, 0.05]} rotation-x={-0.5} />
      </group>
    </group>
  );
}

function Plastic({
  size,
  at,
  ...props
}: { size: [number, number, number]; at: [number, number, number] } & ThreeElements["mesh"]) {
  return (
    <mesh position={at} castShadow receiveShadow {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={COLORS.plastic} roughness={0.6} />
    </mesh>
  );
}
