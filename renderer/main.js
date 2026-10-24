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
import { ModeModel } from './models/modeModel.js';
import { RepairHistoryModel } from './models/repairHistoryModel.js';

import { CameraViewModel } from './viewmodels/cameraViewModel.js';
import { TowerViewModel } from './viewmodels/towerViewModel.js';
import { SupabaseViewModel } from './viewmodels/supabaseViewModel.js';
import { MapViewModel } from './viewmodels/mapViewModel.js';
import { ChatViewModel } from './viewmodels/chatViewModel.js';
import { ShellViewModel } from './viewmodels/shellViewModel.js';
import { GraphViewModel } from './viewmodels/graphViewModel.js';
import { RepairViewModel } from './viewmodels/repairViewModel.js';

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
import { createAgentPickerView } from './views/ui/agentPickerView.js';
import { attachMenu, chatMenuItems } from './views/ui/chatMenuView.js';
import { createCracksCardView } from './views/ui/cracksCardView.js';
import { createCrackMenuView } from './views/ui/crackMenuView.js';
import { createRepairPanelView } from './views/ui/repairPanelView.js';
import { createHoverCardView } from './views/ui/hoverCardView.js';
import { createRemiView } from './views/scene/remiView.js';
import { remiJump } from './views/ui/remiJump.js';
import { applyStrings } from './views/ui/domStrings.js';

// --- Models ---
const bus = createEventBus();
const workspace = createWorkspaceService();
const projectModel = new ProjectModel(workspace);
const securityModel = new SecurityModel();
const supabaseModel = new SupabaseModel();
const agentService = createAgentService();
const connection = new AgentConnectionModel(agentService);
const modeModel = new ModeModel();
const repairHistory = new RepairHistoryModel();
const agentModel = new AgentModel({ workspace, projectModel, supabaseModel, connection, modeModel });

// --- ViewModels ---
const cameraViewModel = new CameraViewModel();
const towerViewModel = new TowerViewModel({ securityModel, camera: cameraViewModel, bus });
const supabaseViewModel = new SupabaseViewModel({ supabaseModel, projectModel, camera: cameraViewModel, bus });
const mapViewModel = new MapViewModel({ projectModel, securityModel, camera: cameraViewModel, towerViewModel, supabaseViewModel });
const shellViewModel = new ShellViewModel({ projectModel, securityModel, mapViewModel, compact: window.matchMedia('(max-width: 820px)').matches });
const graphViewModel = new GraphViewModel({ projectModel, securityModel, supabaseModel });
const repairViewModel = new RepairViewModel({ securityModel, mapViewModel, cameraViewModel, towerViewModel, connection, history: repairHistory, agentService, bus });

// App actions shared by the chat, the menus and the sidebar
const stage = document.getElementById('stage');
const actions = {
  // Remi hops from the button to the map, then walks to the building
  repair(path, from = null) {
    shellViewModel.setStage('map');
    if (repairViewModel.busy || !from) return repairViewModel.start(path);
    remiJump(from, stage).then(() => repairViewModel.start(path));
  },
  repairWorst(from = null) {
    const worst = shellViewModel.store.state.risks.find((f) => f.level === 'red' || f.by !== 'remi');
    if (!worst) return chatViewModel.sayFromMap({ text: strings.repair.nothing });
    actions.repair(worst.path, from);
  },
  showRisks: () => shellViewModel.store.state.side === 'risks' && shellViewModel.store.state.sidebarOpen || shellViewModel.setSide('risks'),
  showGraph: () => shellViewModel.setStage('graph'),
  showProject: () => shellViewModel.setStage('project'),
  // Send a file to the chat so the agent checks whether its risk is real
  audit(path, reason) {
    if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
    if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
    chatViewModel.send(strings.chat.auditPrompt(path, reason));
  },
  showConnect: () => (shellViewModel.store.state.side === 'agent' && shellViewModel.store.state.sidebarOpen) || shellViewModel.setSide('agent'),
  showRepairs: () => (shellViewModel.store.state.side === 'repairs' && shellViewModel.store.state.sidebarOpen) || shellViewModel.setSide('repairs'),
};
const chatViewModel = new ChatViewModel({ agentModel, bus, actions, connection });

// --- Views ---
applyStrings();
const sceneView = createSceneView(cameraViewModel, document.getElementById('stage')); // the map lives in the IDE stage
const labels = createLabelLayer(document.getElementById('map-labels'), sceneView);
const mapView = createMapView({ sceneView, labels, mapViewModel, modeModel });
const towerView = createTowerView({ sceneView, labels, towerViewModel, cameraViewModel, mapView });
const supabaseView = createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel });
createRemiView({ sceneView, labels, repairViewModel });
sceneView.onFrame(labels.update); // last: after every view moved its anchors
const crackMenu = createCrackMenuView({ menu: document.getElementById('crack-menu'), stage, shellViewModel, mapViewModel, modeModel, actions });
const hoverCard = createHoverCardView({ card: document.getElementById('hover-card'), stage, mapViewModel, modeModel });

createInputController({
  sceneView,
  cameraViewModel,
  mapViewModel,
  pickTargets: () => [...supabaseView.pickTargets(), ...mapView.pickTargets(), ...towerView.pickTargets()],
  onHover: (pick, x, y) => hoverCard.show(pick, x, y),
  onCrack: (pick, x, y) => crackMenu.open(pick, x, y),
});
createControlsView({ cameraViewModel });
createPanelsView({ mapViewModel, towerViewModel, supabaseViewModel });
createChatView({ chatViewModel, connection });
createShellView({ shellViewModel, cameraViewModel, modeModel, repairViewModel, repairHistory, actions });
createRepairPanelView({ container: document.getElementById('remi-layer'), repairViewModel, modeModel, actions });
createAgentPickerView({ container: document.getElementById('agent-picker'), connection, onMore: actions.showConnect });
createCracksCardView({
  container: document.getElementById('cracks-card'),
  shellViewModel,
  repairHistory,
  onRepair: (path, button) => actions.repair(path, button),
  onSeeAll: actions.showRisks,
});

// Chat options: the "+" in the composer, and the floating button when the chat is minimized or closed
const $id = (id) => document.getElementById(id);
const openChat = () => {
  if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
  if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
};
attachMenu($id('chat-more'), $id('chat-more-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel }));
attachMenu($id('chat-launcher-button'), $id('chat-launcher-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel, openChat }));
createGraphView({ graphViewModel, shellViewModel, mapViewModel });
createAgentConnectView({ container: document.getElementById('agent-connect'), connection });
connectMcpBridge({ agentService, securityModel, shellViewModel });
connection.refresh();

// --- Wiring between layers ---
projectModel.store.subscribe((state, previous) => {
  if (state.session !== previous.session) {
    repairViewModel.reset(); // nothing from the previous project keeps running
    repairHistory.load(state.name ?? strings.map.defaultProjectName); // each project keeps its own history
    bus.emit(EVENTS.projectOpened, { name: state.name ?? strings.map.defaultProjectName });
  }
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
