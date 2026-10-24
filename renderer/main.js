// Composition root: creates Models -> ViewModels -> Views and wires them together.
// Models know nothing about the screen; ViewModels hold screen state and actions (no DOM, no three.js);
// Views only draw and forward user input to ViewModels.
import { createEventBus, EVENTS } from './core/eventBus.js';
import { strings } from './i18n/es.js';
import { createWorkspaceService } from './services/workspaceService.js';

import { ProjectModel } from './models/projectModel.js';
import { SecurityModel } from './models/securityModel.js';
import { SupabaseModel } from './models/supabaseModel.js';
import { AgentModel } from './models/agentModel.js';
import { GitModel } from './models/gitModel.js';

import { CameraViewModel } from './viewmodels/cameraViewModel.js';
import { SupabaseViewModel } from './viewmodels/supabaseViewModel.js';
import { MapViewModel } from './viewmodels/mapViewModel.js';
import { ChatViewModel } from './viewmodels/chatViewModel.js';
import { GitViewModel } from './viewmodels/gitViewModel.js';
import { AppViewModel } from './viewmodels/appViewModel.js';

import { createSceneView } from './views/scene/sceneView.js';
import { createMapView } from './views/scene/mapView.js';
import { createSupabaseView } from './views/scene/supabaseView.js';
import { createInputController } from './views/scene/inputController.js';
import { createGitView } from './views/scene/gitView.js';
import { createViewSwitcherView } from './views/ui/viewSwitcherView.js';
import { createHudView } from './views/ui/hudView.js';
import { createLabelLayer } from './views/ui/labelLayer.js';
import { createControlsView } from './views/ui/controlsView.js';
import { createPanelsView } from './views/ui/panelsView.js';
import { createChatView } from './views/ui/chatView.js';
import { applyStrings } from './views/ui/domStrings.js';

// --- Models ---
const bus = createEventBus();
const workspace = createWorkspaceService();
const projectModel = new ProjectModel(workspace);
const securityModel = new SecurityModel();
const supabaseModel = new SupabaseModel();
const agentModel = new AgentModel({ workspace, projectModel, supabaseModel });
const gitModel = new GitModel(workspace);

// --- ViewModels ---
const cameraViewModel = new CameraViewModel();
const supabaseViewModel = new SupabaseViewModel({ supabaseModel, projectModel, camera: cameraViewModel, bus });
const mapViewModel = new MapViewModel({ projectModel, securityModel, camera: cameraViewModel, supabaseViewModel, bus });
const chatViewModel = new ChatViewModel({ agentModel, bus });
const gitViewModel = new GitViewModel({ gitModel, camera: cameraViewModel, bus });
const appViewModel = new AppViewModel({ camera: cameraViewModel, gitModel, gitViewModel });

// --- Views ---
applyStrings();
const sceneView = createSceneView(cameraViewModel);
const labels = createLabelLayer(document.getElementById('map-labels'), sceneView);
const mapView = createMapView({ sceneView, labels, mapViewModel });
const supabaseView = createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel });
const gitView = createGitView({ sceneView, labels, gitViewModel });
sceneView.onFrame(labels.update); // last: after every view moved its anchors

// Clicks and Esc go to the view on screen
const projectOpen = () => mapViewModel.store.state.status === 'ready';
const pickers = {
  map: () => ({
    targets: [...supabaseView.pickTargets(), ...mapView.pickTargets()],
    handle: (pick) => mapViewModel.handlePick(pick),
  }),
  git: () => ({ targets: gitView.pickTargets(), handle: (pick) => gitViewModel.handlePick(pick) }),
};
createInputController({
  sceneView,
  cameraViewModel,
  picker: () => (projectOpen() ? pickers[appViewModel.view]() : null),
  onEscape: () => (appViewModel.view === 'git' ? gitViewModel.escape() : mapViewModel.escape()),
  onToggleView: () => appViewModel.toggle(),
});
createControlsView({ cameraViewModel });
createViewSwitcherView({ appViewModel, sceneView, labels });
createPanelsView({ appViewModel, mapViewModel, supabaseViewModel, gitViewModel });
createChatView({ chatViewModel });
createHudView({ appViewModel, mapViewModel, gitViewModel });

// --- Wiring between layers ---
projectModel.store.subscribe((state, previous) => {
  if (state.session === previous.session) return;
  bus.emit(EVENTS.projectOpened, { name: state.name ?? strings.map.defaultProjectName });
  // A new project: fresh git history and cameras
  appViewModel.resetCameras();
  gitModel.clear();
  gitModel.load();
  if (appViewModel.view === 'git') gitViewModel.centerOnHead();
});

workspace.onChanged((paths) => {
  bus.emit(EVENTS.diskChanged, { paths });
  projectModel.scheduleReload();
  gitModel.scheduleReload();
});

// .git is not watched (too noisy), so commits made in a terminal show up when the window regains focus
window.addEventListener('focus', () => { if (projectOpen()) gitModel.scheduleReload(); });

// Public hook for the AI agent: set the traffic light of a file.
//   window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level: 'red', reason } }))
window.addEventListener('file:score', (e) => {
  const { path, level, reason } = e.detail ?? {};
  securityModel.setScore(path, level, reason);
});

// If the app already had a folder open (e.g. after reloading the window), show it
projectModel.restore();
