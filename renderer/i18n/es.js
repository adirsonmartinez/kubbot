// Every user-facing text lives here (Spanish). Code, comments and identifiers stay in English.
// To translate the UI, copy this file (e.g. en.js) and change the import in the modules that use it.
import { plural } from '../core/format.js';

const files = (n) => plural(n, 'archivo', 'archivos');
const folders = (n) => plural(n, 'carpeta', 'carpetas');

export const strings = {
  controls: {
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    rotateLeft: 'Girar a la izquierda (Q)',
    rotateRight: 'Girar a la derecha (E)',
    reset: 'Centrar vista',
  },

  git: {
    title: (branch) => (branch ? `Git · ${branch}` : 'Git · HEAD suelto'),
    summary: ({ branches, commits, lastTag }) =>
      `${plural(branches, 'rama', 'ramas')} · ${plural(commits, 'commit', 'commits')}` + (lastTag ? ` · último tag ${lastTag}` : ''),
    risky: (n) => `⚠ ${plural(n, 'commit subió', 'commits subieron')} secretos`,
    loading: 'Leyendo el historial…',
    notRepo: 'Esta carpeta no usa git',
    notRepoHint: 'Inicializa un repositorio (git init) para ver tus ramas aquí.',
    gitMissing: 'No encontré git instalado en este equipo.',
    error: 'No pude leer el historial de git.',
    noProject: 'Abre un proyecto para ver sus ramas.',
    deleted: 'borrada',
    head: 'HEAD',
    laneNames: { merged: 'rama mezclada', unknown: 'sin rama' },
    commitSelected: ({ short, subject, author, date, lane, files }) => {
      const when = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
      const list = files.slice(0, 8).map((f) => `${f.status} ${f.path}`).join('\n');
      const more = files.length > 8 ? `\n… y ${files.length - 8} más` : '';
      const changes = files.length ? `\n\n${plural(files.length, 'archivo', 'archivos')}:\n${list}${more}` : '\n\nCommit de merge (sin cambios propios).';
      return `🔹 ${short} · ${subject}\n${author} · ${when}\nRama: ${lane}${changes}`;
    },
    riskWarning: (files) =>
      `\n\n⚠ Este commit subió ${files.join(', ')}. Aunque se borre después, queda en el historial de git: rota esas claves y limpia la historia (por ejemplo con git filter-repo).`,
  },

  emptyState: {
    title: 'Ningún proyecto abierto',
    body: 'Crea un proyecto nuevo o abre la carpeta de uno que ya tengas para verlo en el mapa.',
    newAction: 'Nuevo proyecto',
    action: 'Abrir proyecto',
  },

  floater: {
    move: 'Arrastra para moverlo (doble clic: vuelve a su lugar)',
    minimize: 'Minimizar',
    restore: 'Mostrar',
    hud: 'Seguridad del proyecto',
  },

  panels: {
    // Breadcrumb counts: files of the open folder (or the project) by traffic light
    levelCount: (level, n) => ({
      red: `${n} ${n === 1 ? 'archivo' : 'archivos'} en riesgo aquí`,
      yellow: `${n} ${n === 1 ? 'archivo' : 'archivos'} por revisar aquí`,
      green: `${n} ${n === 1 ? 'archivo seguro' : 'archivos seguros'} aquí`,
    })[level],
    backToMap: 'Volver al mapa',
    schemaTitle: 'Supabase · esquema public',
    schemaSummary: (tables, hasError) => (hasError ? `${tables} tablas · 1 con error` : `${tables} tablas · todo en orden`),
    breadcrumbLabel: 'Ruta de la carpeta',
    upHint: 'Esc cierra la carpeta',
  },

  hud: {
    seeRisks: 'Ver la lista de riesgos',
    security: 'Seguridad',
    files: 'Archivos',
    risk: 'En riesgo',
    review: 'A revisar',
    commits: 'Commits',
  },

  map: {
    files,
    risk: (n) => `${n} en riesgo`,
    review: (n) => `${n} a revisar`,
    rootSummary: (fileCount, folderCount) => `${files(fileCount)} · ${folders(folderCount)}`,
    watched: (fileCount) => `${files(fileCount)} vigilados`,
    allClear: 'Todo en orden',
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

  // Folder tags (models/folderTags.js) and the friendly names of "vibe" mode
  tags: {
    ui: 'Interfaz',
    scene3d: '3D',
    logic: 'Lógica',
    data: 'Datos',
    server: 'Servidor',
    desktop: 'Escritorio',
    agent: 'Agente',
    security: 'Seguridad',
    tests: 'Pruebas',
    docs: 'Documentación',
    config: 'Configuración',
    assets: 'Recursos',
  },
  folders: {
      root: { name: 'Edificio principal', summary: 'La raíz del proyecto: lo que está fuera de las carpetas.' },
      screen: { name: 'Lo que ves en pantalla', summary: 'Todo lo que aparece en la ventana: mapa, paneles, chat y estilos.' },
      components: { name: 'Piezas de la pantalla', summary: 'Botones, paneles y vistas que dibujan lo que ves.' },
      styles: { name: 'Colores y estilos', summary: 'Cómo se ve todo: colores, tamaños, efectos de vidrio y animaciones.' },
      scene: { name: 'Escena 3D', summary: 'Las carpetas, los riesgos, Remi y la cámara del mapa.' },
      viewmodels: { name: 'Estado de cada pantalla', summary: 'Qué muestra cada parte y qué pasa al hacer clic, sin dibujar nada.' },
      services: { name: 'Conexiones', summary: 'Habla con el disco, la app de escritorio y tu agente de IA.' },
      core: { name: 'Cómo funciona por dentro', summary: 'Piezas básicas que usa el resto del código.' },
      models: { name: 'Datos que recuerda la app', summary: 'El proyecto abierto, el semáforo de cada archivo y lo que eligió la persona.' },
      database: { name: 'Base de datos', summary: 'Tablas, migraciones y reglas de quién puede leer qué.' },
      server: { name: 'Servidor', summary: 'Lo que corre fuera de la pantalla y responde a la app.' },
      desktop: { name: 'App de escritorio', summary: 'La ventana, los permisos al disco, el servidor local y los agentes con tu suscripción.' },
      agent: { name: 'Inteligencia artificial', summary: 'Instrucciones y conexiones del agente de IA.' },
      security: { name: 'Seguridad y accesos', summary: 'Quién puede entrar y qué puede hacer.' },
      tests: { name: 'Pruebas automáticas', summary: 'Revisiones que se corren solas para que nada se rompa.' },
      docs: { name: 'Documentación', summary: 'Explicaciones, decisiones e instrucciones del proyecto.' },
      automation: { name: 'Automatizaciones y ajustes', summary: 'Lo que se ejecuta solo al subir cambios o publicar versiones.' },
      assets: { name: 'Imágenes y archivos', summary: 'Logos, imágenes, fuentes y archivos que se sirven tal cual.' },
      i18n: { name: 'Textos e idiomas', summary: 'Todas las frases que lee la persona, en un solo lugar.' },
  },
  // Name + sentence of a folder from folderTags.folderGuide(): { key, tags }
  describeFolder: ({ key, tags }, folder) => {
    if (key) return strings.folders[key];
    const tag = strings.tags[tags[0]];
    return { name: tag ? `${tag} · ${folder}` : folder, summary: tag ? `Archivos de ${tag.toLowerCase()}.` : 'Archivos del proyecto.' };
  },

  devTree: {
    search: 'Buscar archivo o carpeta…',
    expandAll: 'Expandir todo',
    collapseAll: 'Contraer todo',
    onlyRisks: 'Solo riesgos',
    map: 'Ver en el mapa',
    repair: 'Reparar',
    copyPath: 'Copiar ruta',
    copied: 'Ruta copiada',
    noMatches: 'Nada coincide con la búsqueda.',
    by: { agent: 'IA', remi: 'Remi' },
    size: (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`),
    matches: (n) => (n === 1 ? '1 resultado' : `${n} resultados`),
  },

  mode: {
    vibe: 'Vibe',
    tech: 'Dev',
    title: 'Cómo te hablo',
    info: 'Vibe: una guía con nombres sencillos. Dev: todas las carpetas, rutas y reglas.',
  },

  hover: {
    clickFolder: 'Clic para entrar al edificio',
    clickFile: 'Clic para ver el detalle',
    atRisk: (n) => `${n} en riesgo`,
    toReview: (n) => `${n} por revisar`,
    noRisks: 'Sin riesgos',
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
    steps: ['Caminando hacia el problema', 'Mirando el problema', 'Reparando', 'Revisando el resultado', 'Listo'],
    stepsAgent: (agent) => ['Caminando hacia el problema', 'Mirando el problema', `${agent} está reparando`, 'Revisando el resultado', 'Listo'],
    outcome: { fixed: 'Reparado: revísalo', planned: 'Plan listo', failed: 'No se pudo reparar' },
    fixedToVerify: (n) => `Tu agente cambió ${n === 1 ? '1 archivo' : `${n} archivos`} para arreglarlo. Revísalo y márcalo como verificado.`,
    timeout: 'El agente tardó demasiado.',
    cancelled: 'Se canceló.',
    verified: 'Verificado',
    undo: 'Deshacer cambio',
    undone: 'Deshecho',
    agentFixPrompt: (path, reason) =>
      `Repara este problema de seguridad del archivo ${path}: ${reason}\n` +
      '1. Lee el archivo con platanus_read_file (si se niega porque tiene secretos, no insistas).\n' +
      '2. Si hay un arreglo pequeño y seguro editando archivos del proyecto, escribe el archivo completo corregido con platanus_write_file y explica el cambio en "reason". La persona aprobará cada cambio. Si el arreglo no se hace editando (por ejemplo, rotar claves en otro servicio), no escribas nada.\n' +
      '3. Explica con tres tarjetas cortas: "> [!riesgo] Qué encontré", "> [!ok] Qué cambié" (o "> [!nota] Por qué no cambié nada") y "> [!paso] Qué te falta hacer a ti".',
    chat: {
      started: (path, agent) => (agent ? `🔧 Remi y ${agent} van a reparar ${path}.` : `🔧 Remi va a revisar ${path}.`),
      changed: (path, reason) => `✏️ Cambio aprobado en ${path}: ${reason}`,
      finished: {
        fixed: (path, n) => `✅ Reparación de ${path}: ${n === 1 ? '1 archivo cambiado' : `${n} archivos cambiados`}. Quedó en amarillo hasta que lo verifiques en el historial de reparaciones.`,
        planned: (path) => `📝 Plan de reparación de ${path} listo. Cuando lo apliques, márcalo en el historial de reparaciones.`,
        failed: (path, why) => `⛔ No se pudo reparar ${path}. ${why}`,
        verified: (path) => `🟢 ${path} quedó verificado.`,
      },
      planTitle: 'Pasos:',
    },
    myPlan: 'Mi plan',
    fromAgent: (agent) => `Plan escrito con ${agent}`,
    fromGuide: 'Plan de la guía de Platanus',
    honest: 'Remi no cambia archivos. Tu agente sí puede, pero solo con tu aprobación y guardando una copia para deshacer. El archivo queda en amarillo hasta que lo verifiques.',
    markFixed: 'Ya lo apliqué',
    close: 'Cerrar',
    repair: 'Reparar',
    repairing: 'Remi trabajando…',
    queuedShort: 'En fila',
    chip: 'Reparar con Remi',
    chipWorst: 'Reparar lo más grave',
    plannedReason: (first) => `Remi dejó un plan: ${first}. Falta aplicarlo.`,
    fixedReason: 'Arreglado siguiendo el plan de Remi.',
    nothing: 'No hay riesgos para reparar. ¡Todo en orden! 🟢',
    started: (path) => `🔧 Remi va a revisar ${path}.`,
    history: {
      title: 'Reparaciones',
      intro: 'Todo lo que Remi y tu agente repararon o dejaron pendiente.',
      empty: 'Todavía no hay reparaciones. Toca "Reparar" en un riesgo.',
      clear: 'Limpiar terminadas',
      status: { queued: 'En fila', working: 'Trabajando', planned: 'Plan listo', fixed: 'Por verificar', verified: 'Verificado', failed: 'Falló' },
      by: (agent) => (agent ? `con ${agent}` : 'con la guía de Platanus'),
      changes: 'Cambios',
      plan: 'Pasos',
      explanation: 'Lo que explicó el agente',
      created: 'archivo nuevo',
      interrupted: 'Se cortó porque la app se cerró mientras trabajaba.',
      verify: 'Marcar verificado',
      retry: 'Reintentar',
      open: 'Ver en el mapa',
      ago: (iso) => {
        const s = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 1000));
        return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
      },
    },
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
    menus: { file: 'Proyecto' },
    actions: {
      newProject: 'Nuevo proyecto',
      openProject: 'Abrir proyecto',
      closeProject: 'Cerrar proyecto',
      openRecent: 'Abrir reciente',
      noRecent: 'Sin proyectos recientes',
    },
    rail: { explorer: 'Explorador', risks: 'Riesgos', repairs: 'Reparaciones', servers: 'Servidores', agent: 'Conecta tu agente', map: 'Mapa 3D', graph: 'Grafo de amenazas', git: 'Ramas de git', chat: 'Agente' },
    // Shown when hovering a rail button or a tab
    railInfo: {
      explorer: 'Las partes de tu proyecto con etiquetas y su semáforo.',
      risks: 'Lo que está en rojo o amarillo. Desde aquí Remi lo repara.',
      repairs: 'Historial de lo que se reparó, lo que falta verificar y lo que falló.',
      servers: 'Lo que está escuchando en un puerto de tu computadora, y si tu red lo puede ver.',
      agent: 'Elige qué IA responde y conéctala desde tu editor.',
      map: 'Tu proyecto en 3D: solo aparecen las carpetas y archivos con problemas.',
      graph: 'El camino que seguiría un atacante hasta tus datos.',
      git: 'Tus ramas y commits, y si algún commit subió un secreto.',
      chat: 'Habla con el agente en palabras sencillas.',
    },
    tabInfo: {
      map: (folders, atRisk) => `${folders} carpetas · ${atRisk ? `${atRisk} en riesgo` : 'sin riesgos'}`,
      graph: (red) => (red ? `${red} archivos en riesgo en el camino` : 'Sin caminos abiertos'),
    },
    recent: 'Recientes',
    explorerGuide: 'Guía de tu proyecto: qué hay en cada parte.',
    allFiles: 'Archivos sueltos',
    sidebar: {
      explorer: 'Explorador',
      risks: 'Riesgos',
      repairs: 'Reparaciones',
      servers: 'Servidores',
      agent: 'Conecta tu agente',
      noProject: 'Abre un proyecto para ver sus carpetas.',
      noRisks: 'Ningún archivo en rojo o amarillo. ¡Bien!',
      risksSummary: (red, yellow) => `${red} en riesgo · ${yellow} por revisar`,
      openFolder: (name) => `Abrir ${name} en el mapa`,
    },
    // Servers listening on this computer (spec/001-running-servers.md)
    servers: {
      intro: 'Programas de tu computadora que esperan conexiones en un puerto. Se actualiza solo cada pocos segundos.',
      loading: 'Buscando servidores…',
      empty: 'No hay ningún servidor escuchando ahora.',
      error: 'No pude leer la lista de servidores.',
      summary: (total, exposed) => `${total === 1 ? '1 servidor' : `${total} servidores`} · ${exposed ? `${exposed} visibles en tu red` : 'ninguno visible en tu red'}`,
      local: 'Solo esta computadora',
      network: 'Visible en tu red',
      unknownProcess: 'Proceso desconocido',
      exposedReason: 'Cualquier equipo de tu red WiFi puede abrir este servidor. Si no hace falta, arráncalo solo en localhost (127.0.0.1).',
      exposedReasonTech: (address) => `Escucha en ${address || 'todas las interfaces'}: accesible desde la red local. Arráncalo con host 127.0.0.1 si no necesitas acceso desde otros equipos.`,
      open: 'Abrir',
      openTitle: (port) => `Abrir http://localhost:${port} en un navegador`,
      openWith: 'Abrir con',
      openDefault: 'Navegador predeterminado',
      openOther: 'Elegir otra app…',
      more: (port) => `Más opciones del puerto ${port}`,
      stop: 'Detener…',
      stopTitle: (port) => `Detener el servidor del puerto ${port} (te pide confirmación)`,
      stopped: (port) => `Listo: se detuvo el servidor del puerto ${port}.`,
      pause: 'Pausar',
      resume: 'Reanudar',
      resumeTitle: (port) => `Reanudar el servidor del puerto ${port}`,
      pausedChip: 'En pausa',
      pausedReason: 'Está congelado: no responde hasta que lo reanudes, y el puerto sigue ocupado.',
      paused: (port) => `El servidor del puerto ${port} quedó en pausa. Platanus lo reanuda si se cierra.`,
      resumed: (port) => `El servidor del puerto ${port} volvió a correr.`,
      stoppedTitle: 'Detenidos desde Platanus',
      stoppedChip: 'Detenido',
      stoppedAt: (time) => `a las ${time}`,
      restart: 'Reactivar…',
      restartTitle: (port) => `Reactivar el servidor del puerto ${port} dentro de Platanus (te pide confirmación)`,
      restarted: (port) => `Iniciando el servidor del puerto ${port} dentro de Platanus…`,
      managedChip: 'En Platanus',
      managedTitle: 'Lo inició Platanus: corre dentro de la app y se detiene al cerrarla. Su salida está en ⋯ › Ver salida.',
      showOutput: 'Ver salida',
      closeOutput: 'Cerrar la salida',
      noOutput: 'Todavía no escribió nada.',
      outputLabel: (port) => `Salida del servidor del puerto ${port}`,
      startingChip: 'Iniciando…',
      startingDetail: (port) => `esperando el puerto ${port}`,
      exitedChip: 'Se cerró solo',
      exitedDetail: (code, time) => (code == null ? `a las ${time}` : `código ${code} · a las ${time}`),
      exitedReason: 'Se cerró sin que lo detuvieras. Abre su salida (⋯ › Ver salida) para ver por qué.',
      cancelStart: 'Cancelar inicio',
      cancelStartTitle: (port) => `Cancelar el inicio del servidor del puerto ${port}`,
      cannotRestart: 'No se puede reactivar desde aquí: vuelve a arrancarlo desde tu terminal.',
      forget: 'Quitar de la lista',
      working: 'Esperando…',
      actionFailed: 'No se pudo completar la acción.',
      dismiss: 'Cerrar aviso',
      demo: 'Ejemplo',
      demoNote: 'Estos servidores son de ejemplo. En la app de escritorio ves los de tu computadora.',
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
    tabGit: 'Git',
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
    placeholders: {
      vibe: 'Cuéntame qué necesitas, con tus palabras…',
      tech: 'Pregunta técnica: rutas, código, configuración… (Enter envía)',
    },
    // How the agent talks (agent/voice.json + agent/skills/)
    voice: {
      label: 'Cómo te habla el agente',
      names: { vibe: 'Vibe', tech: 'Dev' },
      hints: {
        vibe: 'Vibe: palabras simples, comparaciones de la vida diaria y sin jerga.',
        tech: 'Dev: detalle técnico, rutas y fragmentos de código cortos.',
      },
    },
    // What the orb in the agent's avatar says it is doing (screen readers)
    orbLabels: {
      breathing: 'Pensando…',
      composing: 'Escribiendo la respuesta…',
      searching: 'Buscando en tu proyecto…',
      working: 'Leyendo un archivo…',
      solving: 'Actualizando el semáforo…',
      connecting: 'Mostrándote el mapa…',
      weaving: 'Coordinando ayudantes…',
    },
    thinking: 'Pensando…',
    reasoning: 'Cómo lo pensó',
    // Titles of the agent's cards when it gives none ("> [!riesgo]" ...)
    callouts: { danger: 'Riesgo', ok: 'Está bien', idea: 'Idea', step: 'Tu siguiente paso', info: 'Nota' },
    pin: 'Fijar el chat: el mapa le deja su espacio',
    unpin: 'Soltar el chat: vuelve a flotar sobre el mapa',
    resize: 'Arrastra para cambiar el ancho del chat',
    run: {
      tools: {
        get_project: 'Ver el proyecto',
        list_risks: 'Revisar los riesgos',
        read_file: 'Leer un archivo',
        write_file: 'Guardar un arreglo',
        set_file_score: 'Cambiar el semáforo',
        show_folder: 'Mostrar en el mapa',
      },
      tool: 'Usar una herramienta',
      subagent: (kind) => (kind ? `Subagente · ${kind}` : 'Subagente'),
      summary: (steps, subagents) => `${steps === 1 ? '1 paso' : `${steps} pasos`}${subagents ? ` · ${subagents === 1 ? '1 subagente' : `${subagents} subagentes`}` : ''}`,
      working: 'Trabajando…',
      done: 'Listo',
      failed: 'Con error',
      seconds: (ms) => (ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`),
      foot: ({ durationMs, turns, inputTokens, outputTokens }, format) =>
        `${format(durationMs)} · ${turns === 1 ? '1 turno' : `${turns} turnos`} · ${(inputTokens + outputTokens).toLocaleString('es')} tokens`,
      output: 'Lo que respondió',
    },
    welcomeTitle: (project) => `¿Qué hacemos con ${project}?`,
    welcomeNoProject: '¿Qué hacemos hoy?',
    welcomeBody: 'Cuéntame tu idea o pídeme que revise el edificio. Te explico cada problema con palabras simples.',
    prompts: ['Revisa mi proyecto y dime qué está en riesgo', 'Explícame el mapa con palabras simples', '¿Qué archivo debería arreglar primero?'],
    // Shown above the box to start writing right away (they fill the box, the person can edit and send)
    followUps: {
      vibe: ['¿Mi app es segura?', 'Explícamelo más simple', '¿Qué hago ahora?', '¿Qué archivo arreglo primero?', '¿Por qué esto es un riesgo?'],
      tech: ['Revisa los archivos en rojo', 'Audita este proyecto a fondo', '¿Qué secretos están expuestos?', 'Revisa la autenticación', 'Propón el arreglo con código'],
    },
    followUpsTitle: 'Sugerencias para escribir',
    auditPrompt: (path, reason) => `Audita \`${path}\`.${reason ? ` El mapa lo marca así: "${reason}".` : ''} Léelo y dime si el riesgo es real o una falsa alarma, por qué, y qué haría para arreglarlo. Si no es un riesgo, ponlo en verde en el semáforo.`,
    notInProject: (path) => `No encuentro "${path}" en este proyecto.`,
    // Next steps the agent suggests (chips under its answer)
    suggest: {
      repair: (name) => `Reparar ${name}`,
      audit: (name) => `Auditar ${name}`,
      locate: (name) => `Ver ${name} en el mapa`,
    },
    // Map events shown as cards in the chat
    cards: {
      files: (n) => (n === 1 ? '1 archivo' : `${n} archivos`),
      folders: (n) => (n === 1 ? '1 subcarpeta' : `${n} subcarpetas`),
      levels: { red: 'en riesgo', yellow: 'a revisar', green: 'seguros' },
      folderHint: 'No tiene problemas, por eso no aparece en el mapa. Puedes recorrerla en el explorador.',
      folderHintRisk: 'Sus archivos con problemas están junto a la carpeta en el mapa. Toca uno para ver el motivo.',
      folderEmpty: 'Todavía no tiene archivos.',
      seeRisks: 'Ver los riesgos',
      explainFolder: 'Explícame esta carpeta',
      explainFolderPrompt: (name) => `Explícame qué hay en la carpeta \`${name.replace(/\/$/, '')}\` y para qué sirve, con palabras simples.`,
      whatIsIt: '¿Qué es este archivo?',
      whatIsItPrompt: (path) => `¿Qué es \`${path}\` y para qué sirve en mi proyecto? Explícamelo con palabras simples.`,
      audit: 'Auditar en el chat',
      source: 'Quién lo marcó',
    },
    more: 'Más opciones',
    menu: {
      open: 'Abrir el chat',
      connect: 'Conecta tu agente',
      editor: 'Conectar tu editor (MCP)',
      repairWorst: 'Reparar el riesgo más grave',
      history: 'Historial de reparaciones',
      graph: 'Ver el grafo de amenazas',
      mode: (tech) => (tech ? 'Hablar en modo Vibe' : 'Hablar en modo Dev'),
      newChat: 'Nueva conversación',
    },
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
    projectClosed: (name) => `Proyecto cerrado: ${name}`,
    projectCreated: (name) => `Listo, creé «${name}» y está vacío 🌱\nCuéntame qué quieres construir y lo armamos juntos, de forma segura desde el primer archivo.`,
    projectCreateFailed: (error) => `No pude crear el proyecto: ${error}`,
    diskChanged: (paths) => `Cambios en disco: ${paths.slice(0, 3).join(', ')}${paths.length > 3 ? ` y ${paths.length - 3} más` : ''}`,

    chips: {
      openFolder: 'Abrir carpeta',
      suggestions: ['Escanear edificio', 'Ver accesos', 'Simular ataque'],
      vulnerability: ['Ver detalles', 'Corregir ahora'],
      fixNow: 'Corregir ahora',
    },

    folderOpened: ({ name, files: fileCount, folders: folderCount, counts }) => {
      const head = `📂 ${name} · ${files(fileCount)} · ${plural(folderCount, 'subcarpeta', 'subcarpetas')}`;
      if (!fileCount) return `${head}\n\nTodavía no tiene archivos.`;
      const summary = `🔴 ${counts.red} en riesgo · 🟡 ${counts.yellow} a revisar · 🟢 ${counts.green} seguros`;
      const hint = counts.red + counts.yellow
        ? 'Sus archivos con problemas están junto a la carpeta en el mapa. Haz clic en uno para ver el motivo.'
        : 'No tiene problemas, por eso no aparece en el mapa.';
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
    modelNotes: {
      plan: 'El que elige tu plan',
      best: 'El más capaz',
      deep: 'Profundo y preciso',
      balanced: 'Rápido y capaz',
      fast: 'El más rápido',
      newest: 'El más nuevo',
      fastPricey: 'Más rápido, gasta más',
      previous: 'Versión anterior',
    },
    effortHints: {
      low: 'Responde al instante. Ideal para preguntas cortas.',
      medium: 'Piensa un poco más antes de responder.',
      high: 'Revisa con calma: mejor para auditar.',
      xhigh: 'Análisis a fondo; tarda más.',
      max: 'Todo el razonamiento disponible. Lento y más caro para tu plan.',
    },
    fromEditor: 'Conéctalo desde tu editor',
    fromEditorIntro: 'Copia esto en tu herramienta para que trabaje con el mapa de Platanus mientras la app está abierta.',
    mcpOff: 'El servidor local todavía no está listo.',
    mcpOn: (url) => `Servidor local: ${url}`,
    mcpPrivate: 'La dirección lleva una llave privada (oculta aquí). "Copiar" la incluye: no la compartas.',
    copy: 'Copiar',
    copied: 'Copiado',
    snippets: {
      claude: 'Claude Code (terminal)',
      cursor: 'Cursor (.cursor/mcp.json)',
      codex: 'Codex (~/.codex/config.toml)',
      gemini: 'Gemini CLI (~/.gemini/settings.json)',
    },
  },

  // "Conecta tu agente" panel: agents, comparing answers, the local MCP server and its activity
  hub: {
    agents: 'Tus agentes',
    version: (v) => (v ? `v${v.replace(/^v/, '')}` : ''),
    path: 'Ruta',
    test: 'Probar',
    testing: 'Probando…',
    testOk: (ms) => `Responde en ${(ms / 1000).toFixed(1)} s`,
    testFailed: 'No respondió',
    testHint: 'Envía un mensaje mínimo (usa unos pocos tokens de tu plan).',
    stats: ({ runs, tokens, lastUsedAt }) => {
      const t = tokens >= 1000 ? `${Math.round(tokens / 1000)} mil tokens` : `${tokens} tokens`;
      const when = lastUsedAt ? ` · ${strings.hub.ago(Date.now() - lastUsedAt)}` : '';
      return `${runs === 1 ? '1 respuesta' : `${runs} respuestas`} · ${t}${when}`;
    },
    never: 'Todavía no lo usaste',
    lastError: 'Último error',
    current: (model, effort) => `${model} · ${effort}`,
    compare: 'Comparar respuestas',
    compareIntro: 'Pregunta a dos agentes a la vez y compara lo que responden.',
    compareNone: 'Solo uno',
    server: 'Servidor local (MCP)',
    running: 'Encendido',
    stopped: 'Apagado',
    tools: 'Herramientas que ofrece',
    toolInfo: {
      get_project: 'Ve las carpetas y archivos del proyecto abierto.',
      list_risks: 'Lista los archivos en rojo o amarillo y por qué.',
      read_file: 'Lee un archivo (nunca secretos ni archivos de más de 200 KB).',
      write_file: 'Guarda un arreglo: siempre te pide permiso y guarda copia.',
      set_file_score: 'Cambia el semáforo de un archivo en el mapa.',
      show_folder: 'Te muestra una carpeta en el mapa.',
    },
    activity: 'Actividad reciente',
    activityEmpty: 'Todavía ningún agente usó Platanus.',
    ago: (ms) => {
      const s = Math.max(1, Math.round(ms / 1000));
      return s < 60 ? `hace ${s} s` : s < 3600 ? `hace ${Math.round(s / 60)} min` : s < 86400 ? `hace ${Math.round(s / 3600)} h` : `hace ${Math.round(s / 86400)} d`;
    },
    testPrompt: 'Responde solo con la palabra: listo',
    compareLabel: (a, b) => `Comparando ${a} y ${b}`,
  },

  agent: {
    // The chat agent's own instructions live in agent/voice.json and agent/skills/ (not shown to people)
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
    // Git commands understood in the chat. The phrasing is interpreted by models/gitIntent.js
    // (natural language → intent); these are only the replies.
    git: {
      help: 'Puedo ejecutar git con frases normales. Ejemplos:\n• "haz un commit que se llame arreglo login"\n• "deshaz el último commit" (rollback)\n• "reset al commit abc1234" (destructivo: necesito el SHA)\n• "crea una rama para pagos"\n• "cámbiate a main"',
      explain: {
        commit: 'Un commit es una foto guardada de tu proyecto. Dime "haz un commit que se llame ...".',
        rollback: 'Rollback (revert) crea un commit NUEVO que deshace otro, sin borrar el historial. Es seguro en equipo. Dime "deshaz el último commit".',
        reset: 'Reset mueve el proyecto a un commit anterior y descarta todo lo posterior. Es destructivo. Dime "reset al commit <sha>".',
        branch: 'Una rama es una línea paralela de trabajo para probar cosas sin tocar la principal. Dime "crea una rama para pagos".',
        diff: 'Rollback crea un commit nuevo que deshace otro: el historial se conserva. Reset mueve el historial hacia atrás y descarta cambios: es destructivo, úsalo solo en local.',
      },
      desktopOnly: 'Los comandos git solo funcionan dentro de la app de escritorio (npm start).',
      needsMessage:  'Escríbeme el mensaje del commit. Ejemplo: "haz commit con \"Fix login bug\""',
      needsSha:       'Necesito el SHA del commit (al menos 4 caracteres). Puedes hacer clic en un commit del mapa y usar el chip que aparece aquí.',
      needsBranchName: 'Escribe el nombre de la rama. Ejemplo: "crea rama feature/mi-funcion"',
      cancelled:      'Ok, no hice ningún cambio.',
      committed:   (msg) => `✅ Commit creado:\n"${msg}"`,
      reverted:    (sha) => `↩️ Revert aplicado al ${sha === 'HEAD' ? 'último commit' : `commit ${sha.slice(0, 7)}`}.\nSe creó un nuevo commit que deshace esos cambios.`,
      reset:       (sha) => `⏮ HEAD movido al commit ${sha.slice(0, 7)}.\nLos cambios no guardados fueron descartados.`,
      branchCreated: (name) => `🌿 Rama "${name}" creada y activada.`,
      checkedOut:    (target) => `🔀 Cambiado a "${target}".`,
      failed:        (err) => `<strong>⛔ Error git</strong>\n${err}`,
      // Chips shown in the chat when the user selects a commit on the map
      chipRevert:   (short) => `Rollback · ${short}`,
      chipReset:    (short) => `Reset al ${short}`,
      chipCopySha:  'Copiar SHA',
    },
  },
};
