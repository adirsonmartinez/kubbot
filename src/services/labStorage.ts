// Browser storage for the lab: the design on the bench survives a reload (localStorage), files the
// person exports are downloaded, and a circuit.json can be imported. Every call is safe when the
// browser has no storage (private window, blocked site data) or when there is no browser (SSR).

import { parseDesign, type Design } from "@/models/lab/circuit";

export const DESIGN_KEY = "qubbot.lab.design.v1";
export const MAX_DESIGN_BYTES = 1_000_000;

// The saved design text, or null when there is none or storage is not available
export function loadDesign(): string | null {
  try {
    return globalThis.localStorage?.getItem(DESIGN_KEY) ?? null;
  } catch {
    return null;
  }
}

// -> whether it was saved
export function saveDesign(text: string): boolean {
  try {
    if (!globalThis.localStorage) return false;
    globalThis.localStorage.setItem(DESIGN_KEY, text);
    return true;
  } catch {
    return false;
  }
}

// Hands a file to the person through the browser's download. -> whether the download started
export function downloadFile(name: string, data: string | ArrayBuffer | Uint8Array<ArrayBuffer>, mime: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined") return false;
  try {
    const url = URL.createObjectURL(new Blob([data], { type: mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.rel = "noopener";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

export type ImportedDesign = { design: Design; dropped: number };

// Reads a circuit.json the person picked. Broken parts are dropped (see parseDesign); null when the
// file is too big, unreadable or not JSON.
export async function readDesignFile(file: File): Promise<ImportedDesign | null> {
  if (!file || file.size > MAX_DESIGN_BYTES) return null;
  try {
    const parsed = parseDesign(await file.text());
    return parsed.error ? null : { design: parsed.design, dropped: parsed.dropped };
  } catch {
    return null;
  }
}
