// Icons from Hugeicons (free set, MIT, https://hugeicons.com), loaded straight from node_modules through
// the import map ("@hugeicons/") and vendored by scripts/build-web.js. Each icon is data
// ([tag, attrs] pairs); icon() turns it into an <svg>. Only the icons named here are shipped.
//
// Use: icon('sparkles') -> SVGElement · iconHtml('sparkles') -> string · applyIcons(root) fills every
// <span data-icon="name"> (static HTML and Markdown callouts).
import AiBrain01Icon from '@hugeicons/AiBrain01Icon.js';
import Alert02Icon from '@hugeicons/Alert02Icon.js';
import AlertDiamondIcon from '@hugeicons/AlertDiamondIcon.js';
import ArrowRight01Icon from '@hugeicons/ArrowRight01Icon.js';
import ArrowUp02Icon from '@hugeicons/ArrowUp02Icon.js';
import BubbleChatIcon from '@hugeicons/BubbleChatIcon.js';
import Building03Icon from '@hugeicons/Building03Icon.js';
import Cancel01Icon from '@hugeicons/Cancel01Icon.js';
import CenterFocusIcon from '@hugeicons/CenterFocusIcon.js';
import CheckmarkCircle02Icon from '@hugeicons/CheckmarkCircle02Icon.js';
import Clock01Icon from '@hugeicons/Clock01Icon.js';
import DashboardSquare01Icon from '@hugeicons/DashboardSquare01Icon.js';
import File01Icon from '@hugeicons/File01Icon.js';
import FileSearchIcon from '@hugeicons/FileSearchIcon.js';
import Folder01Icon from '@hugeicons/Folder01Icon.js';
import FolderOpenIcon from '@hugeicons/FolderOpenIcon.js';
import GitBranchIcon from '@hugeicons/GitBranchIcon.js';
import HierarchySquare02Icon from '@hugeicons/HierarchySquare02Icon.js';
import Idea01Icon from '@hugeicons/Idea01Icon.js';
import InformationCircleIcon from '@hugeicons/InformationCircleIcon.js';
import Layers01Icon from '@hugeicons/Layers01Icon.js';
import Loading03Icon from '@hugeicons/Loading03Icon.js';
import MagicWand01Icon from '@hugeicons/MagicWand01Icon.js';
import MapsLocation01Icon from '@hugeicons/MapsLocation01Icon.js';
import MessageQuestionIcon from '@hugeicons/MessageQuestionIcon.js';
import MinusSignIcon from '@hugeicons/MinusSignIcon.js';
import PinIcon from '@hugeicons/PinIcon.js';
import PlusSignIcon from '@hugeicons/PlusSignIcon.js';
import DragDropVerticalIcon from '@hugeicons/DragDropVerticalIcon.js';
import Search01Icon from '@hugeicons/Search01Icon.js';
import RoboticIcon from '@hugeicons/RoboticIcon.js';
import RotateLeft01Icon from '@hugeicons/RotateLeft01Icon.js';
import RotateRight01Icon from '@hugeicons/RotateRight01Icon.js';
import SecurityCheckIcon from '@hugeicons/SecurityCheckIcon.js';
import SecurityWarningIcon from '@hugeicons/SecurityWarningIcon.js';
import SidebarLeftIcon from '@hugeicons/SidebarLeftIcon.js';
import SourceCodeIcon from '@hugeicons/SourceCodeIcon.js';
import SparklesIcon from '@hugeicons/SparklesIcon.js';
import Task01Icon from '@hugeicons/Task01Icon.js';
import UserGroupIcon from '@hugeicons/UserGroupIcon.js';
import Wrench01Icon from '@hugeicons/Wrench01Icon.js';

export const ICONS = {
  // app shell
  explorer: Folder01Icon,
  risks: Alert02Icon,
  repairs: Wrench01Icon,
  agent: RoboticIcon,
  map: Building03Icon,
  git: GitBranchIcon,
  project: DashboardSquare01Icon,
  graph: HierarchySquare02Icon,
  sidebar: SidebarLeftIcon,
  zoomIn: PlusSignIcon,
  zoomOut: MinusSignIcon,
  rotateLeft: RotateLeft01Icon,
  rotateRight: RotateRight01Icon,
  reset: CenterFocusIcon,
  openFolder: FolderOpenIcon,
  search: Search01Icon,
  drag: DragDropVerticalIcon,
  // chat
  bot: AiBrain01Icon,
  chat: BubbleChatIcon,
  pin: PinIcon,
  minimize: MinusSignIcon,
  expand: PlusSignIcon,
  plus: PlusSignIcon,
  send: ArrowUp02Icon,
  close: Cancel01Icon,
  sparkles: SparklesIcon,
  vibe: MagicWand01Icon,
  dev: SourceCodeIcon,
  arrow: ArrowRight01Icon,
  ask: MessageQuestionIcon,
  clock: Clock01Icon,
  loading: Loading03Icon,
  subagent: UserGroupIcon,
  // answer callouts and cards
  danger: AlertDiamondIcon,
  ok: CheckmarkCircle02Icon,
  idea: Idea01Icon,
  step: Task01Icon,
  info: InformationCircleIcon,
  file: File01Icon,
  folder: Folder01Icon,
  locate: MapsLocation01Icon,
  audit: FileSearchIcon,
  shieldOk: SecurityCheckIcon,
  shieldWarn: SecurityWarningIcon,
  layers: Layers01Icon,
};

// The agent's tools, each with its icon (run card steps)
export const TOOL_ICONS = {
  get_project: 'layers',
  list_risks: 'shieldWarn',
  read_file: 'audit',
  write_file: 'repairs',
  set_file_score: 'shieldOk',
  show_folder: 'locate',
};

const SVG = 'http://www.w3.org/2000/svg';
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Strokes take the color from the <svg> (so CSS `stroke`/`color` on it still works); widths stay Hugeicons'
function attrsOf(attrs) {
  return Object.entries(attrs).filter(([k, v]) => k !== 'key' && !(k === 'stroke' && v === 'currentColor'));
}

export function icon(name, { size = 18, className = '' } = {}) {
  const data = ICONS[name] ?? ICONS.info;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `hi${className ? ` ${className}` : ''}`);
  for (const [tag, attrs] of data) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of attrsOf(attrs)) node.setAttribute(kebab(k), String(v));
    svg.appendChild(node);
  }
  return svg;
}

export const iconHtml = (name, options) => icon(name, options).outerHTML;

// Fills <span data-icon="name" data-size="16"> placeholders (once each)
export function applyIcons(root = document) {
  for (const slot of root.querySelectorAll('[data-icon]:not([data-icon-done])')) {
    slot.replaceChildren(icon(slot.dataset.icon, { size: Number(slot.dataset.size) || 18 }));
    slot.setAttribute('data-icon-done', '');
  }
}
