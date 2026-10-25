"use client";

// A push-button module: a tactile switch with a black cap next to the connector.

import type { ThreeElements } from "@react-three/fiber";
import { Block, Board, BOARD_TOP, COLORS, Connector } from "./grove";

export function ButtonModule(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      <Board />
      <Connector />

      {/* Tactile switch */}
      <group position={[-0.06, BOARD_TOP, 0.16]}>
        <Block size={[0.36, 0.2, 0.36]} at={[0, 0.1, 0]} />
        <mesh position-y={0.24} castShadow>
          <cylinderGeometry args={[0.085, 0.09, 0.08, 32]} />
          <meshStandardMaterial color={COLORS.black} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}
