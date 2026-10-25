// Welcome-screen copy, in plain Spanish for people who do not know electronics.

export const welcomeCopy = {
  // Title shown at the top of the card
  title: "¡Bienvenido a Qubbot!",
  // Intro line before the first question
  intro: "Hola, soy Qubi. Antes de empezar, cuéntame un poco:",
  // First question
  askBuild: "¿Qué te gustaría construir?",
  // Options for the first question
  options: {
    medirDistancia: "📏 Medir distancia",
    cuidarPlantas: "🌱 Cuidar plantas",
    climaCuarto: "🌤️ Clima de mi cuarto",
    alarmaMovimiento: "🚨 Alarma de movimiento",
    robotQueSeMueve: "🤖 Un robot que se mueve",
    otraCosa: "✋ Otra cosa",
  },
  // Placeholder for the free-text input when choosing "otra cosa"
  otherPlaceholder: "Cuéntame qué se te ocurre…",
  // Second question
  askExperience: "¿Ya armaste algo con Arduino?",
  experienceOptions: {
    nunca: "Nunca",
    unPoco: "Un poco",
    si: "Sí, ya he armado cosas",
  },
  // Navigation buttons
  buttons: {
    back: "← Atrás",
    skip: "Saltar",
    next: "Siguiente →",
    start: "Empezar",
  },
  // Completion state
  doneTitle: "¡Listo, pana!",
  doneText: "Voy a armar algo ideal para ti. Un momento…",
  // Progress indicator
  progress: "Paso",
  aria: "Entrevista de bienvenida",
  progressAria: (n: number, total: number) => `Paso ${n} de ${total}`,
} as const;