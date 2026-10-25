// Every icon the UI uses: our name -> Hugeicons (free, stroke rounded). Browse at hugeicons.com.

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp02Icon,
  BotIcon,
  Folder01Icon,
  Gps01Icon,
  InformationCircleIcon,
  Layers01Icon,
  MinusSignIcon,
  PinIcon,
  PlusSignIcon,
  RedoIcon,
  Search01Icon,
  Settings02Icon,
  SparklesIcon,
  UndoIcon,
  MapsLocation01Icon,
} from "@hugeicons/core-free-icons";

const ICONS = {
  arrowUp: ArrowUp02Icon,
  bot: BotIcon,
  center: Gps01Icon,
  folder: Folder01Icon,
  info: InformationCircleIcon,
  layers: Layers01Icon,
  locate: MapsLocation01Icon,
  minus: MinusSignIcon,
  pin: PinIcon,
  plus: PlusSignIcon,
  rotateLeft: UndoIcon,
  rotateRight: RedoIcon,
  search: Search01Icon,
  settings: Settings02Icon,
  sparkles: SparklesIcon,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <HugeiconsIcon icon={ICONS[name]} size={size} strokeWidth={1.75} aria-hidden />;
}
