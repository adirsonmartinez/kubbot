// The settings panel's visible text (Spanish, warm and simple).

export const settingsCopy = {
  title: "Ajustes",
  hint: "Repetir la bienvenida o vaciar el banco",
  tour: {
    title: "Recorrido",
    text: "Un paseo rápido por el laboratorio: el catálogo, el banco, la caja y el chat con Qubi.",
    start: "Empezar el recorrido",
  },
  interview: {
    title: "Entrevista de bienvenida",
    text: "Vuelve a contarle a Qubi qué quieres construir y te prepara un ejemplo.",
    start: "Ver la entrevista otra vez",
  },
  clear: {
    title: "Banco de trabajo",
    text: (parts: number) => (parts === 0 ? "El banco ya está vacío." : `Quita las ${parts} ${parts === 1 ? "pieza" : "piezas"} y todos los cables del banco.`),
    start: "Vaciar el banco",
    confirm: (parts: number) => `¿Seguro? Se quitan ${parts} ${parts === 1 ? "pieza" : "piezas"} con sus cables. Puedes deshacerlo con Ctrl+Z.`,
    yes: "Sí, vaciar",
    no: "No, dejarlo",
  },
} as const;
