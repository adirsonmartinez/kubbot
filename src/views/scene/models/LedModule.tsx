"use client";

// An LED module: a red 5 mm LED standing in a 2-pin socket, a trimmer potentiometer with an
// orange knob, a couple of SMD chips and the connector.

import type { ReactNode } from "react";
import type { ThreeElements } from "@react-three/fiber";
import { Block, Board, BOARD_TOP, COLORS, Connector } from "./grove";

const LED = {
  red: "#d4202a",
  radius: 0.085,
  height: 0.2, // the cylinder, without the dome
  legs: 0.12,
};

const KNOB = { orange: "#f08a1c", slot: "#b85e0c" };

export function LedModule(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      <Board />
      <Connector />

      {/* 2-pin socket with the LED standing in it */}
      <group position={[-0.27, BOARD_TOP, -0.02]}>
        <Block size={[0.12, 0.1, 0.2]} at={[0, 0.05, 0]} color={COLORS.black} roughness={0.5} />
        {[-0.045, 0.045].map((z) => (
          <group key={z}>
            <mesh position={[0, 0.101, z]}>
              <cylinderGeometry args={[0.025, 0.025, 0.002, 16]} />
              <meshStandardMaterial color={COLORS.gold} metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.1 + LED.legs / 2, z * 0.6]} castShadow>
              <cylinderGeometry args={[0.008, 0.008, LED.legs, 8]} />
              <meshStandardMaterial color="#c9ccd1" metalness={0.9} roughness={0.25} />
            </mesh>
          </group>
        ))}
        <group position-y={0.1 + LED.legs}>
          <LedPart y={0.015}>
            <cylinderGeometry args={[LED.radius + 0.012, LED.radius + 0.012, 0.03, 32]} />
          </LedPart>
          <LedPart y={0.03 + LED.height / 2}>
            <cylinderGeometry args={[LED.radius, LED.radius, LED.height, 32]} />
          </LedPart>
          <LedPart y={0.03 + LED.height}>
            <sphereGeometry args={[LED.radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </LedPart>
        </group>
      </group>

      {/* Trimmer potentiometer: black body, orange knob with a cross slot */}
      <group position={[0.06, BOARD_TOP, 0.2]}>
        <Block size={[0.32, 0.13, 0.3]} at={[0, 0.065, 0]} color={COLORS.black} roughness={0.5} />
        <mesh position-y={0.155} castShadow>
          <cylinderGeometry args={[0.085, 0.09, 0.05, 32]} />
          <meshStandardMaterial color={KNOB.orange} roughness={0.45} />
        </mesh>
        <Block size={[0.12, 0.012, 0.025]} at={[0, 0.181, 0]} color={KNOB.slot} />
        <Block size={[0.025, 0.012, 0.12]} at={[0, 0.181, 0]} color={KNOB.slot} />
      </group>

      {/* SMD chips */}
      <Block size={[0.1, 0.035, 0.06]} at={[-0.12, BOARD_TOP + 0.0175, -0.08]} color={COLORS.black} />
      <Block size={[0.06, 0.03, 0.1]} at={[-0.17, BOARD_TOP + 0.015, 0.27]} color={COLORS.black} />
    </group>
  );
}

// Glossy, slightly see-through red plastic
function LedPart({ y, children }: { y: number; children: ReactNode }) {
  return (
    <mesh position-y={y} castShadow>
      {children}
      <meshStandardMaterial
        color={LED.red}
        emissive={LED.red}
        emissiveIntensity={0.25}
        roughness={0.15}
        transparent
        opacity={0.88}
      />
    </mesh>
  );
}
