// What each part of a project is, so anyone can tell what lives in a folder: tags (Interfaz, Datos…)
// and, for "vibe" mode, a friendly name. Decided by folder and file names only (no file is read).
import { baseName } from './fileTree.js';

export const TAGS = ['Interfaz', '3D', 'Lógica', 'Datos', 'Servidor', 'Escritorio', 'Agente', 'Seguridad', 'Pruebas', 'Documentación', 'Configuración', 'Recursos'];

// Color of each tag (readable on the dark shell and on the light map)
export const TAG_COLOR = {
  Interfaz: '#f5c542',
  '3D': '#6aa8ff',
  Lógica: '#8b83ff',
  Datos: '#3ddc97',
  Servidor: '#ffab40',
  Escritorio: '#7dd3fc',
  Agente: '#c792ea',
  Seguridad: '#ff5a6a',
  Pruebas: '#86efac',
  Documentación: '#a3a3a3',
  Configuración: '#94a3b8',
  Recursos: '#f0abfc',
};

// Folder name -> tags. First match wins for the friendly name; every match adds its tags.
const FOLDER_RULES = [
  { re: /^(renderer|frontend|client|web|app)$/i, tags: ['Interfaz'], name: 'Lo que ves en pantalla', summary: 'Todo lo que aparece en la ventana: mapa, paneles, chat y estilos.' },
  { re: /^(components|ui|views|pages|screens|layouts|widgets)$/i, tags: ['Interfaz'], name: 'Piezas de la pantalla', summary: 'Botones, paneles y vistas que dibujan lo que ves.' },
  { re: /^(styles|css|theme|themes)$/i, tags: ['Interfaz'], name: 'Colores y estilos', summary: 'Cómo se ve todo: colores, tamaños, efectos de vidrio y animaciones.' },
  { re: /^(scene|three|3d|webgl|builders|meshes)$/i, tags: ['3D'], name: 'Escena 3D', summary: 'Los edificios, las grietas, Remi y la cámara del mapa.' },
  { re: /^viewmodels$/i, tags: ['Lógica'], name: 'Estado de cada pantalla', summary: 'Qué muestra cada parte y qué pasa al hacer clic, sin dibujar nada.' },
  { re: /^services$/i, tags: ['Lógica', 'Agente'], name: 'Conexiones', summary: 'Habla con el disco, la app de escritorio y tu agente de IA.' },
  { re: /^(core|utils|helpers|hooks|lib|src|packages)$/i, tags: ['Lógica'], name: 'Cómo funciona por dentro', summary: 'Piezas básicas que usa el resto del código.' },
  { re: /^(models|store|state|data|schema|schemas)$/i, tags: ['Datos'], name: 'Datos que recuerda la app', summary: 'El proyecto abierto, el semáforo de cada archivo y lo que eligió la persona.' },
  { re: /^(supabase|db|database|prisma|migrations|sql)$/i, tags: ['Datos', 'Seguridad'], name: 'Base de datos', summary: 'Tablas, migraciones y reglas de quién puede leer qué.' },
  { re: /^(api|server|backend|routes|functions|edge-functions)$/i, tags: ['Servidor'], name: 'Servidor', summary: 'Lo que corre fuera de la pantalla y responde a la app.' },
  { re: /^(electron|desktop|main|tauri)$/i, tags: ['Escritorio'], name: 'App de escritorio', summary: 'La ventana, los permisos al disco, el servidor local y los agentes con tu suscripción.' },
  { re: /^(agent|agents|ai|llm|mcp|chat|prompts|skills)$/i, tags: ['Agente'], name: 'Inteligencia artificial', summary: 'Instrucciones y conexiones del agente de IA.' },
  { re: /^(auth|security|crypto|middleware|policies)$/i, tags: ['Seguridad'], name: 'Seguridad y accesos', summary: 'Quién puede entrar y qué puede hacer.' },
  { re: /^(tests?|__tests__|spec|specs|e2e|cypress)$/i, tags: ['Pruebas'], name: 'Pruebas automáticas', summary: 'Revisiones que se corren solas para que nada se rompa.' },
  { re: /^(docs?|documentation|wiki)$/i, tags: ['Documentación'], name: 'Documentación', summary: 'Explicaciones, decisiones e instrucciones del proyecto.' },
  { re: /^(\.github|\.gitlab|\.circleci|ci|scripts|\.vscode|\.husky|config)$/i, tags: ['Configuración'], name: 'Automatizaciones y ajustes', summary: 'Lo que se ejecuta solo al subir cambios o publicar versiones.' },
  { re: /^(public|assets|static|images|img|media|fonts|icons)$/i, tags: ['Recursos'], name: 'Imágenes y archivos', summary: 'Logos, imágenes, fuentes y archivos que se sirven tal cual.' },
  { re: /^(i18n|locales|lang|translations)$/i, tags: ['Interfaz'], name: 'Textos e idiomas', summary: 'Todas las frases que lee la persona, en un solo lugar.' },
];

// File name -> tags
const FILE_RULES = [
  { re: /(\.test|\.spec)\.[cm]?[jt]sx?$/i, tags: ['Pruebas'] },
  { re: /^\.env/i, tags: ['Seguridad', 'Configuración'] },
  { re: /\.(pem|key|p12|pfx|keystore|jks)$/i, tags: ['Seguridad'] },
  { re: /(auth|login|session|token|jwt|crypto|password|secret)/i, tags: ['Seguridad'] },
  { re: /\.(html|css|scss|tsx|jsx|vue|svelte)$/i, tags: ['Interfaz'] },
  { re: /\.(sql|prisma)$/i, tags: ['Datos'] },
  { re: /\.(md|mdx|txt)$/i, tags: ['Documentación'] },
  { re: /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf|glb|gltf)$/i, tags: ['Recursos'] },
  { re: /^(package(-lock)?\.json|.*\.config\.[cm]?[jt]s|.*\.ya?ml|.*\.toml|dockerfile|\.gitignore|\.npmrc)$/i, tags: ['Configuración'] },
  { re: /(mcp|agent|prompt|llm)/i, tags: ['Agente'] },
  { re: /(three|scene|mesh|camera)/i, tags: ['3D'] },
  { re: /\.[cm]?[jt]s$/i, tags: ['Lógica'] },
];

const unique = (list) => [...new Set(list)];

export function fileTags(path) {
  const name = baseName(path);
  for (const rule of FILE_RULES) if (rule.re.test(name)) return rule.tags;
  return [];
}

// Tags of a folder: its own name first, then the most common tags of what it contains (max 3)
export function folderTags(path, files = []) {
  const own = FOLDER_RULES.filter((r) => r.re.test(baseName(path))).flatMap((r) => r.tags);
  const counts = new Map();
  for (const f of files) for (const tag of fileTags(f.path ?? f)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  const common = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag);
  return unique([...own, ...common]).slice(0, 3);
}

// Friendly name for "vibe" mode ('' = the project root). Falls back to the main tag.
export function friendlyName(path, tags = []) {
  if (!path) return 'Edificio principal';
  const rule = FOLDER_RULES.find((r) => r.re.test(baseName(path)));
  if (rule) return rule.name;
  return tags[0] ? `${tags[0]} · ${baseName(path)}` : baseName(path);
}

// Guide entry for "vibe" mode: friendly name + one simple sentence
export function folderGuide(path, files = []) {
  const tags = folderTags(path, files);
  const rule = FOLDER_RULES.find((r) => r.re.test(baseName(path)));
  return { tags, name: friendlyName(path, tags), summary: rule?.summary ?? (tags[0] ? `Archivos de ${tags[0].toLowerCase()}.` : 'Archivos del proyecto.') };
}
