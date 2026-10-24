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
import { GitModel } from './models/gitModel.js';
import { AgentConnectionModel } from './models/agentConnectionModel.js';
import { ModeModel } from './models/modeModel.js';
import { RepairHistoryModel } from './models/repairHistoryModel.js';

import { CameraViewModel } from './viewmodels/cameraViewModel.js';
import { SupabaseViewModel } from './viewmodels/supabaseViewModel.js';
import { MapViewModel } from './viewmodels/mapViewModel.js';
import { ChatViewModel } from './viewmodels/chatViewModel.js';
import { GitViewModel } from './viewmodels/gitViewModel.js';
import { AppViewModel } from './viewmodels/appViewModel.js';
import { ShellViewModel } from './viewmodels/shellViewModel.js';
import { GraphViewModel } from './viewmodels/graphViewModel.js';
import { RepairViewModel } from './viewmodels/repairViewModel.js';

import { createSceneView } from './views/scene/sceneView.js';
import { createMapView } from './views/scene/mapView.js';
import { createSupabaseView } from './views/scene/supabaseView.js';
import { createInputController } from './views/scene/inputController.js';
import { createGitView } from './views/scene/gitView.js';
import { createRemiView } from './views/scene/remiView.js';
import { createHudView } from './views/ui/hudView.js';
import { createLabelLayer } from './views/ui/labelLayer.js';
import { createControlsView } from './views/ui/controlsView.js';
import { createPanelsView } from './views/ui/panelsView.js';
import { createChatView } from './views/ui/chatView.js';
import { createShellView } from './views/ui/shellView.js';
import { createGraphView } from './views/ui/graphView.js';
import { createAgentConnectView } from './views/ui/agentConnectView.js';
import { createAgentPickerView } from './views/ui/agentPickerView.js';
import { attachMenu, chatMenuItems } from './views/ui/chatMenuView.js';
import { createIconBarView } from './views/ui/iconBarView.js';
import { makeFloating } from './views/ui/floater.js';
import { makeDraggable } from './views/ui/draggable.js';
import { createRepairPanelView } from './views/ui/repairPanelView.js';
import { createHoverCardView } from './views/ui/hoverCardView.js';
import { remiJump } from './views/ui/remiJump.js';
import { applyStrings } from './views/ui/domStrings.js';

// --- Models ---
const bus = createEventBus();
const workspace = createWorkspaceService();
const projectModel = new ProjectModel(workspace);
const securityModel = new SecurityModel();
const supabaseModel = new SupabaseModel();
const gitModel = new GitModel(workspace);
const agentService = createAgentService();
const connection = new AgentConnectionModel(agentService);
const modeModel = new ModeModel();
const repairHistory = new RepairHistoryModel();
const agentModel = new AgentModel({ workspace, projectModel, supabaseModel, connection, modeModel });

// --- ViewModels ---
const cameraViewModel = new CameraViewModel();
const supabaseViewModel = new SupabaseViewModel({ supabaseModel, projectModel, camera: cameraViewModel, bus });
const mapViewModel = new MapViewModel({ projectModel, securityModel, camera: cameraViewModel, supabaseViewModel, bus });
const gitViewModel = new GitViewModel({ gitModel, camera: cameraViewModel, bus });
const appViewModel = new AppViewModel({ camera: cameraViewModel, gitModel, gitViewModel });
const shellViewModel = new ShellViewModel({ projectModel, securityModel, mapViewModel, compact: window.matchMedia('(max-width: 820px)').matches });
const graphViewModel = new GraphViewModel({ projectModel, securityModel, supabaseModel });
const repairViewModel = new RepairViewModel({ securityModel, mapViewModel, cameraViewModel, connection, history: repairHistory, agentService, bus });

// App actions shared by the chat, the menus and the sidebar
const stage = document.getElementById('stage');
const actions = {
  // Remi hops from the button to the map, then walks to the file's folder
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

// The stage tab drives which 3D view is on screen: the git tab shows the branches, the rest the map
shellViewModel.store.subscribe(({ stage: tab }) => appViewModel.setView(tab === 'git' ? 'git' : 'map'), { immediate: true });

// --- Views ---
applyStrings();
const sceneView = createSceneView(cameraViewModel, stage); // the map lives in the IDE stage
const labels = createLabelLayer(document.getElementById('map-labels'), sceneView);
const mapView = createMapView({ sceneView, labels, mapViewModel, modeModel });
const supabaseView = createSupabaseView({ sceneView, labels, supabaseViewModel, supabaseModel });
const gitView = createGitView({ sceneView, labels, gitViewModel });
createRemiView({ sceneView, labels, repairViewModel });
sceneView.onFrame(labels.update); // last: after every view moved its anchors
appViewModel.store.subscribe(({ view }) => {
  sceneView.setActiveLayer(view);
  labels.setActiveLayer(view);
}, { immediate: true });
const hoverCard = createHoverCardView({ card: document.getElementById('hover-card'), stage, mapViewModel, modeModel });

// Clicks, hover and Esc go to the view on screen
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
  onToggleView: () => shellViewModel.setStage(appViewModel.view === 'git' ? 'map' : 'git'),
  onHover: (pick, x, y) => hoverCard.show(appViewModel.view === 'map' ? pick : null, x, y),
});
createControlsView({ cameraViewModel });
createPanelsView({ appViewModel, mapViewModel, supabaseViewModel, gitViewModel });
createChatView({ chatViewModel, connection });
createHudView({ appViewModel, mapViewModel, gitViewModel, onShowRisks: () => actions.showRisks() });
createShellView({ shellViewModel, cameraViewModel, modeModel, repairViewModel, repairHistory, actions });
createRepairPanelView({ container: document.getElementById('remi-layer'), repairViewModel, modeModel, actions });
createAgentPickerView({ container: document.getElementById('agent-picker'), connection, onMore: actions.showConnect });
createIconBarView({ bar: document.getElementById('stage-tabs') });
// The side panel and the chat can be dragged by their header (double click: back in place)
const workspaceEl = document.getElementById('workspace');
makeDraggable({ el: document.getElementById('sidebar'), handle: document.querySelector('#sidebar .card-head'), key: 'sidebar', area: workspaceEl });
makeDraggable({ el: document.getElementById('chat'), handle: document.querySelector('#chat .chat-head'), key: 'chat', area: workspaceEl });
// Cards on the map can be dragged anywhere and minimized
for (const [id, title] of [['hud', strings.floater.hud]]) {
  makeFloating({ el: document.getElementById(id), key: id, stage, title, labels: strings.floater });
}

// Chat options: the "+" in the composer, and the floating button when the chat is minimized or closed
const $id = (id) => document.getElementById(id);
const openChat = () => {
  if (!shellViewModel.store.state.chatOpen) shellViewModel.toggleChat();
  if (chatViewModel.store.state.minimized) chatViewModel.toggleMinimized();
};
attachMenu($id('chat-more'), $id('chat-more-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel }));
attachMenu($id('chat-launcher-button'), $id('chat-launcher-menu'), () => chatMenuItems({ actions, modeModel, chatViewModel, openChat }));
createGraphView({ graphViewModel, shellViewModel, mapViewModel });
createAgentConnectView({ container: document.getElementById('agent-connect'), connection, modeModel });
connectMcpBridge({ agentService, securityModel, shellViewModel });
connection.refresh();

// --- Wiring between layers ---
projectModel.store.subscribe((state, previous) => {
  if (state.session === previous.session) return;
  repairViewModel.reset(); // nothing from the previous project keeps running
  repairHistory.load(state.name ?? strings.map.defaultProjectName); // each project keeps its own history
  bus.emit(EVENTS.projectOpened, { name: state.name ?? strings.map.defaultProjectName });
  // Fresh git history and cameras for the new project
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
