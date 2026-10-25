// Every icon the UI uses: our name -> Hugeicons (free, stroke rounded). Browse at hugeicons.com.

import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowDown01Icon,
  ArrowUp02Icon,
  BotIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  CubeIcon,
  Delete02Icon,
  Download01Icon,
  Folder01Icon,
  Gps01Icon,
  InformationCircleIcon,
  Layers01Icon,
  MinusSignIcon,
  PinIcon,
  PlayIcon,
  PlugSocketIcon,
  PlusSignIcon,
  RedoIcon,
  RotateClockwiseIcon,
  Search01Icon,
  Settings02Icon,
  SourceCodeIcon,
  SparklesIcon,
  StopIcon,
  UndoIcon,
  MapsLocation01Icon,
} from "@hugeicons/core-free-icons";

const ICONS = {
  alert: Alert02Icon,
  arrowUp: ArrowUp02Icon,
  bot: BotIcon,
  center: Gps01Icon,
  check: CheckmarkCircle02Icon,
  chevronDown: ArrowDown01Icon,
  close: Cancel01Icon,
  code: SourceCodeIcon,
  cube: CubeIcon,
  download: Download01Icon,
  folder: Folder01Icon,
  info: InformationCircleIcon,
  layers: Layers01Icon,
  locate: MapsLocation01Icon,
  minus: MinusSignIcon,
  pin: PinIcon,
  play: PlayIcon,
  plug: PlugSocketIcon,
  plus: PlusSignIcon,
  rotateLeft: UndoIcon,
  rotateRight: RedoIcon,
  rotate: RotateClockwiseIcon,
  search: Search01Icon,
  settings: Settings02Icon,
  sparkles: SparklesIcon,
  stop: StopIcon,
  trash: Delete02Icon,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <HugeiconsIcon icon={ICONS[name]} size={size} strokeWidth={1.75} aria-hidden />;
}
