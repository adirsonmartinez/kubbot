// "Mi catálogo" in the browser: the components the person imported (their ficha and a small photo) saved in
// localStorage, the .json export / import of a ficha, the photo downscaling, and the call to the extraction
// route. Every storage call is safe when the browser has none (private window, blocked data, SSR).
// Imports are relative with the .ts extension so the storage logic runs in node's test runner.

import { parseSpec, validateSpec, type ComponentSpec } from "../models/lab/componentSpec.ts";

export const SPECS_KEY = "qubbot.lab.components.v1";
export const PHOTO_KEY = "qubbot.lab.component-photo.v1:";
export const LIMITS = {
  components: 40,
  specsBytes: 300_000, // all fichas together
  photoBytes: 120_000, // one photo as a data URL (512 px JPEG is around 40 to 80 KB)
  photoPx: 512,
  uploadPx: 1600,
  uploadBytes: 10 * 1024 * 1024,
} as const;

export type UserItem = { spec: ComponentSpec; photo: string | null };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const storageOf = (): Store | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

// --- The saved components ---
// Fichas that no longer pass the validator (a stale save, a hand-edited file) are left out, not thrown
export function loadUserItems(storage: Store | null = storageOf()): UserItem[] {
  if (!storage) return [];
  try {
    const raw: unknown = JSON.parse(storage.getItem(SPECS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    const items: UserItem[] = [];
    for (const entry of raw.slice(0, LIMITS.components)) {
      const spec = parseSpec(entry);
      if (!validateSpec(spec).ok || items.some((i) => i.spec.id === spec.id)) continue;
      let photo: string | null = null;
      try {
        photo = storage.getItem(PHOTO_KEY + spec.id);
      } catch {
        photo = null;
      }
      items.push({ spec, photo: photo && photo.startsWith("data:image/") ? photo : null });
    }
    return items;
  } catch {
    return [];
  }
}

export type SaveResult = "ok" | "full" | "failed";

// Saves (or replaces) one component. A photo that is too big is dropped and the ficha is still saved.
export function saveUserItem(item: UserItem, storage: Store | null = storageOf()): SaveResult {
  if (!storage) return "failed";
  try {
    const others = loadUserItems(storage).filter((i) => i.spec.id !== item.spec.id);
    if (others.length >= LIMITS.components) return "full";
    const specs = JSON.stringify([...others.map((i) => i.spec), item.spec]);
    if (specs.length > LIMITS.specsBytes) return "full";
    storage.setItem(SPECS_KEY, specs);
    try {
      if (item.photo && item.photo.length <= LIMITS.photoBytes) storage.setItem(PHOTO_KEY + item.spec.id, item.photo);
      else storage.removeItem(PHOTO_KEY + item.spec.id);
    } catch {
      // the photo is a nicety: the ficha stays saved
    }
    return "ok";
  } catch {
    return "failed";
  }
}

export function removeUserItem(id: string, storage: Store | null = storageOf()): boolean {
  if (!storage) return false;
  try {
    const rest = loadUserItems(storage).filter((i) => i.spec.id !== id);
    storage.setItem(SPECS_KEY, JSON.stringify(rest.map((i) => i.spec)));
    storage.removeItem(PHOTO_KEY + id);
    return true;
  } catch {
    return false;
  }
}

// --- The .json of a ficha ---
export const specFileName = (spec: ComponentSpec): string => `${spec.id}.json`;

export function specToJson(spec: ComponentSpec): string {
  return JSON.stringify({ qubbot: "component", version: 1, ...spec }, null, 2);
}

// A ficha from a file's text, or null when it is not one. It is cleaned like any other ficha; the form
// shows what is still wrong with it.
export function specFromJson(text: string, taken: Iterable<string> = []): ComponentSpec | null {
  try {
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.name !== "string" || !Array.isArray(r.pins)) return null;
    return parseSpec(raw, taken);
  } catch {
    return null;
  }
}

// --- Photos (browser only) ---
export type Picture = { dataUrl: string; color: number };

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

// The picture shrunk so its long side is at most maxPx (never enlarged), as a JPEG data URL, plus its
// average colour (for the model's body when there is no better).
export async function shrinkImage(file: Blob, maxPx: number, quality = 0.82): Promise<Picture> {
  const img = await loadImage(file);
  const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight, 1));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#ffffff"; // transparent PNGs get a white back instead of black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const small = document.createElement("canvas");
  small.width = small.height = 1;
  const sctx = small.getContext("2d");
  let color = 0x1f5fbf;
  if (sctx) {
    sctx.drawImage(canvas, 0, 0, 1, 1);
    const [r, g, b] = sctx.getImageData(0, 0, 1, 1).data;
    color = (r << 16) | (g << 8) | b;
  }
  return { dataUrl: canvas.toDataURL("image/jpeg", quality), color };
}

// A photo for the texture: <= 512 px and under the storage guard (lowering the quality if it is still big)
export async function photoFor(file: Blob): Promise<Picture> {
  let pic = await shrinkImage(file, LIMITS.photoPx);
  for (const q of [0.7, 0.55, 0.4]) {
    if (pic.dataUrl.length <= LIMITS.photoBytes) break;
    pic = await shrinkImage(file, LIMITS.photoPx, q);
  }
  return pic;
}

// --- Asking Qubi to read the file ---
export type ExtractError = "no-key" | "rate" | "busy" | "too-big" | "bad-type" | "refused" | "unreadable" | "not-a-component" | "bad-key" | "api" | "network";
export type ExtractResult = { ok: true; spec: ComponentSpec; notes: string } | { ok: false; error: ExtractError; notes: string };

const ERRORS: readonly string[] = ["no-key", "rate", "busy", "too-big", "bad-type", "refused", "unreadable", "not-a-component", "bad-key", "api"];

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read"));
    reader.readAsDataURL(file);
  });
}

export async function extractComponent(file: File, hint = "", taken: Iterable<string> = []): Promise<ExtractResult> {
  const fail = (error: ExtractError, notes = ""): ExtractResult => ({ ok: false, error, notes });
  try {
    const isPdf = file.type === "application/pdf";
    if (!isPdf && !file.type.startsWith("image/")) return fail("bad-type");
    if (file.size > LIMITS.uploadBytes) return fail("too-big");
    // A big photo is shrunk first (the model reads it fine and the upload is smaller)
    const dataUrl = isPdf || file.size < 1_500_000 ? await readAsDataUrl(file) : (await shrinkImage(file, LIMITS.uploadPx, 0.88)).dataUrl;
    const mime = isPdf ? "application/pdf" : /^data:(image\/[a-z+]+);/.exec(dataUrl)?.[1] ?? file.type;
    const response = await fetch("/api/component/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileBase64: dataUrl.slice(dataUrl.indexOf(",") + 1), mime, hint }),
    });
    const body = (await response.json().catch(() => null)) as { spec?: unknown; notes?: unknown; error?: unknown } | null;
    const notes = typeof body?.notes === "string" ? body.notes : "";
    if (!response.ok || !body?.spec) return fail(ERRORS.includes(String(body?.error)) ? (body!.error as ExtractError) : "api", notes);
    return { ok: true, spec: parseSpec(body.spec, taken), notes };
  } catch {
    return fail("network");
  }
}
