// Zoom and rotate buttons (bottom left)
const ZOOM_STEP = 1.3;

export function createControlsView({ cameraViewModel: camera }) {
  const on = (id, handler) => document.getElementById(id).addEventListener('click', handler);
  on('zoom-in', () => camera.zoomBy(ZOOM_STEP));
  on('zoom-out', () => camera.zoomBy(1 / ZOOM_STEP));
  on('rotate-left', () => camera.rotateQuarter(1));
  on('rotate-right', () => camera.rotateQuarter(-1));
  on('reset-view', () => camera.reset());
}
