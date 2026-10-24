// Shared materials, geometries and primitives (same pattern as the zombieland game).
import * as THREE from 'three';

const cache = {};
function material(name, color = 0xffffff, options = {}) {
  if (cache[name]) return cache[name];
  return (cache[name] = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.8,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 1,
  }));
}

export const materials = {
  get indigo()            { return material('indigo', 0x5a50ea); },
  get indigoDark()        { return material('indigoDark', 0x3d34c4); },
  get lavender()          { return material('lavender', 0xd6d2fb); },
  get lavenderDark()      { return material('lavenderDark', 0xa9a2f0); },
  get teal()              { return material('teal', 0x2fd9a8); },
  get tealLit()           { return material('tealLit', 0x2fd9a8, { emissive: 0x2fd9a8, emissiveIntensity: 0.6, roughness: 0.3 }); },
  get screen()            { return material('screen', 0x2e2e38, { roughness: 0.35 }); },
  get metal()             { return material('metal', 0xb5b5c2, { roughness: 0.45, metalness: 0.6 }); },
  get yellow()            { return material('yellow', 0xf2dc3c); },
  get yellowLit()         { return material('yellowLit', 0xf2dc3c, { emissive: 0xf2dc3c, emissiveIntensity: 0.5 }); },
  get road()              { return material('road', 0xc9c4ee); },
  get white()             { return material('white', 0xffffff, { roughness: 0.5 }); },
  // Supabase
  get supabaseGreen()     { return material('supabaseGreen', 0x3ecf8e, { roughness: 0.5 }); },
  get supabaseGreenDark() { return material('supabaseGreenDark', 0x249d68, { roughness: 0.6 }); },
  get supabaseGreenLit()  { return material('supabaseGreenLit', 0x3ecf8e, { emissive: 0x3ecf8e, emissiveIntensity: 0.8, roughness: 0.3 }); },
  get slate()             { return material('slate', 0x23252b, { roughness: 0.6 }); },
  get slateTop()          { return material('slateTop', 0x33363e, { roughness: 0.7 }); },
  // Alerts
  get alert()             { return material('alert', 0xff3b4e, { roughness: 0.5 }); },
  get alertLit()          { return material('alertLit', 0xff3b4e, { emissive: 0xff2238, emissiveIntensity: 0.9, roughness: 0.3 }); },
};

const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 40),
};

// `y` is the base of the object, not its center
export function box(parent, mat, w, h, d, x = 0, y = 0, z = 0, rotationY = 0) {
  const mesh = new THREE.Mesh(geometries.box, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y + h / 2, z);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function cylinder(parent, mat, radius, h, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometries.cylinder, mat);
  mesh.scale.set(radius * 2, h, radius * 2);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Flat strip on the ground from (ax, az) to (bx, bz)
export function groundLink(parent, mat, ax, az, bx, bz, width, height) {
  const dx = bx - ax, dz = bz - az;
  return box(parent, mat, Math.hypot(dx, dz), height, width, (ax + bx) / 2, 0, (az + bz) / 2, -Math.atan2(dz, dx));
}

// Red diamond with a white "!" (it sticks out on both sides so it reads from any angle)
export function warningSign(size = 1.3) {
  const group = new THREE.Group();
  const k = size / 1.3;
  box(group, materials.alertLit, 1.3 * k, 1.3 * k, 0.3 * k, 0, -0.65 * k, 0).rotation.z = Math.PI / 4;
  box(group, materials.white, 0.2 * k, 0.55 * k, 0.42 * k, 0, -0.2 * k, 0);
  box(group, materials.white, 0.2 * k, 0.2 * k, 0.42 * k, 0, -0.62 * k, 0);
  return group;
}
