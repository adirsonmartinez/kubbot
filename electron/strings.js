// User-facing texts of the main process (Spanish): native dialogs and errors shown in the chat.
module.exports = {
  windowTitle: 'Platanus',
  chooseFolder: 'Elige la carpeta del proyecto',
  cancelled: 'cancelado',
  notRecent: 'Esa carpeta no está en tus proyectos recientes.',
  cancel: 'Cancelar',
  allow: 'Permitir',
  confirmOverwrite: (path) => `¿Sobrescribir "${path}"?`,
  confirmOverwriteDetail: 'El archivo ya existe y se reemplazará su contenido.',
  confirmDelete: (path) => `¿Borrar "${path}"?`,
  confirmDeleteDetail: 'Esta acción no se puede deshacer.',
  overwriteRejected: 'El usuario rechazó sobrescribir',
  deleteRejected: 'El usuario rechazó borrar',
  noWorkspace: 'No hay ninguna carpeta abierta',
  invalidPath: 'Ruta inválida',
  outsideWorkspace: (path) => `Ruta fuera del workspace: ${path}`,
  linkOutsideWorkspace: (path) => `Enlace fuera del workspace: ${path}`,
  cannotDeleteRoot: 'No se puede borrar la carpeta raíz del workspace',

  // Agents with the user's own subscription (electron/agents.js)
  agents: {
    claude: 'Claude (tu suscripción)',
    grok: 'Grok (tu suscripción)',
    codex: 'ChatGPT · Codex (tu suscripción)',
    unknown: 'Agente desconocido.',
    failed: 'El agente terminó con un error.',
    cannotStart: (bin, why) => `No pude abrir ${bin}: ${why}`,
    loginHint: ' Inicia sesión desde "Conecta tu agente".',
    exitCode: (code) => `El agente terminó con código ${code}.`,
  },
  mcp: {
    noProject: 'No hay ningún proyecto abierto en Platanus.',
    windowClosed: 'La ventana de Platanus no está disponible.',
    timeout: 'Platanus no respondió a tiempo.',
    tooLarge: (kb) => `El archivo pesa más de ${kb} KB; no se comparte con el agente.`,
  },
};
