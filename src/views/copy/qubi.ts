// Qubi's copy, in plain Spanish with a warm Venezuelan touch. Each module adds its own sub-object.

import { chatCopy } from "./chat.ts";

export const qubiCopy = {
  name: "Qubi",
  // The chat panel (views/components/chat): its texts live in copy/chat.ts
  chat: chatCopy,
  // The robot on the bench (views/scene/lab/qubi)
  robot: {
    clickHint: "Haz clic en Qubi para hablar con él",
  },
  // Qubi's hands-on menu on the bench (views/scene/lab/qubi/QubiMenu): tap him for the menu, or grab him and
  // drop him on a part. `prompts` are the chat messages the page can send for each action (the page decides).
  actions: {
    hint: "Toca a Qubi para ver qué puede hacer. Agárralo y suéltalo sobre una pieza.",
    menuLabel: "Qué puede hacer Qubi",
    menuTitle: "¿Qué hacemos, pana?",
    partTitle: (part: string) => `¿Qué hago con ${part}?`,
    labels: {
      call: "Llamar",
      ideas: "¿Qué puedo construir?",
      check: "Revisar conexiones",
      wireAll: "Conectar todo",
      simulate: "Simular",
      enclosure: "Hacer la caja",
      explain: "Explicar",
      connect: "Conectar",
      rotate: "Girar",
      remove: "Quitar",
    },
    explainPart: (part: string) => `Explicar ${part}`,
    prompts: {
      ideas: "¿Qué puedo construir con lo que hay en la mesa?",
      check: "Revisa las conexiones de mi circuito y dime cómo van.",
      wireAll: "Conecta todo lo que falte en mi circuito.",
      simulate: "Simula mi circuito y cuéntame qué pasa.",
      enclosure: "Hazme la caja para imprimir en 3D.",
      explain: (part: string) => `Explícame para qué sirve ${part} y cómo se conecta.`,
      connect: (part: string) => `Conecta ${part} con lo que necesite.`,
      rotate: (part: string) => `Gira ${part}.`,
      remove: (part: string) => `Quita ${part} de la mesa.`,
    },
  },
  // The task card in the chat (views/components/qubi/TaskCard) and the chat's fixed lines for Qubi
  tasks: {
    label: "Tarea",
    progress: (done: number, total: number) => `${done} de ${total}`,
    state: { planning: "Armando el plan", working: "Trabajando en ello", done: "Listo", failed: "Quedó algo pendiente", cancelled: "Cancelada" },
    step: { pending: "Pendiente", doing: "En curso", done: "Hecho", failed: "No salió" },
    // What Qubi says when a turn ends with actions but no words (the call needs something to read out)
    doneFallback: "¡Listo, pana!",
    voiceLine: "Dicho en la llamada",
  },
  // Qubi's director (models/qubi/director): the fixed lines over his head. {n}, {i} and {text} are filled in.
  director: {
    thinking: "A ver, déjame pensar…",
    tools: {
      lab_catalog: "Echando un ojo al catálogo…",
      lab_view: "Mirando cómo va el banco…",
      lab_add_part: "Poniendo la pieza en la mesa…",
      lab_connect: "Tirando un cable, pana…",
      lab_auto_wire: "Cableando todo en un toque…",
      lab_remove: "Quitando eso del medio…",
      lab_move: "Moviendo la pieza…",
      lab_rotate: "Girando la pieza…",
      lab_focus: "¡Mira, pana, es esta!",
      lab_load_example: "Armando el ejemplo, ¡ya va!",
      lab_clear: "Despejando la mesa…",
      lab_simulate: "¡Encendiendo la simulación!",
      lab_make_enclosure: "Diseñando la caja…",
      lab_make_sketch: "Escribiendo el código…",
      lab_plan: "Armando el plan…",
      lab_step: "Siguiente paso…",
    },
    toolDefault: "Manos a la obra…",
    toolFailed: "Uy, eso no salió. Déjame revisarlo.",
    done: "¡Listo, pana!",
    doneFailed: "Quedó un detalle pendiente, pana.",
    error: "Uy, se me enredó algo. ¿Probamos otra vez?",
    planned: "Ya tengo el plan: {n} pasos. ¡Vamos!",
    step: "Paso {i} de {n}: {text}",
    stepFailed: "El paso {i} se me complicó…",
    cancelled: "Listo, lo dejo ahí.",
  },
  // Greetings. `chat` are for when the lab opens; `call` are the Venezuelan ones from the Electron app's
  // voice.greetings (pana style), where {project} is the project's name.
  greetings: {
    project: "tu laboratorio",
    chat: [
      "¡Epa, pana! Aquí Qubi. ¿Qué vamos a construir hoy?",
      "¡Épale! ¿Qué más? Dime qué armamos y yo le echo pichón.",
      "¡Ajá, dígame! Aquí Qubi, listo para armar circuitos contigo.",
      "¡Qué fino verte, chamo! Tengo la mesa lista. ¿Por dónde empezamos?",
      "¡Epa, mi pana! ¿Todo fino? Pídeme lo que quieras y lo armamos.",
      "¡Naguará, qué bueno que llegaste! Vamos a hacer algo chévere.",
    ],
    call: [
      "¡Aló! ¿Quién habla? … ¡Epa, pana! Aquí Qubi, viendo {project}. ¿Qué vamos a construir hoy?",
      "¡Épale! ¿Qué más, pana? Aquí Qubi, con {project} abierto. ¿Con quién tengo el gusto?",
      "¡Aló, aló! Qubi al habla… ¡Naguará, qué fino que llamaste! Ya tengo {project} aquí. ¿Quién habla?",
      "¡Ajá, dígame! Aquí Qubi, el robot constructor, listo para echarle pichón a {project}. ¿Con quién hablo?",
      "¡Epa, mi pana! ¿Todo fino? Aquí Qubi, mirando {project}. ¿Quién me llama?",
      "¡Aló! ¿Qué hubo, chamo? Aquí Qubi, con {project} abierto y burda de ganas de construir. ¿Quién habla?",
      "¡Qué molleja, una llamada! Aquí Qubi, con {project} en la mesa. ¿Con quién tengo el gusto?",
      "¡Aló! Sí, sí, aquí Qubi… ¡Chévere que llamaste, pana! Ya estoy viendo {project}. ¿Quién habla?",
      "¡Epa! Qubi por aquí, con las herramientas listas para {project}. ¿Quién es, pana?",
    ],
  },
  // The voice call (views/components/qubi/CallBar and CallButton)
  call: {
    start: "Llamar a Qubi",
    stop: "Colgar",
    mute: "Silenciar el micrófono",
    unmute: "Activar el micrófono",
    status: {
      connecting: "Llamando a Qubi…",
      listening: "Te escucho, pana",
      thinking: "Qubi está pensando…",
      speaking: "Qubi está hablando",
      muted: "Micrófono apagado",
    },
    mode: { browser: "Voz del navegador", elevenlabs: "Voz en vivo" },
    captionHint: "Habla cuando quieras",
    errors: {
      noSpeech: "Este navegador no puede escuchar tu voz. Prueba con Chrome o Edge, o escríbele a Qubi en el chat.",
      micDenied: "No pude usar tu micrófono. Dale permiso en el navegador y vuelve a llamar.",
      network: "Se cayó la conexión de la voz. Revisa tu internet y vuelve a llamar.",
      noKey: "La voz en vivo no está activada en este servidor. Prueba con la voz del navegador.",
      failed: "La llamada no se pudo hacer. Intenta otra vez en un momento.",
    },
    // Said by Qubi when a reply has nothing to read aloud (only cards or actions)
    emptyReply: "¡Listo, pana!",
  },
} as const;
