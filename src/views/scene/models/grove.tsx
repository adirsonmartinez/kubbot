"use client";

// Parts every module shares: the teal board with mounting lobes and the 4-pin connector.
// Modules are about one grid cell wide and sit on y = 0; parts on the board start at BOARD_TOP.

import { useMemo } from "react";
import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";

export const COLORS = {
  board: "#14a196",
  boardEdge: "#353a30",
  plastic: "#e8eaec",
  black: "#1d1e21",
  gold: "#d8b25a",
};

const BOARD = {
  lobe: 0.4, // lobe centers sit on the diagonals
  lobeRadius: 0.12,
  holeRadius: 0.055,
  thickness: 0.07,
};

export const BOARD_TOP = BOARD.thickness;

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

export function Board() {
  const geometry = useMemo(
    () => new THREE.ExtrudeGeometry(boardShape(), { depth: BOARD.thickness, bevelEnabled: false }),
    [],
  );
  return (
    // ExtrudeGeometry: material 0 for the faces, 1 for the sides
    <mesh geometry={geometry} rotation-x={-Math.PI / 2} castShadow receiveShadow>
      <meshStandardMaterial attach="material-0" color={COLORS.board} roughness={0.55} />
      <meshStandardMaterial attach="material-1" color={COLORS.boardEdge} roughness={0.8} />
    </mesh>
  );
}

// 4-pin connector at the back right: a shell open at the top, with a lower front wall and a latch
export function Connector() {
  return (
    <group position={[0.1, BOARD_TOP, -0.2]}>
      <Block size={[0.42, 0.08, 0.24]} at={[0, 0.04, 0]} />
      <Block size={[0.42, 0.42, 0.04]} at={[0, 0.21, -0.1]} />
      <Block size={[0.42, 0.3, 0.04]} at={[0, 0.15, 0.1]} />
      <Block size={[0.04, 0.42, 0.24]} at={[-0.19, 0.21, 0]} />
      <Block size={[0.04, 0.42, 0.24]} at={[0.19, 0.21, 0]} />
      <Block size={[0.16, 0.14, 0.03]} at={[0, 0.26, 0.05]} rotation-x={-0.5} />
    </group>
  );
}

// A box, white plastic unless told otherwise
export function Block({
  size,
  at,
  color = COLORS.plastic,
  roughness = 0.6,
  ...props
}: {
  size: [number, number, number];
  at: [number, number, number];
  color?: string;
  roughness?: number;
} & ThreeElements["mesh"]) {
  return (
    <mesh position={at} castShadow receiveShadow {...props}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}
