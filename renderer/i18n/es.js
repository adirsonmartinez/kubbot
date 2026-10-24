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
    // Same reasons for "dev" mode: which rule matched and what to do about it
    techReasons: {
      envTemplate: 'Regla: nombre .env.(example|sample|template). Comprueba que solo tenga claves vacías o de ejemplo.',
      envFile: 'Regla: nombre ^.env(.*)?. Secretos versionados: rotar las claves, git rm --cached y añadir a .gitignore.',
      privateKey: 'Regla: extensión .pem/.key/.p12/.pfx/.keystore/.jks o id_rsa*. Revocar la llave y sacarla del repo.',
      secretName: 'Regla: el nombre contiene secret/credential/password/private_key/service_account. Mover a variables de entorno.',
      sql: 'Regla: extensión .sql. Verificar ENABLE ROW LEVEL SECURITY y políticas por tabla.',
      sensitiveLogic: 'Regla: auth/login/session/token/jwt/middleware/crypto. Revisar validación de sesión, expiración y rutas sin auth.',
      config: 'Regla: archivo de configuración (Dockerfile, *.config.*, *.yml, vercel.json…). Revisar permisos y valores expuestos.',
      clean: 'Ninguna regla de riesgo coincide.',
    },
    byAgent: 'Evaluado por el agente.',
    byRemi: 'Plan de Remi.',
    byDemo: 'Regla de demo: el agente de IA lo evaluará más adelante.',
  },

  mode: {
    vibe: 'Vibe',
    tech: 'Dev',
    title: 'Cómo te hablo',
    info: 'Vibe: una guía con nombres sencillos. Dev: todas las carpetas, rutas y reglas.',
  },

  hover: {
    clickFolder: 'Clic para entrar al edificio',
    clickFloor: 'Clic para acercar este piso',
    clickFile: 'Clic para ver el detalle',
    cracks: (n) => (n === 1 ? '1 grieta' : `${n} grietas`),
    toReview: (n) => `${n} por revisar`,
    noCracks: 'Sin grietas',
    files,
    floor: 'Piso',
    path: 'Ruta',
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`),
  },

  repair: {
    name: 'Remi · reparador',
    step: (i, n) => `paso ${i}/${n}`,
    queued: (n) => `${n} en fila`,
    working: 'Arreglando',
    steps: ['Caminando hacia la grieta', 'Mirando el problema', 'Pensando el plan', 'Apuntalando la grieta', 'Plan listo'],
    myPlan: 'Mi plan',
    fromAgent: (agent) => `Plan escrito con ${agent}`,
    fromGuide: 'Plan de la guía de Platanus',
    honest: 'Remi no cambia tus archivos: deja el plan y marca la grieta en amarillo hasta que lo apliques.',
    markFixed: 'Ya lo apliqué',
    close: 'Cerrar',
    repair: 'Reparar',
    repairing: 'Remi trabajando…',
    queuedShort: 'En fila',
    chip: 'Reparar con Remi',
    chipWorst: 'Reparar lo más grave',
    plannedReason: (first) => `Remi dejó un plan: ${first}. Falta aplicarlo.`,
    fixedReason: 'Arreglado siguiendo el plan de Remi.',
    nothing: 'No hay grietas para reparar. ¡Todo en orden! 🟢',
    started: (path) => `🔧 Remi va a revisar ${path}.`,
    planned: (path, steps) => `🔧 Plan de Remi para ${path}:\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nCuando lo apliques, toca "Ya lo apliqué".`,
    agentPrompt: (path, reason) =>
      `Lee el archivo ${path} con platanus_read_file si puedes. El problema es: ${reason}. ` +
      'Responde SOLO con 3 pasos cortos para arreglarlo, uno por línea, cada línea empezando con "- ". No cambies ningún archivo.',
    plans: {
      envFile: ['Sacar el archivo .env del repositorio y agregarlo a .gitignore', 'Cambiar las claves que tenía (ya pudieron verse)', 'Guardar las claves nuevas en las variables del servidor'],
      privateKey: ['Quitar la llave del proyecto y guardarla en un lugar seguro', 'Crear una llave nueva y dar de baja la anterior', 'Agregar ese tipo de archivo a .gitignore'],
      secretName: ['Buscar contraseñas o claves escritas a mano en el archivo', 'Moverlas a variables de entorno', 'Cambiar las que ya estuvieron en el código'],
      envTemplate: ['Revisar que solo tenga nombres de variables, sin valores reales', 'Si hay un valor real, borrarlo y cambiar esa clave'],
      sql: ['Revisar que cada tabla tenga RLS activado', 'Crear una regla para que cada persona solo vea sus datos', 'Probar con la anon key que no se pueda leer todo'],
      sensitiveLogic: ['Revisar quién puede entrar sin iniciar sesión', 'Comprobar que las sesiones caduquen', 'Pedirle al agente una revisión línea por línea'],
      config: ['Revisar que no tenga claves ni datos privados', 'Quitar permisos que no se usen', 'Dejar solo lo necesario para producción'],
      other: ['Revisar el archivo con el agente', 'Corregir lo que encuentre', 'Volver a revisar el semáforo'],
    },
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
      openRecent: 'Abrir reciente',
      noRecent: 'Sin proyectos recientes',
      repairWorst: 'Reparar la grieta más grave',
      toggleMode: 'Cambiar entre Vibe y Dev',
    },
    rail: { explorer: 'Explorador', risks: 'Riesgos', agent: 'Conecta tu agente', map: 'Mapa 3D', project: 'Mapa del proyecto', graph: 'Grafo de amenazas', chat: 'Agente' },
    // Shown when hovering a rail button or a tab
    railInfo: {
      explorer: 'Las partes de tu proyecto con etiquetas y su semáforo.',
      risks: 'Lo que está en rojo o amarillo. Desde aquí Remi lo repara.',
      agent: 'Elige qué IA responde y conéctala desde tu editor.',
      map: 'Tu proyecto como una ciudad: cada carpeta es un edificio.',
      graph: 'El camino que seguiría un atacante hasta tus datos.',
      project: 'Cómo está repartido el código, con etiquetas por carpeta.',
      chat: 'Habla con el agente en palabras sencillas.',
    },
    tabInfo: {
      map: (buildings, cracked) => `${buildings} edificios · ${cracked ? `${cracked} con grietas` : 'sin grietas'}`,
      graph: (red) => (red ? `${red} archivos en riesgo en el camino` : 'Sin caminos abiertos'),
    },
    recent: 'Recientes',
    project: {
      title: 'Mapa del proyecto',
      summary: (folders, files) => `Cómo está repartido el código · ${folders} carpetas · ${files} archivos`,
      filter: 'Filtrar:',
      clear: 'Quitar filtro',
      none: 'Ninguna carpeta tiene esa etiqueta.',
      showOnMap: 'Ver en el mapa',
      empty: 'Abre un proyecto para ver cómo está repartido.',
      inside: (name) => `dentro de ${name}`,
    },
    explorerGuide: 'Guía de tu proyecto: qué hay en cada parte.',
    allFiles: 'Archivos sueltos',
    sidebar: {
      explorer: 'Explorador',
      risks: 'Riesgos',
      agent: 'Conecta tu agente',
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
    tabProject: 'Proyecto',
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
    placeholder: 'Pregúntale al agente… (Enter envía, Shift+Enter salta línea)',
    thinking: 'Pensando…',
    connectors: 'Conexiones: conecta tu IA o tu editor',
    pickerTitle: 'Quién responde',
    pickerMore: 'Conectar desde tu editor…',
    demo: 'Demo',
    inputLabel: 'Mensaje',
    send: 'Enviar',
    minimize: 'Minimizar',
    expand: 'Abrir',
    ariaLabel: 'Chat con el agente',
    toolUsed: (name) => ({
      get_project: 'Mirando tu proyecto…',
      list_risks: 'Revisando los archivos en riesgo…',
      read_file: 'Leyendo un archivo…',
      set_file_score: 'Actualizando el semáforo en el mapa…',
      show_folder: 'Mostrándote una carpeta en el mapa…',
    })[String(name).replace(/^platanus_/, '')] ?? 'Usando una herramienta…',

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
  connect: {
    title: 'Conecta tu agente',
    rail: 'Conecta tu agente',
    intro: 'Usa tu propia suscripción de IA. Platanus no ve tus contraseñas ni claves: cada programa inicia sesión por su cuenta.',
    subscriptions: 'Tus suscripciones',
    none: 'No encontré Claude Code, Grok ni Codex instalados en esta computadora.',
    desktopOnly: 'Disponible en la app de escritorio.',
    scripted: 'Agente de demostración (sin IA)',
    use: 'Usar',
    inUse: 'En uso',
    login: 'Entrar',
    loggedIn: 'sesión iniciada',
    loggedOut: 'sin sesión',
    unknownLogin: 'sesión por comprobar',
    model: 'Modelo',
    planDefault: 'El de tu plan',
    effort: 'Cuánto piensa',
    efforts: { low: 'Rápido', medium: 'Equilibrado', high: 'Profundo', xhigh: 'Muy profundo', max: 'Máximo' },
    fromEditor: 'Conéctalo desde tu editor',
    fromEditorIntro: 'Copia esto en tu herramienta para que trabaje con el mapa de Platanus mientras la app está abierta.',
    mcpOff: 'El servidor local todavía no está listo.',
    mcpOn: (url) => `Servidor local: ${url}`,
    copy: 'Copiar',
    copied: 'Copiado',
    snippets: {
      claude: 'Claude Code (terminal)',
      cursor: 'Cursor (.cursor/mcp.json)',
      codex: 'Codex (~/.codex/config.toml)',
      gemini: 'Gemini CLI (~/.gemini/settings.json)',
    },
  },

  agent: {
    // Instructions for the user's own agent when it answers in the chat (it reads them, users do not)
    livePrompt:
      'Eres el agente de seguridad de Platanus. Quien te escribe no es desarrollador: responde en español sencillo, en pocas frases, sin jerga. ' +
      'Usa las herramientas de Platanus: platanus_get_project para ver el proyecto, platanus_list_risks para los archivos en riesgo, ' +
      'platanus_read_file para leer un archivo, platanus_set_file_score para marcar el semáforo de un archivo (verde, amarillo o rojo, con una razón corta) ' +
      'y platanus_show_folder para mostrar una carpeta en el mapa. Nunca pidas ni muestres secretos. Termina con un paso concreto que la persona pueda hacer.',
    // Added to livePrompt in "dev" mode
    techSuffix: ' La persona eligió el modo técnico: puedes usar rutas, nombres de archivos, comandos y fragmentos de código, siempre breves.',
    liveFailed: (why) => `<strong>No pude hablar con tu agente.</strong> ${why || 'Revisa en "Conecta tu agente" que la sesión esté iniciada.'}`,
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
