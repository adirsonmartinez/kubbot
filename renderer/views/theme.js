// How each traffic-light level looks, in the 3D scene and in HTML.
import { materials } from './scene/materials.js';

export const LEVEL_STYLE = {
  green:  { color: '#3ecf8e', material: () => materials.supabaseGreen },
  yellow: { color: '#f2dc3c', material: () => materials.yellow },
  red:    { color: '#ff3b4e', material: () => materials.alertLit },
  grey:   { color: '#b5b5c2', material: () => materials.metal },
};

// Building color by folder name; anything else rotates through neutral colors
export const FOLDER_STYLES = [
  { pattern: /^(src|app|lib|server|api|backend|frontend|packages|core)$/i, body: () => materials.indigo },
  { pattern: /^(components|ui|views|pages|screens|routes|layouts|hooks)$/i, body: () => materials.teal },
  { pattern: /^(public|assets|static|images|img|media|fonts)$/i, body: () => materials.yellow },
  { pattern: /^(supabase|db|database|prisma|migrations|sql)$/i, body: () => materials.supabaseGreen },
  { pattern: /^(test|tests|__tests__|spec|e2e|cypress)$/i, body: () => materials.metal },
  { pattern: /^(docs?|documentation)$/i, body: () => materials.lavenderDark },
  { pattern: /^\./, body: () => materials.screen }, // .github, .vscode, .husky…
];
export const FALLBACK_BODIES = [() => materials.indigoDark, () => materials.teal, () => materials.lavenderDark];
