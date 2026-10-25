// Imported parts: a generic model drawn from the ficha alone (size, category, pins) so a component the person
// brought from a photo or a datasheet stands on the bench like any other. A PCB slab of the real footprint
// with the photo as its top texture (a neutral colour while there is none, or where there is no DOM), the
// header pins where layout.pinSpots puts them (buildPart adds those), and a plain body that tells the
// category: a chip and USB for a board, a module block, a screen, a cube or a knob for the rest.
// The simulation is alive / dead only: a small green light that shows the part has power.
import * as THREE from "three";
import { K, box, chip, cyl, mat, pcb, silkRect, statusLed, usbPort } from "./kit.ts";
import type { Builder, PartContext } from "./types.ts";

const PCB_T = 1.6;
const PHOTO_LIFT = 0.04; // the photo plane floats this far over the board (mm) so the two never fight

// Fits an image to the plane like CSS "cover": the whole plane is filled and the extra is cropped
export function coverFit(imageAspect: number, planeAspect: number): { repeat: [number, number]; offset: [number, number] } {
  if (!(imageAspect > 0) || !(planeAspect > 0)) return { repeat: [1, 1], offset: [0, 0] };
  if (imageAspect > planeAspect) {
    const x = planeAspect / imageAspect;
    return { repeat: [x, 1], offset: [(1 - x) / 2, 0] };
  }
  const y = imageAspect / planeAspect;
  return { repeat: [1, y], offset: [0, (1 - y) / 2] };
}

function photoPlane(ctx: PartContext, w: number, d: number, photoUrl: string, y: number): void {
  const material = ctx.own(new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.6, metalness: 0 }));
  const geometry = ctx.own(new THREE.PlaneGeometry(w, d));
  const plane = new THREE.Mesh(geometry, material);
  plane.rotation.x = -Math.PI / 2; // the top of the photo faces the far edge (-z)
  plane.position.y = y;
  plane.name = "photo";
  ctx.body.add(plane);
  // Needs a DOM image; in tests and on the server the neutral colour stays
  if (typeof document === "undefined") return;
  let gone = false;
  ctx.own({ dispose: () => void (gone = true) });
  new THREE.TextureLoader().load(
    photoUrl,
    (texture) => {
      if (gone) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const image = texture.image as { width?: number; height?: number } | undefined;
      const fit = coverFit((image?.width ?? 0) / (image?.height || 1), w / d);
      texture.repeat.set(...fit.repeat);
      texture.offset.set(...fit.offset);
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
      ctx.own(texture);
    },
    undefined,
    () => {}, // an unreadable photo leaves the neutral colour
  );
}

// The block that tells the category, kept to the back so the photo stays visible in front of it
function categoryBody(ctx: PartContext, photo: boolean): void {
  const { spec, body } = ctx;
  const [w, d, h] = spec.size;
  const top = PCB_T + (photo ? PHOTO_LIFT : 0);
  const tall = Math.max(0, h - PCB_T);
  const scale = photo ? 0.34 : 0.8; // how much of the footprint the block may cover (small with a photo: the photo is the picture)
  switch (spec.category) {
    case "boards": {
      chip(body, 0, top, 0, Math.min(w * 0.3, 14), Math.min(d * 0.3, 14), Math.min(1.6, tall || 1.6), { leads: "quad" });
      usbPort(body, -w / 2 + 4, top, 0, { dir: -1, len: Math.min(14, w * 0.3), w: Math.min(10, d * 0.5), h: Math.min(Math.max(tall, 3), 8), mouthW: Math.min(8, d * 0.4), mouthH: 2.4 });
      break;
    }
    case "displays": {
      const sw = w * 0.8, sd = d * 0.6;
      box(body, K.black, sw, Math.min(Math.max(tall, 1.2), 3), sd, 0, top, -d * 0.1);
      break;
    }
    case "inputs": {
      const r = Math.min(w, d) * 0.3;
      cyl(body, mat("custom-knob", 0x2b2f36, { r: 0.5, m: 0.2 }), r, Math.max(tall, 3), 0, top, -d * 0.1, 24);
      break;
    }
    default: {
      // sensors, actuators, power: a module block with a chip on it
      const bw = w * scale, bd = d * scale * 0.7, bh = photo ? Math.min(Math.max(tall, 2), 6) : Math.max(tall, 2);
      const x = photo ? w * 0.28 : 0;
      box(body, photo ? K.black : mat(`custom-${spec.category}`, spec.color, { r: 0.55, m: 0.05 }), bw, bh, bd, x, top, -d * 0.12);
      if (!photo) chip(body, 0, top + bh, -d * 0.12, Math.min(bw * 0.4, 8), Math.min(bd * 0.4, 6), 1, { leads: "skirt" });
    }
  }
}

export function customBuilder(photoUrl?: string): Builder {
  return (ctx) => {
    const { spec, body } = ctx;
    const [w, d] = spec.size;
    pcb(body, spec.kind === "board" ? spec.color : 0x1f5fbf, w, d, { t: PCB_T, r: Math.min(1.2, w / 6, d / 6) });
    ctx.pinOptions.housing = "strips";
    ctx.pinOptions.base = PCB_T;
    if (photoUrl) photoPlane(ctx, w, d, photoUrl, PCB_T + PHOTO_LIFT);
    else silkRect(body, -w / 2 + 1.2, -d / 2 + 1.2, w / 2 - 1.2, d / 2 - 1.2, PCB_T, 0.3);
    categoryBody(ctx, !!photoUrl);

    // A small green light at the back corner: the part has power
    const led = statusLed(ctx, body, w / 2 - 2.2, PCB_T + (photoUrl ? PHOTO_LIFT : 0), -d / 2 + 2, 0x4ade80, { w: 1.6, d: 1.6, h: 0.8 });
    return { sim: (state) => led.set(!!state) };
  };
}
