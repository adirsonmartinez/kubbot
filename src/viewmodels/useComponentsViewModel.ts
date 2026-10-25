"use client";

// ViewModel for the components panel: the catalog the user can pick from.

import { useState } from "react";
import { listComponents } from "@/services/componentService";

export function useComponentsViewModel() {
  const [components] = useState(listComponents);

  return { components };
}

export type ComponentsViewModel = ReturnType<typeof useComponentsViewModel>;
