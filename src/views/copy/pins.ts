// The wiring guide's copy, in plain Spanish for people who know nothing about electronics: what every
// part does, what every pin does and where it should go, why a pin is the best one (or a bad one), and
// the help card's words. Keyed by the ids in models/lab/catalog.ts and models/lab/guide.ts. The facts
// follow .claude/skills/kubbot-lab/references/arduino.md. Code and comments stay in English.

type PinText = { name: string; does: string };
type PartText = { does: string; pins: Record<string, PinText> };

// What a reason says. `pin` is the part's pin, `target` the pin it would go to.
type Words = { pin: string; target: string };

const power = (volts: string): PinText => ({ name: "Energía", does: `La energía que la pieza necesita para funcionar (${volts}). Sin este cable no se prende.` });
const ground: PinText = { name: "Tierra", does: "Por aquí vuelve la corriente. Toda pieza necesita su cable a tierra (GND), o no funciona." };

export const pinsCopy = {
  // --- Every part: one plain sentence, and what each pin does ---
  parts: {
    "arduino-uno": { does: "El cerebro del circuito: lee los sensores y manda órdenes a los motores y las luces. Trabaja a 5 V.", pins: {} },
    "arduino-nano": { does: "El mismo cerebro que el Uno, en versión pequeña. Trabaja a 5 V.", pins: {} },
    "esp32-devkit": { does: "Un cerebro con wifi y bluetooth. Trabaja a 3,3 V, así que sus pines no aguantan 5 V.", pins: {} },
    pico: { does: "Un cerebro pequeño y rápido. Trabaja a 3,3 V, así que sus pines no aguantan 5 V.", pins: {} },

    "hc-sr04": {
      does: "Mide qué tan lejos está algo: lanza un sonido que no oyes y cuenta cuánto tarda en volver.",
      pins: {
        VCC: power("5 V"),
        TRIG: { name: "Disparo", does: "Le dice al sensor que lance el sonido." },
        ECHO: { name: "Eco", does: "Avisa cuánto tardó en volver el eco." },
        GND: ground,
      },
    },
    pir: {
      does: "Avisa cuando alguien se mueve cerca. Tarda como medio minuto en calentarse al encenderlo.",
      pins: {
        VCC: power("5 V"),
        OUT: { name: "Salida", does: "Se activa cuando detecta movimiento y se apaga cuando todo queda quieto." },
        GND: ground,
      },
    },
    dht22: {
      does: "Mide la temperatura y la humedad del aire. Se puede leer cada 2 segundos.",
      pins: {
        VCC: power("3,3 V o 5 V"),
        DATA: { name: "Datos", does: "Por aquí manda la temperatura y la humedad, como números." },
        GND: ground,
      },
    },
    soil: {
      does: "Dice qué tan húmeda está la tierra de una planta.",
      pins: {
        VCC: power("3,3 V o 5 V"),
        AOUT: { name: "Lectura", does: "Manda un valor que sube o baja según la humedad. Va a un pin que empieza con A." },
        GND: ground,
      },
    },
    ldr: {
      does: "Mide cuánta luz hay a su alrededor.",
      pins: {
        VCC: power("3,3 V o 5 V"),
        AOUT: { name: "Lectura", does: "Manda un valor que cambia con la luz. Va a un pin que empieza con A." },
        GND: ground,
      },
    },

    "servo-sg90": {
      does: "Un motor pequeño que gira hasta el ángulo exacto que le pides, de 0 a 180 grados.",
      pins: {
        VCC: power("5 V"),
        SIG: { name: "Señal", does: "Recibe el ángulo al que debe girar. Necesita un pin con ~ (los que dan valores intermedios, PWM)." },
        GND: ground,
      },
    },
    relay: {
      does: "Un interruptor que la placa activa sola: sirve para prender y apagar cosas más grandes. En el laboratorio, solo de bajo voltaje.",
      pins: {
        VCC: power("5 V"),
        IN: { name: "Entrada", does: "Cuando la placa lo activa, el relé hace clic y cierra el interruptor." },
        GND: ground,
      },
    },
    buzzer: {
      does: "Hace pitidos y melodías sencillas.",
      pins: {
        SIG: { name: "Señal", does: "Cuando la placa lo activa, suena." },
        GND: ground,
      },
    },
    led: {
      does: "Una luz pequeña que la placa prende, apaga o regula.",
      pins: {
        SIG: { name: "Señal", does: "Cuando la placa manda corriente por aquí, la luz se prende." },
        GND: ground,
      },
    },
    "resistor-220": {
      does: "Frena la corriente para que el LED no se queme. Va siempre entre un pin de la placa y el LED.",
      pins: {
        A: { name: "Entrada", does: "Aquí llega el pin de la placa que manda la señal." },
        B: { name: "Salida", does: "De aquí sale la corriente ya frenada, hacia el LED." },
      },
    },
    l298n: {
      does: "Controla un motor: lo hace girar hacia un lado, hacia el otro, o más lento.",
      pins: {
        "5V": { name: "Energía de control", does: "Alimenta la parte que piensa del módulo (5 V). Los motores se alimentan aparte, con pilas." },
        ENA: { name: "Velocidad", does: "Decide qué tan rápido gira el motor. Necesita un pin con ~ (los que dan valores intermedios, PWM)." },
        IN1: { name: "Giro A", does: "Junto con IN2 decide hacia qué lado gira el motor." },
        IN2: { name: "Giro B", does: "Si IN1 está activo e IN2 no, gira hacia un lado; al revés, hacia el otro." },
        GND: ground,
      },
    },

    "oled-128x64": {
      does: "Una pantalla pequeña para escribir texto y dibujar. Solo usa dos cables de datos, por donde habla con la placa (I2C).",
      pins: {
        VCC: power("3,3 V o 5 V"),
        SDA: { name: "Datos", does: "El cable por donde viajan los datos hacia la pantalla." },
        SCL: { name: "Reloj", does: "Marca el ritmo para que la placa y la pantalla se entiendan." },
        GND: ground,
      },
    },
    "lcd-1602-i2c": {
      does: "Una pantalla de dos líneas de texto, fácil de leer. Solo usa dos cables de datos, por donde habla con la placa (I2C).",
      pins: {
        VCC: power("5 V"),
        SDA: { name: "Datos", does: "El cable por donde viajan los datos hacia la pantalla." },
        SCL: { name: "Reloj", does: "Marca el ritmo para que la placa y la pantalla se entiendan." },
        GND: ground,
      },
    },

    button: {
      does: "Un botón: la placa se entera de cuándo alguien lo aprieta.",
      pins: {
        SIG: { name: "Señal", does: "Cambia cuando alguien aprieta el botón; la placa lo lee como «apretado»." },
        GND: { name: "Tierra", does: "El otro lado del botón. Va a GND; la placa se encarga del resto." },
      },
    },
    potentiometer: {
      does: "Una perilla: al girarla, sube o baja un valor.",
      pins: {
        VCC: power("3,3 V o 5 V"),
        OUT: { name: "Salida", does: "Manda un valor según cuánto giraste la perilla. Va a un pin que empieza con A." },
        GND: ground,
      },
    },

    "battery-aa4": {
      does: "Cuatro pilas AA: energía sin cable, unos 6 V.",
      pins: {
        "+": { name: "Positivo", does: "De aquí sale la energía de las pilas. Va al pin VIN de la placa." },
        "-": { name: "Negativo", does: "Por aquí vuelve la corriente a las pilas. Va a GND." },
      },
    },
  } as Record<string, PartText>,

  // --- Pin roles (guide.ts pinRole) when a part gives no more specific words: title, and where it goes ---
  roles: {
    power: { title: "Energía", where: "Al pin de 5 V de la placa (o al de 3,3 V si la pieza lo admite y tu placa trabaja a 3,3 V)." },
    ground: { title: "Tierra", where: "A cualquier pin GND de la placa." },
    vin: { title: "Positivo de las pilas", where: "Al pin VIN de la placa." },
    trigger: { title: "Disparo", where: "A un pin digital de la placa (como D2 o D4)." },
    echo: { title: "Eco", where: "A otro pin digital de la placa (como D2 o D4)." },
    data: { title: "Datos", where: "A un pin digital de la placa." },
    "signal-in": { title: "Señal que entra", where: "A un pin digital de la placa." },
    "signal-out": { title: "Señal que sale", where: "A un pin digital de la placa." },
    direction: { title: "Dirección", where: "A un pin digital de la placa." },
    pwm: { title: "Señal con ~", where: "A un pin con ~ (PWM) de la placa, como D3, D5, D6, D9, D10 o D11 en el Uno." },
    "analog-in": { title: "Lectura analógica", where: "A un pin analógico de la placa (los que empiezan con A, como A0)." },
    sda: { title: "Datos I2C", where: "Al pin SDA de la placa (en el Uno y el Nano es A4)." },
    scl: { title: "Reloj I2C", where: "Al pin SCL de la placa (en el Uno y el Nano es A5)." },
  },

  // --- The board's own pins, by kind ---
  board: {
    "board-5v": { title: "5 V", does: "Da 5 voltios de energía para sensores y pantallas que los piden. Nunca lo juntes con tierra (GND) ni con 3,3 V." },
    "board-3v3": { title: "3,3 V", does: "Da 3,3 voltios, una energía más suave, para piezas que no aguantan 5 V. Da poca corriente: solo para piezas pequeñas." },
    "board-vin": { title: "VIN", does: "Entrada de energía externa, como un portapilas. Úsalo para alimentar la placa con pilas." },
    "board-gnd": { title: "GND (tierra)", does: "Por aquí vuelve la corriente. Toda pieza necesita un cable a GND; varias pueden compartir el mismo pin." },
    "board-digital": { title: "Pin digital", does: "Manda o lee solo «sí» o «no» (encendido o apagado). Pon una pieza por pin." },
    "board-pwm": { title: "Pin digital con ~ (PWM)", does: "Además de «sí» y «no», puede dar valores intermedios: sirve para mover un servo o regular una luz." },
    "board-analog": { title: "Pin analógico", does: "Lee un valor con muchos niveles (no solo «sí» o «no»), como la luz o la humedad." },
    "board-sda": { title: "SDA (datos I2C)", does: "El cable por donde las pantallas y otros módulos hablan con la placa (I2C). Todos comparten SDA y SCL." },
    "board-scl": { title: "SCL (reloj I2C)", does: "El cable que marca el ritmo de esa conversación (I2C). Todos comparten SDA y SCL." },
  },
  // What else a board pin can do (the catalog's pin kinds)
  abilities: {
    digital: "digital",
    pwm: "con ~ (PWM)",
    analog: "analógico",
    sda: "datos I2C",
    scl: "reloj I2C",
    "5v": "5 V",
    "3v3": "3,3 V",
    vin: "VIN",
    gnd: "tierra",
  } as Record<string, string>,
  alsoWorksAs: (list: string[]) => `También sirve como: ${list.join(", ")}.`,

  // --- Why a pin: the reason keys of models/lab/guide.ts ---
  fit: {
    best: "El que mejor encaja",
    ok: "Sirve",
    bad: "No sirve",
  },
  reasons: {
    "power-5v": ({ pin, target }: Words) => `${pin} es la energía de la pieza, y ${target} da los 5 V que necesita.`,
    "power-3v3": ({ pin, target }: Words) => `${pin} se alimenta con 3,3 V, y ${target} los da.`,
    "power-3v3-logic": ({ target }: Words) => `Tu placa trabaja a 3,3 V: alimentar la pieza desde ${target} mantiene todo al mismo voltaje y es lo más seguro.`,
    "power-vin": ({ target }: Words) => `El positivo de las pilas entra a la placa por ${target}.`,
    ground: ({ target }: Words) => `Toda pieza regresa su corriente por ${target}; varias pueden compartirlo.`,
    "signal-digital": ({ target }: Words) => `${target} es un pin digital sencillo: sirve para esto y deja libres los pines especiales (con ~ o A).`,
    "signal-pwm": ({ pin, target }: Words) => `${pin} necesita un pin con ~ (el que da valores intermedios, PWM), y ${target} lo tiene.`,
    "signal-analog": ({ pin, target }: Words) => `${pin} lee un valor y no solo «sí» o «no»; por eso va a un pin analógico como ${target}.`,
    resistorIn: ({ target }: Words) => `Primero ${target} va a la resistencia: ella frena la corriente para que el LED no se queme (220 Ω).`,
    resistorOut: () => "La resistencia se une al LED: la corriente pasa por ella antes de llegar a la luz.",
    "bus-sda": ({ target }: Words) => `${target} es el pin de datos (SDA) por donde se habla con la pantalla (I2C).`,
    "bus-scl": ({ target }: Words) => `${target} es el pin de reloj (SCL) que marca el ritmo de esa conversación (I2C).`,

    fine: () => "Funciona bien para esto.",
    special: ({ target }: Words) => `Funciona, pero ${target} tiene poderes especiales (como los pines con ~, los analógicos A o los de comunicación I2C) que quizá necesites para otra pieza.`,
    delicate: ({ target }: Words) => `Funciona, pero ${target} es delicado en el ESP32: puede impedir que arranque. Mejor usa otro.`,
    levelShift: () => "Funciona, pero este sensor responde con 5 V y tu placa aguanta 3,3 V: necesitas un divisor de voltaje.",
    budget: () => "Funciona, pero entre todas las piezas ya piden más energía de la que da la placa.",
    partLink: () => "Estas dos piezas se pueden unir directo (por ejemplo, el negativo de las pilas con GND).",

    noResistor: () => "Sin resistencia el LED se quema: ve primero a la resistencia de 220 Ω, no directo a la placa.",
    sameAddress: () => "Dos pantallas iguales en el mismo bus contestan con la misma dirección: no se pueden usar juntas.",
    needsBattery: () => "Con esta pieza el servo o el motor pide más energía de la que da la placa: usa un portapilas.",
    inputOnly: ({ target }: Words) => `${target} solo puede leer: no sirve para mandar señal.`,
    wrongKind: ({ target }: Words) => `${target} no sirve para esto: es otro tipo de pin.`,
    signalToPart: () => "Las señales van a la placa, no directo a otra pieza.",
    taken: ({ target }: Words) => `Otra pieza ya usa ${target}: se estorbarían.`,
    overvoltage: () => "Esta pieza solo aguanta 3,3 V: con 5 V se puede quemar.",
    undervoltage: () => "Con esta energía la pieza no alcanza a funcionar: necesita 5 V.",
    short: () => "Juntaría la energía con la tierra: es un cortocircuito y puede quemar algo.",
    mixedPower: () => "Juntaría 5 V con 3,3 V en el mismo cable.",
    boardToBoard: () => "Dos placas no se conectan entre sí aquí.",
    already: () => "Estos dos pines ya están conectados.",
  },
  // Extra advice that goes with a wire
  notes: {
    levelDivider: "Tu placa trabaja a 3,3 V y este sensor responde con 5 V. Pon un divisor de voltaje (una resistencia de 1 kΩ y otra de 2 kΩ) antes de este pin, o quemas la placa.",
    ledResistor: "El LED lleva una resistencia de 220 Ω en serie para que no se queme; sin ella, la revisión lo marca en rojo.",
  },

  // --- The pin tooltip on the bench ---
  tip: {
    pinOf: (pin: string, part: string) => `${pin} · ${part}`,
    where: (text: string) => `Va a: ${text}`,
    wiredTo: (pin: string, part: string) => `Conectado a ${pin} de ${part}`,
    notWired: "Todavía sin conectar",
    bestHere: "Es el que mejor encaja",
    okHere: "Sirve",
    badHere: "No sirve",
    wiringLegend: "Verde: el mejor · Blanco: sirve · Rojo ✕: no sirve",
  },

  // --- The first-time tip in the toolbar while wiring ---
  wiringTip: {
    text: "Elige el pin verde: es el que mejor encaja",
    dismiss: "Entendido",
  },

  // --- The guide card (selected part, step-by-step) ---
  card: {
    region: "Guía de conexión",
    title: "Guía",
    hide: "Ocultar la guía",
    show: "Mostrar la guía",
    pinsTitle: "Qué hace cada pin",
    connectedTo: (pin: string, part: string) => `Conectado a ${pin} de ${part}`,
    missing: "Falta conectar",
    optionalMissing: "Sin conectar",
    allDone: "Todo conectado. ¡Buen trabajo!",
    waysTitle: "Cómo conectarlo",
    showMe: "Muéstrame cómo conectarlo",
    doItForMe: "Conéctalo por mí",
    noBoard: "Primero pon una placa en el banco: es el cerebro al que se conecta todo.",
    boardIntro: "Cada tipo de pin tiene su trabajo",
    boardPins: (n: number) => `${n} ${n === 1 ? "pin" : "pines"}`,
    wiredParts: (n: number) => (n ? `${n} ${n === 1 ? "pieza conectada" : "piezas conectadas"}` : "Ninguna pieza conectada todavía"),
    connectAll: "Conectar todas las piezas",
  },
  guide: {
    title: (part: string) => `Guía: ${part}`,
    step: (n: number, total: number) => `Paso ${n} de ${total}`,
    connect: (pin: string, part: string, target: string, board: string) => `Conecta ${pin} de ${part} con ${target} de ${board}.`,
    already: (pin: string, target: string) => `${pin} ya está conectado a ${target}.`,
    how: "Toca el pin que brilla en la pieza y luego el que brilla en la placa.",
    done: "Hecho",
    next: "Siguiente",
    prev: "Anterior",
    finish: "Terminar",
    doStep: "Hacer este paso por mí",
    exit: "Salir de la guía",
    finished: "Listo: ya conectaste todo lo de esta pieza.",
    nothing: "No encuentro más cables por conectar en esta pieza.",
    here: "Aquí",
    pickLabel: (pin: string) => `Toca ${pin}`,
    thenLabel: (pin: string) => `Luego, ${pin}`,
    stepsLabel: "Pasos de la guía",
    goTo: (n: number) => `Ir al paso ${n}`,
  },
} as const;

export type PinsCopy = typeof pinsCopy;
