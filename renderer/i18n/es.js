// Every user-facing text lives here (Spanish). Code, comments and identifiers stay in English.
// To translate the UI, copy this file (e.g. en.js) and change the import in the modules that use it.
import { plural } from '../core/format.js';

const files = (n) => plural(n, 'archivo', 'archivos');
const folders = (n) => plural(n, 'carpeta', 'carpetas');
const floors = (n) => plural(n, 'piso', 'pisos');

export const strings = {
  controls: {
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    rotateLeft: 'Girar a la izquierda (Q)',
    rotateRight: 'Girar a la derecha (E)',
    reset: 'Centrar vista',
  },

  emptyState: {
    title: 'Ningún proyecto abierto',
    body: 'Elige la carpeta de tu proyecto para verlo en el mapa.',
    action: 'Abrir proyecto',
  },

  panels: {
    backToMap: 'Volver al mapa',
    schemaTitle: 'Supabase · esquema public',
    schemaSummary: (tables, hasError) => (hasError ? `${tables} tablas · 1 con error` : `${tables} tablas · todo en orden`),
    folderSummary: (fileCount, floorCount, hidden) =>
      `${files(fileCount)} · ${floors(floorCount)}` + (hidden ? ` (+${hidden} sin mostrar)` : ''),
  },

  map: {
    files,
    rootSummary: (fileCount, folderCount) => `${files(fileCount)} · ${folders(folderCount)}`,
    emptyFolder: 'vacía',
    defaultProjectName: 'proyecto',
  },

  supabase: {
    connected: 'Supabase · conectado',
    vulnerable: 'Supabase · RLS desactivado',
    critical: 'CRÍTICO',
    latency: (ms) => `${ms} ms`,
    exposed: 'expuesto',
    rlsOn: 'RLS ON',
    rlsOff: 'RLS OFF',
  },

  security: {
    levels: { green: 'Seguro', yellow: 'Revisar', red: 'Riesgo', grey: 'Sin evaluar' },
    levelWithEmoji: { green: '🟢 Seguro', yellow: '🟡 Revisar', red: '🔴 Riesgo', grey: '⚪ Sin evaluar' },
    reasons: {
      envTemplate: 'Plantilla de variables de entorno: verifica que no tenga valores reales.',
      envFile: 'Archivo .env: suele tener claves y secretos, y no debería estar en el repositorio.',
      privateKey: 'Llave o certificado privado dentro del proyecto.',
      secretName: 'El nombre sugiere credenciales o secretos guardados en el código.',
      sql: 'SQL o migración: revisa permisos y políticas RLS.',
      sensitiveLogic: 'Lógica sensible (autenticación o sesiones): conviene revisarla.',
      config: 'Configuración: revisa que no exponga datos ni dé permisos de más.',
      clean: 'Sin señales de riesgo.',
    },
    byAgent: 'Evaluado por el agente.',
    byDemo: 'Regla de demo: el agente de IA lo evaluará más adelante.',
  },

  shell: {
    brand: 'Platanus',
    search: 'Buscar o hacer algo…',
    searchShortcut: '⌘K',
    menus: { file: 'Archivo', view: 'Ver', agent: 'Agente', window: 'Ventana' },
    actions: {
      openProject: 'Abrir proyecto',
      centerView: 'Centrar vista',
      zoomIn: 'Acercar',
      zoomOut: 'Alejar',
      backToMap: 'Volver al mapa',
      toggleSidebar: 'Mostrar u ocultar el panel lateral',
      toggleChat: 'Mostrar u ocultar el agente',
      openChat: 'Hablar con el agente',
      showMap: 'Ver el mapa',
      showGraph: 'Ver el grafo de amenazas',
    },
    rail: { explorer: 'Explorador', risks: 'Riesgos', map: 'Mapa del proyecto', graph: 'Grafo de amenazas' },
    sidebar: {
      explorer: 'Explorador',
      risks: 'Riesgos',
      noProject: 'Abre un proyecto para ver sus carpetas.',
      noRisks: 'Ningún archivo en rojo o amarillo. ¡Bien!',
      risksSummary: (red, yellow) => `${red} en riesgo · ${yellow} por revisar`,
      openFolder: (name) => `Abrir ${name} en el mapa`,
    },
    status: {
      noProject: 'Sin proyecto',
      counts: (red, yellow, green) => `${red} en riesgo · ${yellow} por revisar · ${green} seguros`,
      agent: 'Agente en línea',
    },
  },

  graph: {
    tabMap: 'Mapa',
    tabGraph: 'Grafo',
    title: 'Grafo de amenazas',
    description: 'Cada caja es una parte de tu proyecto. La línea roja es el camino que haría un atacante desde internet; las naranjas son datos que llegan sin revisar. Arrastra para moverte y usa la rueda para acercar.',
    fit: 'Encuadrar',
    animateAttack: 'Animar ataque',
    stopAttack: 'Detener ataque',
    noProject: 'Abre un proyecto para ver su grafo.',
    noRoute: 'No hay un camino abierto desde internet hasta tus datos.',
    route: (steps) => `Camino más corto desde internet: ${steps} pasos.`,
    sub: (n) => ({
      internet: 'entrada del atacante',
      app: 'tu app',
      folder: `${n.count ?? 0} archivos${n.level === 'red' ? ' · riesgo' : n.level === 'yellow' ? ' · revisar' : ''}`,
      database: n.level === 'red' ? 'datos · expuesta' : 'base de datos',
      table: 'tabla expuesta',
    })[n.kind] ?? '',
  },

  chat: {
    agentName: 'Agente Platanus',
    online: 'En línea',
    placeholder: 'Escribe un mensaje…',
    inputLabel: 'Mensaje',
    send: 'Enviar',
    minimize: 'Minimizar',
    expand: 'Abrir',
    ariaLabel: 'Chat con el agente',

    greeting: '¡Hola! 👋 Soy el agente de seguridad. Abre un proyecto para empezar.',
    projectReady: 'Listo, ya veo tu proyecto en el mapa. ¿Qué hacemos?',
    projectOpened: (name) => `Proyecto abierto: ${name}`,
    diskChanged: (paths) => `Cambios en disco: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ` y ${paths.length - 3} más` : ''}`,

    chips: {
      openFolder: 'Abrir carpeta',
      suggestions: ['Escanear edificio', 'Ver accesos', 'Simular ataque'],
      vulnerability: ['Ver detalles', 'Corregir ahora'],
      fixNow: 'Corregir ahora',
    },

    folderOpened: ({ name, files: fileCount, floors: floorCount, counts }) => {
      const head = `🏢 ${name} · ${files(fileCount)} en ${floors(floorCount)}`;
      if (!fileCount) return `${head}\n\nTodavía no tiene archivos.`;
      const summary = `🔴 ${counts.red} en riesgo · 🟡 ${counts.yellow} a revisar · 🟢 ${counts.green} seguros`;
      const hint = counts.red
        ? 'Los cubitos rojos están adelante en cada piso. Haz clic en uno para ver el motivo.'
        : 'Haz clic en un piso para verlo de cerca, o en un cubito para ver su detalle.';
      return `${head}\n${summary}\n\n${hint}`;
    },
    fileSelected: ({ path, levelText, reason, source }) => `📄 ${path}\n${levelText} · ${reason}\n\n${source}`,
    tableExposed: (name, exposed) =>
      `<strong>⚠ Tabla ${name}: RLS desactivado</strong>\nColumnas expuestas: ${exposed}.\nCualquiera con la anon key puede leerlas.`,
    tableOk: (name, columnCount, keys) => `Tabla ${name} ✅\n${columnCount} columnas · claves: ${keys}\nRLS activo, sin problemas.`,
  },

  // Scripted agent (demo). Keywords are matched against the start of each word.
  agent: {
    replies: [
      { keys: ['hola', 'buenas', 'hey'], text: '¡Hola! Soy el agente de seguridad del HQ. Puedo escanear el edificio, revisar accesos o explicarte una amenaza.' },
      { keys: ['escan', 'scan', 'revisa'], text: 'Escaneando la torre principal…\n\n✔ 18 ventanas monitoreadas\n✔ Antena: señal estable\n⚠ 1 puerto abierto en el anexo (servidor 2)\n\n¿Quieres que lo cierre?' },
      { keys: ['si', 'sí', 'cierra', 'ok', 'dale'], text: 'Listo, cerré el puerto del servidor 2 y dejé un registro del cambio. El edificio está en verde ✅' },
      { keys: ['acceso', 'login', 'entrada', 'puerta'], text: 'Últimos accesos a la puerta principal:\n• 09:12 — Ana (credencial válida)\n• 09:40 — Bot desconocido (bloqueado)\n• 10:05 — Luis (credencial válida)' },
      { keys: ['inyec', 'prompt', 'jailbreak'], text: 'Un prompt injection es cuando alguien esconde instrucciones dentro de un texto para que el modelo ignore sus reglas. Yo filtro esos mensajes antes de que lleguen al modelo.' },
      { keys: ['amenaza', 'ataque', 'riesgo'], text: 'Ahora mismo veo 0 ataques activos y 3 intentos bloqueados en la última hora. Nivel de riesgo: bajo 🟢' },
      { keys: ['gracias'], text: '¡Con gusto! Aquí sigo vigilando 👀' },
    ],
    fallback: 'Mmm, todavía estoy aprendiendo eso. Prueba con "escanear", "accesos" o "amenazas".',
    keywords: {
      fix: ['correg', 'corrig', 'corrij', 'arregl', 'soluc', 'fix', 'parche'],
      details: ['detalle', 'supabase', 'rls', 'vulnera'],
      attack: ['simula', 'ataca', 'hackea'],
    },
    vulnerability: {
      alert: '<strong>⚠ Vulnerabilidad detectada en Supabase</strong>\nLa tabla <b>users</b> tiene RLS (Row Level Security) desactivado. Cualquiera con la anon key puede leer correos y datos personales.\n\nEstoy viendo datos saliendo del nodo en rojo.\n\nHaz clic en el nodo de Supabase para ver tus tablas.',
      details: 'Detalles del hallazgo:\n• Tabla: public.users\n• Riesgo: CRÍTICO\n• Filas expuestas: 1.284\n• Petición sospechosa: GET /rest/v1/users?select=* desde 185.220.101.7\n\nRecomiendo activar RLS y crear una política para que cada usuario solo lea su propia fila.',
      fix: 'Aplicando corrección…\n\nALTER TABLE users ENABLE ROW LEVEL SECURITY;\nCREATE POLICY "solo_su_fila" ON users\n  FOR SELECT USING (auth.uid() = id);\n\n✅ Listo. Bloqueé la IP sospechosa y el nodo vuelve a estar en verde.',
      nothingToFix: 'No hay nada que corregir ahora mismo, Supabase está en verde 🟢',
      attack: 'Ok, simulo un ataque contra el nodo de Supabase. Mira el mapa 👀',
      needsProject: 'Primero abre un proyecto para poder simular un ataque.',
    },
    files: {
      patterns: {
        openFolder: /^(abr[ei]r?|elegir|elige)\s+(una\s+)?carpeta$/i,
        mkdir: /^crea(r)?\s+(una\s+)?carpeta\s+(.+)$/i,
        write: /^crea(r)?\s+(un\s+)?archivo\s+(\S+)(?:\s+con\s+([\s\S]+))?$/i,
        remove: /^(borra|elimina)(r)?\s+(.+)$/i,
        list: /^(lista(r)?|ver|muestra(me)?)\s+(los\s+)?archivos$|^archivos$/i,
      },
      opened: (name) => `📂 Trabajando en "${name}".\nPrueba: "crea carpeta src" o "crea archivo src/app.js".`,
      notOpened: 'Ok, no abrí ninguna carpeta.',
      created: (path) => `📁 Carpeta creada: ${path}`,
      written: (path) => `📄 Archivo creado: ${path}`,
      removed: (path) => `🗑 Borrado: ${path}`,
      emptyFolder: 'La carpeta está vacía.',
      desktopOnly: 'Eso solo funciona dentro de la app de escritorio (npm start).',
      needsFolder: 'Primero elige una carpeta de trabajo: escribe "abrir carpeta".',
      failed: (error) => `<strong>⛔ No se pudo</strong>\n${error}`,
    },
  },
};
