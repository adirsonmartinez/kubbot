// "Mapa | Git" switch (top center). Also activates the matching 3D layer and label layer.
export function createViewSwitcherView({ appViewModel, sceneView, labels }) {
  const buttons = [...document.querySelectorAll('#view-switch [data-view]')];
  buttons.forEach((button) => button.addEventListener('click', () => appViewModel.setView(button.dataset.view)));

  appViewModel.store.subscribe(({ view }) => {
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
    sceneView.setActiveLayer(view);
    labels.setActiveLayer(view);
  }, { immediate: true });
}
