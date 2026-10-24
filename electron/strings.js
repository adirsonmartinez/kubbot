// User-facing texts of the main process (Spanish): native dialogs and errors shown in the chat.
module.exports = {
  windowTitle: 'Platanus',
  chooseFolder: 'Elige la carpeta del proyecto',
  cancelled: 'cancelado',
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
};
