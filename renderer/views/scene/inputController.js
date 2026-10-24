// Mouse and keyboard on the map. Left drag: pan (the grabbed ground point stays under the cursor).
// Right drag or Shift + drag: rotate. Wheel: zoom toward the cursor. Click: pick an object.
// G switches between the map and the git view; Esc closes whatever is open in the active view.
const CLICK_TOLERANCE_PX = 6;
const ROTATE_SPEED = 0.008;

// picker(): the active view's { targets: Object3D[], handle(pick) }, or null when nothing is clickable
export function createInputController({ sceneView, cameraViewModel: camera, picker, onEscape, onToggleView }) {
  const canvas = sceneView.canvas;
  let grabPoint = null;
  let rotatingFromX = null;
  let downAt = null;

  const pickAt = (x, y) => {
    const active = picker();
    return active ? sceneView.pickAt(x, y, active.targets) : null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    downAt = { x: e.clientX, y: e.clientY, button: e.button };
    camera.cancelFlight(); // dragging cancels any animated camera flight
    if (e.button === 2 || e.shiftKey) rotatingFromX = e.clientX;
    else grabPoint = sceneView.groundPointAt(e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointermove', (e) => {
    if (rotatingFromX !== null) {
      camera.rotateBy(-(e.clientX - rotatingFromX) * ROTATE_SPEED);
      rotatingFromX = e.clientX;
      sceneView.syncCamera();
      return;
    }
    if (!grabPoint) {
      canvas.style.cursor = e.pointerType === 'mouse' && pickAt(e.clientX, e.clientY) ? 'pointer' : '';
      return;
    }
    const now = sceneView.groundPointAt(e.clientX, e.clientY);
    if (!now) return;
    camera.panBy(grabPoint.x - now.x, grabPoint.z - now.z);
    sceneView.syncCamera();
  });

  function endDrag(e) {
    grabPoint = null;
    rotatingFromX = null;
    canvas.classList.remove('dragging');
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  canvas.addEventListener('pointerup', (e) => {
    const wasClick = downAt && downAt.button === 0 && !e.shiftKey &&
      Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < CLICK_TOLERANCE_PX;
    downAt = null;
    endDrag(e);
    if (!wasClick) return;
    const pick = pickAt(e.clientX, e.clientY);
    if (pick) picker()?.handle(pick);
  });
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = sceneView.groundPointAt(e.clientX, e.clientY);
    camera.setZoomNow(camera.zoom * Math.exp(-e.deltaY * 0.001));
    sceneView.syncCamera();
    const after = sceneView.groundPointAt(e.clientX, e.clientY);
    if (before && after) camera.panBy(before.x - after.x, before.z - after.z);
    sceneView.syncCamera();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return onEscape();
    if (e.target.closest?.('input, textarea')) return; // no shortcuts while typing in the chat
    const key = e.key.toLowerCase();
    if (key === 'g') onToggleView();
    if (key === 'q') camera.rotateQuarter(1);
    if (key === 'e') camera.rotateQuarter(-1);
  });
}
