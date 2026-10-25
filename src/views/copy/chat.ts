// The chat's own texts (plain Spanish for people who do not program): the header, the run card that tells
// what Qubi did, the model picker, the composer and its help. Qubi's lines over the robot are in qubi.ts.

export const chatCopy = {
  panel: "Chat con Qubi",
  badge: "Nuevo",
  working: "Qubi está trabajando…",
  pin: "Fijar el chat al costado",
  unpin: "Soltar el chat",
  minimize: "Minimizar",
  open: "Abrir el chat",
  moreBelow: "Ver el final",
  composer: {
    placeholder: "Cuéntame qué necesitas…",
    label: "Mensaje para Qubi",
    send: "Enviar",
    sendWorking: "Qubi está trabajando, espera un momento",
  },
  menu: {
    label: "Más opciones del chat",
    newChat: "Nueva conversación",
    save: "Guardar la conversación",
  },
  // The saved conversation (a text file)
  saved: {
    file: "conversacion-con-qubi.md",
    title: "Conversación con Qubi",
    you: "Tú",
    qubi: "Qubi",
    task: "Tarea",
    voice: "por llamada",
    empty: "Todavía no hay nada que guardar.",
  },
  // What Qubi is doing right now (the sentence beside the orb and the header's status)
  activity: {
    thinking: "Pensando…",
    writing: "Escribiendo la respuesta…",
    looking: "Mirando el banco…",
    building: "Armando en la mesa…",
    wiring: "Conectando cables…",
    example: "Montando el ejemplo…",
    simulating: "Probando el circuito…",
    enclosure: "Diseñando la caja…",
    sketch: "Escribiendo el código…",
    planning: "Armando el plan…",
  },
  // The run card: the steps of one answer
  run: {
    label: "Lo que hace Qubi",
    title: "Qubi",
    done: "Listo",
    failed: "No salió",
    stopped: "Se cortó",
    seconds: "Tiempo",
    steps: (n: number) => (n === 1 ? "1 paso" : `${n} pasos`),
    pending: (n: number) => (n === 1 ? "1 frenado por el verificador" : `${n} frenados por el verificador`),
    show: "Ver los pasos",
    hide: "Ocultar los pasos",
    waiting: "Esperando su turno…",
    stepState: { running: "En curso", done: "Hecho", failed: "Frenado" },
    // Each tool as a step: while it runs and once it ended
    tools: {
      lab_catalog: { now: "Revisando el catálogo", done: "Revisó el catálogo" },
      lab_view: { now: "Mirando el banco", done: "Miró el banco" },
      lab_add_part: { now: "Poniendo una pieza", done: "Puso una pieza" },
      lab_connect: { now: "Tirando un cable", done: "Tiró un cable" },
      lab_auto_wire: { now: "Conectando todo", done: "Conectó todo" },
      lab_remove: { now: "Quitando algo", done: "Quitó algo" },
      lab_move: { now: "Moviendo una pieza", done: "Movió una pieza" },
      lab_rotate: { now: "Girando una pieza", done: "Giró una pieza" },
      lab_focus: { now: "Señalando una pieza", done: "Señaló una pieza" },
      lab_load_example: { now: "Montando un ejemplo", done: "Montó un ejemplo" },
      lab_clear: { now: "Despejando la mesa", done: "Despejó la mesa" },
      lab_simulate: { now: "Probando el circuito", done: "Probó el circuito" },
      lab_make_enclosure: { now: "Diseñando la caja", done: "Diseñó la caja" },
      lab_make_sketch: { now: "Escribiendo el código", done: "Escribió el código" },
      lab_plan: { now: "Armando el plan", done: "Armó el plan" },
    } as Record<string, { now: string; done: string }>,
    toolDefault: { now: "Trabajando en el banco", done: "Trabajó en el banco" },
  },
  // The picker in the composer: which Claude answers and how much it thinks
  picker: {
    button: "Elegir el modelo y cuánto piensa",
    menu: "Modelo y esfuerzo",
    model: "Modelo",
    effort: "Cuánto piensa",
    models: {
      "claude-sonnet-5-5": { name: "Sonnet 5.5", note: "Rápido y equilibrado" },
      "claude-opus-5-5": { name: "Opus 5.5", note: "Para planes largos" },
      "claude-haiku-5-5": { name: "Haiku 5.5", note: "Lo más rápido y barato" },
    } as Record<string, { name: string; note: string }>,
    efforts: {
      low: { name: "Rápido", hint: "Responde enseguida y piensa poco." },
      medium: { name: "Equilibrado", hint: "Piensa lo justo para casi todo." },
      high: { name: "A fondo", hint: "Piensa más: tarda más y gasta más." },
    } as Record<string, { name: string; hint: string }>,
    saved: "Tu elección se guarda en este navegador.",
  },
  // Help while writing
  assist: {
    secret: "Parece que pegaste una clave o una contraseña. Bórrala antes de enviar.",
    short: "Cuéntame un poco más para poder ayudarte.",
    completions: "Piezas que puedes nombrar",
  },
} as const;
