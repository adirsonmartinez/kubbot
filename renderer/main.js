// Composition root: creates Models -> ViewModels -> Views and wires them together.
// Models know nothing about the screen; ViewModels hold screen state and actions (no DOM, no three.js);
// Views only draw and forward user input to ViewModels.
import { createEventBus, EVENTS } from './core/eventBus.js';
import { strings } from './i18n/es.js';
import { createWorkspaceService } from './services/workspaceService.js';
import { createAgentService } from './services/agentService.js';
import { connectMcpBridge } from './services/mcpBridge.js';

import { ProjectModel } from './models/projectModel.js';
import { SecurityModel } from './models/securityModel.js';
import { SupabaseModel } from './models/supabaseModel.js';
import { AgentModel } from './models/agentModel.js';
import { AgentConnectionModel } from './models/agentConnectionModel.js';

import { CameraViewModel } from './viewmodels/cameraViewModel.js';
import { TowerViewModel } from './viewmodels/towerViewModel.js';
import { SupabaseViewModel } from './viewmodels/supabaseViewModel.js';
import { MapViewModel } from './viewmodels/mapViewModel.js';
import { ChatViewModel } from './viewmodels/chatViewModel.js';
import { ShellViewModel } from './viewmodels/shellViewModel.js';
import { GraphViewModel } from './viewmodels/graphViewModel.js';

import { createSceneView } from './views/scene/sceneView.js';
import { createMapView } from './views/scene/mapView.js';
import { createTowerView } from './views/scene/towerView.js';
import { createSupabaseView } from './views/scene/supabaseView.js';
import { createInputController } from './views/scene/inputController.js';
import { createLabelLayer } from './views/ui/labelLayer.js';
import { createControlsView } from './views/ui/controlsView.js';
import { createPanelsView } from './views/ui/panelsView.js';
import { createChatView } from './views/ui/chatView.js';
import { createShellView } from './views/ui/shellView.js';
import { createGraphView } from './views/ui/graphView.js';
import { createAgentConnectView } from './views/ui/agentConnectView.js';
import { applyStrings } from './views/ui/domStrings.js';

// --- Models ---
const bus = createEventBus();
const workspace = createWorkspaceService();
const projectModel = new ProjectModel(workspace);
const securityModel = new SecurityModel();
const supabaseModel = new SupabaseModel();
const agentService = createAgentService();
const connection = new AgentConnectionModel(agentService);
const agentModel = new AgentModel({ workspace, projectModel, supabaseModel, connection });

// --- ViewModels ---
const cameraViewModel = new CameraViewModel();
const towerViewModel = new TowerViewModel({ securityModel, camera: cameraViewModel, bus });
const supabaseViewModel = new SupabaseViewModel({ supabaseModel, projectModel, camera: cameraViewModel, bus });
const mapViewModel = new MapViewModel({ projectModel, securityModel, camera: cameraViewModel, towerViewModel, supabaseViewModel });
const chatViewModel = new ChatViewModel({ agentModel, bus });
const shellViewModel = new ShellViewModel({ projectModel, securityModel, mapViewModel, compact: window.matchMedia('(max-width: 820px)').matches });
const graphViewModel = new GraphViewModel({ projectModel, securityModel, supabaseModel });

// --- Views ---
applyStrings();
const sceneView = createSceneView(cameraViewModel, document.getElementById('stage')); // the map lives in the IDE stage
const labels = createLabelLayer(document.getElementById('map-labels'), sceneView);
const mapView = createMapView({ sceneView, labels, mapViewModel });
const towerView = createTowerView({ sceneView, labels, towerViewModel, cameraViewModel, mapView });
const supabaseView = createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel });
sceneView.onFrame(labels.update); // last: after every view moved its anchors

createInputController({
  sceneView,
  cameraViewModel,
  mapViewModel,
  pickTargets: () => [...supabaseView.pickTargets(), ...mapView.pickTargets(), ...towerView.pickTargets()],
});
createControlsView({ cameraViewModel });
createPanelsView({ mapViewModel, towerViewModel, supabaseViewModel });
createChatView({ chatViewModel, connection });
createShellView({ shellViewModel, cameraViewModel });
createGraphView({ graphViewModel, shellViewModel, mapViewModel });
createAgentConnectView({ container: document.getElementById('agent-connect'), connection });
connectMcpBridge({ agentService, securityModel, shellViewModel });
connection.refresh();

// --- Wiring between layers ---
projectModel.store.subscribe((state, previous) => {
  if (state.session !== previous.session) bus.emit(EVENTS.projectOpened, { name: state.name ?? strings.map.defaultProjectName });
});

workspace.onChanged((paths) => {
  bus.emit(EVENTS.diskChanged, { paths });
  projectModel.scheduleReload();
});

// Public hook for the AI agent: set the traffic light of a file.
//   window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level: 'red', reason } }))
window.addEventListener('file:score', (e) => {
  const { path, level, reason } = e.detail ?? {};
  securityModel.setScore(path, level, reason);
});

// If the app already had a folder open (e.g. after reloading the window), show it
projectModel.restore();
