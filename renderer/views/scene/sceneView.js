// three.js scene: renderer, lights, infinite grid and the orthographic camera driven by CameraViewModel.
// Other views add their objects to a layer and register per-frame callbacks with onFrame().
// Rendering goes through a bloom pass: only bright emissive surfaces (accent, warnings) glow.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CAMERA } from '../../viewmodels/cameraViewModel.js';
import { PALETTE } from './materials.js';

const GRID_SIZE = 200; // cells per side; the grid re-centers on the camera so it feels infinite
const SUN_OFFSET = new THREE.Vector3(-14, 30, 18); // from the top left: shadows fall to the right
const RIM_OFFSET = new THREE.Vector3(20, 18, -26);  // cool light from behind to outline the volumes
const BLOOM = { strength: 0.45, radius: 0.4, threshold: 0.85 };

export function createSceneView(cameraViewModel) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.background);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

  // One layer per app view; only the active one is visible. Ground, grid and lights are shared.
  const layers = { map: new THREE.Group(), git: new THREE.Group() };
  Object.values(layers).forEach((layer) => scene.add(layer));
  const setActiveLayer = (name) => Object.entries(layers).forEach(([key, layer]) => { layer.visible = key === name; });
  setActiveLayer('map');

  // Lights
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x0b0d10, 0.9));
  const rim = new THREE.DirectionalLight(0x9fb4ff, 1.1);
  scene.add(rim, rim.target);
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Ground and grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1, metalness: 0 })
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const half = GRID_SIZE / 2;
  const points = [];
  for (let i = 0; i <= GRID_SIZE; i++) {
    const p = -half + i;
    points.push(-half, 0, p, half, 0, p); // lines along X
    points.push(p, 0, -half, p, 0, half); // lines along Z
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: PALETTE.grid }));
  scene.add(grid);

  function resize() {
    const aspect = window.innerWidth / window.innerHeight;
    const h = CAMERA.viewHeight;
    Object.assign(camera, { left: (-h * aspect) / 2, right: (h * aspect) / 2, top: h / 2, bottom: -h / 2 });
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), BLOOM.strength, BLOOM.radius, BLOOM.threshold));
  composer.addPass(new OutputPass());
  resize();
  window.addEventListener('resize', resize);

  // Applies the view model to the three.js camera. Ground, grid and sun follow it (snapped to cells).
  function syncCamera() {
    const vm = cameraViewModel;
    const o = vm.offset();
    camera.position.set(vm.target.x + o.x, o.y, vm.target.z + o.z);
    camera.lookAt(vm.target.x, 0, vm.target.z);
    if (camera.zoom !== vm.zoom) {
      camera.zoom = vm.zoom;
      camera.updateProjectionMatrix();
    }
    const sx = Math.round(vm.target.x), sz = Math.round(vm.target.z);
    grid.position.set(sx, 0.005, sz);
    ground.position.set(sx, 0, sz);
    sun.target.position.set(sx, 0, sz);
    sun.position.set(sx, 0, sz).add(SUN_OFFSET);
    rim.target.position.set(sx, 0, sz);
    rim.position.set(sx, 0, sz).add(RIM_OFFSET);
  }
  syncCamera();

  // --- Screen <-> world helpers ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const projected = new THREE.Vector3();

  function setRay(clientX, clientY) {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  function groundPointAt(clientX, clientY) {
    setRay(clientX, clientY);
    return raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3());
  }

  // First `userData.pick` under the cursor among `objects`. The raycaster also hits hidden
  // objects, so a hit is skipped when any of its parents is not visible.
  function pickAt(clientX, clientY, objects) {
    setRay(clientX, clientY);
    const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
    for (const hit of raycaster.intersectObjects(objects, true)) {
      if (!shown(hit.object)) continue;
      for (let o = hit.object; o; o = o.parent) if (o.userData.pick) return o.userData.pick;
    }
    return null;
  }

  // World point -> CSS pixels
  function toScreen({ x, y, z }) {
    projected.set(x, y, z).project(camera);
    return { x: (projected.x * 0.5 + 0.5) * window.innerWidth, y: (-projected.y * 0.5 + 0.5) * window.innerHeight };
  }

  // --- Render loop ---
  const frameCallbacks = [];
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    cameraViewModel.step(dt);
    syncCamera();
    for (const callback of frameCallbacks) callback(clock.elapsedTime, dt);
    composer.render();
  });

  return {
    scene,
    layers,
    setActiveLayer,
    renderer,
    canvas: renderer.domElement,
    syncCamera,
    groundPointAt,
    pickAt,
    toScreen,
    onFrame: (callback) => frameCallbacks.push(callback),
  };
}
