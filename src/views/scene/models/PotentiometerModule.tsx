"use client";

// A rotary potentiometer module: a metal can with a threaded bushing and a knurled black
// shaft, slotted on top, next to the connector.

import type { ThreeElements } from "@react-three/fiber";
import * as THREE from "three";
import { Block, Board, BOARD_TOP, COLORS, Connector } from "./grove";

const METAL = { color: "#b9bec6", metalness: 0.6, roughness: 0.28 };

const CAN = { width: 0.48, height: 0.3, depth: 0.42 };
const SHAFT = { radius: 0.075, height: 0.3, slot: 0.024, slotDepth: 0.06 };

export function PotentiometerModule(props: ThreeElements["group"]) {
  const shaftBody = SHAFT.height - SHAFT.slotDepth;
  return (
    <group {...props}>
      <Board />
      <Connector />

      <group position={[-0.14, BOARD_TOP, 0.15]}>
        {/* Metal can */}
        <mesh position-y={CAN.height / 2} castShadow receiveShadow>
          <boxGeometry args={[CAN.width, CAN.height, CAN.depth]} />
          <meshStandardMaterial {...METAL} />
        </mesh>

        {/* Bushing */}
        <mesh position={[0, CAN.height + 0.03, -0.03]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.06, 32]} />
          <meshStandardMaterial {...METAL} />
        </mesh>

        {/* Knurled shaft: faceted sides read as ridges; split at the top by the slot */}
        <group position={[0, CAN.height + 0.06, -0.03]}>
          <mesh position-y={shaftBody / 2} castShadow>
            <cylinderGeometry args={[SHAFT.radius, SHAFT.radius, shaftBody, 18]} />
            <meshStandardMaterial color={COLORS.black} roughness={0.5} flatShading />
          </mesh>
          {[0, Math.PI].map((start) => (
            <mesh
              key={start}
              position={[start ? -SHAFT.slot / 2 : SHAFT.slot / 2, shaftBody + SHAFT.slotDepth / 2, 0]}
              castShadow
            >
              <cylinderGeometry
                args={[SHAFT.radius, SHAFT.radius, SHAFT.slotDepth, 9, 1, false, start, Math.PI]}
              />
              <meshStandardMaterial color={COLORS.black} roughness={0.5} flatShading side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Solder tabs peeking out under the can */}
      {[-0.3, -0.14, 0.02].map((x) => (
        <Block key={x} size={[0.04, 0.02, 0.05]} at={[x, BOARD_TOP + 0.01, 0.38]} color={METAL.color} />
      ))}
    </group>
  );
}
