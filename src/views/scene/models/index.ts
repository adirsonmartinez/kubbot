// The 3D model for each component kind.

import type { ComponentType } from "react";
import type { ThreeElements } from "@react-three/fiber";
import type { ComponentKind } from "@/models/component";
import { ButtonModule } from "./ButtonModule";
import { LedModule } from "./LedModule";
import { PotentiometerModule } from "./PotentiometerModule";

export const COMPONENT_MODELS: Record<ComponentKind, ComponentType<ThreeElements["group"]>> = {
  button: ButtonModule,
  led: LedModule,
  potentiometer: PotentiometerModule,
};
