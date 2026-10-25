// Canvas textures for the bench's flat decals: the soft contact shadow under a part, the glow that marks
// a problem, the selection frame and the mat's grid. Drawn with shadowBlur (every browser has it, unlike
// the canvas blur filter). Cached by size; they live as long as the page.

import * as THREE from "three";

export const DECAL_PX = 56; // texture pixels per world unit
export const DECAL_PAD = 0.8; // room around the footprint for the blur

function canvasTexture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.ceil(width));
    canvas.height = Math.max(2, Math.ceil(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    draw(ctx, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  } catch {
    return null;
  }
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// Draws a shape far off the canvas and lets its blurred shadow land on it
function blurred(ctx: CanvasRenderingContext2D, w: number, color: string, blur: number, draw: (dx: number) => void) {
  const off = w * 3;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.shadowOffsetX = off;
  draw(-off);
  ctx.restore();
}

function softTexture(w: number, d: number, { color, blur, grow = 0 }: { color: string; blur: number; grow?: number }) {
  const width = (w + DECAL_PAD * 2) * DECAL_PX;
  const height = (d + DECAL_PAD * 2) * DECAL_PX;
  return canvasTexture(width, height, (ctx, cw, ch) => {
    const pad = DECAL_PAD * DECAL_PX;
    const g = grow * DECAL_PX;
    ctx.fillStyle = color;
    blurred(ctx, cw, color, blur, (dx) => {
      rounded(ctx, pad - g + dx, pad - g, cw - pad * 2 + g * 2, ch - pad * 2 + g * 2, 10 + g);
      ctx.fill();
    });
  });
}

// The selection frame: a crisp rounded outline with a soft glow, a little bigger than the part
function ringTexture(w: number, d: number) {
  const width = (w + DECAL_PAD * 2) * DECAL_PX;
  const height = (d + DECAL_PAD * 2) * DECAL_PX;
  return canvasTexture(width, height, (ctx, cw, ch) => {
    const m = (DECAL_PAD - 0.3) * DECAL_PX;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 9;
    blurred(ctx, cw, "#fff", 12, (dx) => {
      rounded(ctx, m + dx, m, cw - m * 2, ch - m * 2, 22);
      ctx.stroke();
    });
    ctx.lineWidth = 3;
    rounded(ctx, m, m, cw - m * 2, ch - m * 2, 22);
    ctx.stroke();
  });
}

export type DecalTextures = {
  w: number;
  d: number;
  shadow: THREE.Texture | null;
  halo: THREE.Texture | null;
  ring: THREE.Texture | null;
};

const decals = new Map<string, DecalTextures>();

// Textures for a footprint of w x d world units
export function decalTextures(w: number, d: number): DecalTextures {
  const key = `${w.toFixed(2)}x${d.toFixed(2)}`;
  let found = decals.get(key);
  if (!found) {
    found = {
      w,
      d,
      shadow: softTexture(w, d, { color: "#000", blur: 14 }),
      halo: softTexture(w, d, { color: "#fff", blur: 22, grow: 0.25 }),
      ring: ringTexture(w, d),
    };
    decals.set(key, found);
  }
  return found;
}

let mat: THREE.Texture | null | undefined;
let vignette: THREE.Texture | null | undefined;

// The mat: a dark surface with a faint grid, 5 x 5 cells per tile (1 cell = 1 world unit = 1 cm)
export function matTexture(): THREE.Texture | null {
  if (mat === undefined) {
    const cell = 48;
    mat = canvasTexture(cell * 5, cell * 5, (ctx, w, h) => {
      ctx.fillStyle = "#16181c";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i <= 5; i++) {
        ctx.fillStyle = i % 5 === 0 ? "rgba(255,255,255,.085)" : "rgba(255,255,255,.04)";
        ctx.fillRect(i * cell - 1, 0, 2, h);
        ctx.fillRect(0, i * cell - 1, w, 2);
      }
    });
    if (mat) mat.wrapS = mat.wrapT = THREE.RepeatWrapping;
  }
  return mat;
}

// A soft dark halo around the whole mat, so it sits on the ground instead of pasted on it
export function vignetteTexture(): THREE.Texture | null {
  if (vignette === undefined) vignette = softTexture(1, 1, { color: "#000", blur: 20 });
  return vignette;
}
