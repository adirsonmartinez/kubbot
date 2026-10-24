// The welcome robot on the map of a new, empty project (MapViewModel.welcome): it hovers over the plaza,
// waves and asks, in a bubble, what the person wants to build. It leaves with the first file.
import * as THREE from 'three';
import { buildRobot } from './builders/robotBuilder.js';
import { strings } from '../../i18n/es.js';

const SPOT = { x: 1.1, z: 1.1 }; // front corner of the plaza, so the bubble clears the project's label
const BASE_Y = 0.6;              // hovering just above the plaza
const POP_SPEED = 2.4;

export function createRobotView({ sceneView, labels, mapViewModel }) {
  const robot = buildRobot();
  robot.root.position.set(SPOT.x, BASE_Y, SPOT.z);
  robot.root.rotation.y = Math.PI / 4; // faces the camera
  robot.root.visible = false;
  sceneView.layers.map.add(robot.root);

  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12, transparent: true, opacity: 0.35 }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(SPOT.x, 0.3, SPOT.z);
  shadow.visible = false;
  sceneView.layers.map.add(shadow);

  const bubble = labels.add({
    html: `<strong>${strings.map.welcome.title}</strong><span>${strings.map.welcome.question}</span>`,
    anchor: { x: SPOT.x, y: BASE_Y + 3.7, z: SPOT.z },
    className: 'robot-bubble',
    hidden: true,
  });

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let shown = 0; // 0..1 pop-in
  let clock = 0;

  mapViewModel.store.subscribe(({ welcome }) => {
    if (welcome && !robot.root.visible) shown = still ? 1 : 0;
    robot.root.visible = shadow.visible = welcome;
    bubble.el.hidden = !welcome;
  }, { immediate: true });

  sceneView.onFrame((_t, dt) => {
    if (!robot.root.visible) return;
    clock += dt;
    shown = Math.min(shown + dt * POP_SPEED, 1);
    const pop = 1 - (1 - shown) ** 3;
    const a = still ? 0 : 1;

    robot.root.scale.setScalar(1.25 * Math.max(pop, 0.001));
    robot.body.position.y = Math.sin(clock * 2) * 0.08 * a;            // hover
    robot.arms[1].rotation.z = 2.5 + Math.sin(clock * 6) * 0.35 * a;    // wave, arm up
    robot.arms[0].rotation.x = Math.sin(clock * 2) * 0.08 * a;
    robot.head.rotation.z = Math.sin(clock * 1.5) * 0.08 * a;           // curious tilt
    const blink = !still && clock % 3.2 < 0.12;                         // blink every few seconds
    robot.eyes.forEach((eye) => { eye.scale.y = blink ? 0.02 : 0.12; });
    bubble.el.style.opacity = pop;
  });
}
