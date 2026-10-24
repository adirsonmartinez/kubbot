// three.js scene: renderer, lights, infinite grid and the orthographic camera driven by CameraViewModel.
// Other views add their objects to `scene` and register per-frame callbacks with onFrame().
import * as THREE from 'three';
import { CAMERA } from '../../viewmodels/cameraViewModel.js';

const COLORS = { background: 0xf2f0ff, grid: 0xd9d4f7 };
const GRID_SIZE = 200; // cells per side; the grid re-centers on the camera so it feels infinite
const SUN_OFFSET = new THREE.Vector3(-14, 30, 18); // from the top left: shadows fall to the right

// `container` is where the canvas lives (the IDE stage). Defaults to the whole window, as before.
export function createSceneView(cameraViewModel, container = document.body) {
  const fullWindow = container === document.body;
  const size = () =>
    fullWindow
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: Math.max(1, container.clientWidth), height: Math.max(1, container.clientHeight) };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(size().width, size().height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.background);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b1f0, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // Ground and grid
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: COLORS.background, roughness: 1 })
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
  const grid = new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({ color: COLORS.grid }));
  scene.add(grid);

  function resize() {
    const { width, height } = size();
    const aspect = width / height;
    const h = CAMERA.viewHeight;
    Object.assign(camera, { left: (-h * aspect) / 2, right: (h * aspect) / 2, top: h / 2, bottom: -h / 2 });
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
  resize();
  if (fullWindow) window.addEventListener('resize', resize);
  else new ResizeObserver(resize).observe(container); // panels can be resized without the window changing

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
  }
  syncCamera();

  // --- Screen <-> world helpers ---
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const projected = new THREE.Vector3();

  // Pointer coordinates are relative to the viewport; the canvas may not start at (0, 0).
  function setRay(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
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

  // World point -> CSS pixels relative to the container (labels are positioned inside it)
  function toScreen({ x, y, z }) {
    projected.set(x, y, z).project(camera);
    const { width, height } = size();
    return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height };
  }

  // --- Render loop ---
  const frameCallbacks = [];
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    cameraViewModel.step(dt);
    syncCamera();
    for (const callback of frameCallbacks) callback(clock.elapsedTime, dt);
    renderer.render(scene, camera);
  });

  return {
    scene,
    renderer,
    canvas: renderer.domElement,
    syncCamera,
    groundPointAt,
    pickAt,
    toScreen,
    onFrame: (callback) => frameCallbacks.push(callback),
  };
}
