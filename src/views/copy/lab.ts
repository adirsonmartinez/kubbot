// The lab's copy, in plain Spanish for people who do not know electronics. Views read it; code,
// comments and identifiers stay in English.

export const labCopy = {
  title: 'Laboratorio',
  tab: 'Laboratorio',
  tabInfo: (parts: number, issues: number) => `${parts} ${parts === 1 ? 'pieza' : 'piezas'} · ${issues ? `${issues} por revisar` : 'todo bien conectado'}`,
  railInfo: 'Arrastra placas, sensores y motores al banco y conéctalos.',

  // --- The catalog (side panel, where the explorer was) ---
  catalog: {
    title: 'Catálogo',
    intro: 'Arrastra una pieza al banco, o tócala para ponerla en el centro.',
    search: 'Buscar pieza…',
    empty: 'No hay piezas con ese nombre.',
    add: (name: string) => `Poner ${name} en el banco`,
    pins: (n: number) => `${n} ${n === 1 ? 'pin' : 'pines'}`,
    mA: (n: number) => `${n} mA`,
    volts: ([min, max]: [number, number]) => (min === max ? `${min} V` : `${min}–${max} V`),
    license: (name: string, license: string) => `Medidas: ${name} (${license})`,
    noProject: 'Abre o crea un proyecto para armar tu circuito.',
  },
  categories: {
    boards: 'Placas',
    sensors: 'Sensores',
    actuators: 'Motores y salidas',
    displays: 'Pantallas',
    inputs: 'Botones y perillas',
    power: 'Energía',
  },
  parts: {
    'arduino-uno': { name: 'Arduino Uno', desc: 'La placa clásica para empezar: 5 V, 14 pines digitales y 6 analógicos.' },
    'arduino-nano': { name: 'Arduino Nano', desc: 'Lo mismo que el Uno, en pequeño: cabe en cualquier caja.' },
    'esp32-devkit': { name: 'ESP32', desc: 'Con wifi y bluetooth, trabaja a 3,3 V.' },
    pico: { name: 'Raspberry Pi Pico', desc: 'Pequeña, rápida y barata; trabaja a 3,3 V.' },
    'hc-sr04': { name: 'Sensor de distancia', desc: 'Mide a qué distancia está algo, con ultrasonido (HC-SR04).' },
    pir: { name: 'Sensor de movimiento', desc: 'Avisa cuando alguien pasa cerca (PIR).' },
    dht22: { name: 'Temperatura y humedad', desc: 'Mide la temperatura y la humedad del aire (DHT22).' },
    soil: { name: 'Humedad de la tierra', desc: 'Dice si una planta necesita agua.' },
    ldr: { name: 'Sensor de luz', desc: 'Mide cuánta luz hay.' },
    'servo-sg90': { name: 'Servo', desc: 'Un motor pequeño que gira a un ángulo exacto (SG90).' },
    relay: { name: 'Relé', desc: 'Prende y apaga cosas grandes, como una lámpara o una bomba.' },
    buzzer: { name: 'Zumbador', desc: 'Hace pitidos y melodías sencillas.' },
    led: { name: 'LED', desc: 'Una luz pequeña que prende, apaga o parpadea.' },
    l298n: { name: 'Control de motores', desc: 'Mueve dos motores de ruedas hacia adelante y hacia atrás (L298N).' },
    'oled-128x64': { name: 'Pantalla OLED', desc: 'Una pantalla pequeña para mostrar texto y dibujos.' },
    'lcd-1602-i2c': { name: 'Pantalla LCD', desc: 'Dos líneas de texto, fácil de leer.' },
    button: { name: 'Botón', desc: 'Lo que pasa cuando alguien lo aprieta.' },
    potentiometer: { name: 'Perilla', desc: 'Una perilla que gira para subir o bajar un valor.' },
    'battery-aa4': { name: 'Portapilas 4×AA', desc: 'Energía sin cable: 6 V para la placa.' },
  },

  // --- The bench (3D view) ---
  bench: {
    empty: 'Tu banco está vacío. Arrastra una placa desde el catálogo para empezar.',
    dropHere: 'Suelta para ponerla en el banco',
    wiring: (part: string, pin: string) => `Conectando ${pin} de ${part}: toca el pin de destino. Esc para cancelar.`,
    selected: (name: string) => `${name} seleccionada`,
    rotate: 'Girar',
    remove: 'Quitar',
    autoWire: 'Conectar solo',
    autoWired: (n: number) => (n ? `Listo: ${n} ${n === 1 ? 'cable' : 'cables'} nuevos.` : 'Ya estaba todo conectado.'),
    autoWireMissing: (pins: string[]) => `No encontré dónde conectar: ${pins.join(', ')}.`,
    noBoardForWire: 'Primero pon una placa en el banco.',
    removeWire: 'Quitar cable',
    connectRefused: {
      unknown: 'Ese pin no existe.',
      same: 'Elige otro pin: es el mismo.',
      duplicate: 'Esos dos pines ya están conectados.',
      full: 'El banco ya tiene demasiados cables.',
    },
    saved: 'Guardado',
    saveFailed: 'No pude guardar el circuito. Prueba otra vez.',
    loadFailed: 'El archivo del circuito tenía partes rotas: las quité.',
    pinTip: (part: string, pin: string) => `${pin} · ${part}`,
  },

  // --- The checker's findings (circuitModel.checkDesign), in plain words ---
  check: {
    title: 'Revisión del circuito',
    ok: 'Todo está bien conectado.',
    summary: (red: number, yellow: number) => [red && `${red} ${red === 1 ? 'peligro' : 'peligros'}`, yellow && `${yellow} por revisar`].filter(Boolean).join(' · '),
    issues: {
      short: () => 'Cortocircuito: la energía va directo a tierra. Puede quemar la placa.',
      mixedPower: () => 'Se juntaron 5 V y 3,3 V en el mismo cable.',
      overvoltage: (part: string) => `${part} es de 3,3 V y está conectada a 5 V: se puede quemar.`,
      undervoltage: (part: string) => `${part} necesita 5 V y le llegan 3,3 V: puede no funcionar.`,
      missing: (part: string, pin: string) => `A ${part} le falta conectar ${pin}.`,
      wrongPin: (part: string, pin: string) => `${pin} de ${part} está en un pin que no sirve para eso.`,
      pinShared: (part: string, pin: string, boardPin: string) => `${pin} de ${part} comparte el pin ${boardPin} con otra pieza.`,
      level: (part: string, pin: string) => `${pin} de ${part} manda 5 V a una placa de 3,3 V: usa un divisor de voltaje.`,
      budget: (part: string, used: number, budget: number) => `La placa da ${budget} mA y le piden ${used} mA: usa una fuente aparte.`,
      noBoard: () => 'Falta una placa que controle las piezas.',
    },
    fix: 'Arreglar con Qubi',
  },

  // --- Simulation (the bench comes alive) ---
  sim: {
    start: 'Simular',
    stop: 'Detener',
    running: 'Simulando…',
    blocked: 'Arregla los peligros en rojo antes de simular.',
    distance: (cm: number) => `${cm} cm`,
    temperature: (c: number, h: number) => `${c} °C · ${h} %`,
    angle: (deg: number) => `${deg}°`,
    on: 'Encendido',
    off: 'Apagado',
  },

  // --- Printable parts (the enclosure) ---
  enclosure: {
    title: 'Caja para imprimir',
    make: 'Crear la caja',
    show: 'Ver la caja',
    hide: 'Ocultar la caja',
    explode: 'Ver por dentro',
    exportStl: 'Descargar STL',
    exportScad: 'Descargar OpenSCAD',
    saved: (file: string) => `Guardé ${file} en tu proyecto.`,
    noBoard: 'Pon una placa en el banco para hacer su caja.',
    size: (w: number, d: number, h: number) => `${w} × ${d} × ${h} mm`,
    print: (minutes: number, grams: number) => `Unas ${Math.round(minutes / 60 * 10) / 10} h de impresión · ${grams} g de PLA`,
  },

  // --- Code for the board ---
  sketch: {
    make: 'Crear el código',
    saved: (file: string) => `El código está en ${file}.`,
    noBoard: 'Pon una placa en el banco para crear su código.',
  },

  // --- Chat chips (the chat specialized in Arduino) ---
  chips: {
    ideas: '¿Qué puedo construir?',
    review: 'Revisa mis conexiones',
    wireIt: 'Conéctalo tú',
    enclosure: 'Hazle una caja',
  },
  prompts: {
    ideas: '¿Qué puedo construir con las piezas que tengo en el banco? Dame 3 ideas sencillas y arma la que más te guste.',
    review: 'Revisa las conexiones de mi circuito y arregla lo que esté mal.',
    wireIt: 'Conecta todas las piezas del banco a la placa de la forma correcta.',
    enclosure: 'Hazle una caja imprimible a mi circuito.',
  },

  // --- The lab's panel UI (catalog, toolbar, drop) ---
  panel: {
    toolbar: 'Herramientas del banco',
    enclosure: 'Caja',
    partLabel: (name: string, n: number) => `${name} ${n}`,
    showPart: (part: string) => `Ver ${part} en el banco`,
    dropPart: (name: string) => `Soltar ${name} aquí`,
  },
  // --- The lab view model's own notices ---
  viewModel: {
    exportFailed: 'No pude guardar el archivo. Prueba otra vez.',
    notReady: 'Esta parte del laboratorio todavía no está lista.',
  },
  // --- useLabViewModel's notices ---
  labViewModel: {
    downloaded: (file: string) => `Descargué ${file}.`,
    importFailed: 'No pude leer ese archivo. Elige un circuito guardado por Qubbot.',
  },
  // --- The catalog, review and toolbar components (views/components/lab) ---
  labUi: {
    results: (n: number) => `${n} ${n === 1 ? 'pieza encontrada' : 'piezas encontradas'}`,
    budget: (board: string) => `Energía de ${board}`,
    budgetValue: (used: number, budget: number) => `${used} de ${budget} mA`,
    boxMenu: 'Opciones de la caja',
    insideOn: 'Quitar la vista por dentro',
    selectedPart: (name: string) => `Pieza elegida: ${name}`,
  },
  // --- The chat agent (useChatViewModel, agentService, models/lab/assistant) ---
  agent: {
    noAi: 'sin IA',
    noAiNote: 'Estoy respondiendo con reglas sencillas, sin inteligencia artificial.',
    failed: 'No pude responder. Intenta de nuevo.',
    refused: 'No puedo ayudar con eso, pero con gusto te ayudo con tu circuito.',
    cutOff: 'Mi respuesta se cortó. Pídeme que siga.',
    tooManySteps: 'Hice varias cosas seguidas y me detuve. Dime si sigo.',
    cards: {
      add: (name: string) => `Puse ${name} en el banco`,
      connect: (from: string, to: string) => `Conecté ${from} con ${to}`,
      autoWire: (n: number) => (n ? `Conecté ${n} ${n === 1 ? 'cable' : 'cables'}` : 'Ya estaba todo conectado'),
      removePart: (name: string) => `Quité ${name}`,
      removeWire: 'Quité un cable',
      simulate: 'Empecé la simulación',
      enclosure: 'Preparé la caja',
      sketch: 'Creé el código',
      pin: (pin: string, name: string) => `${pin} de ${name}`,
    },
    // Rule-based assistant, used when there is no AI key
    assistant: {
      hint: 'Puedo darte ideas ("¿qué puedo construir?"), conectar todo ("conecta todo"), revisar tus cables ("revisa") o preparar la caja y el código. Cuéntame qué quieres hacer.',
      noBoard: 'Primero pon una placa en el banco, como el Arduino Uno. Después te ayudo con lo demás.',
      nothingToWire: 'Solo veo la placa. Agrega sensores o motores y los conecto.',
      wiring: 'Listo, conecto todo a la placa.',
      allGood: 'Todo está bien conectado. No encuentro problemas.',
      issuesIntro: (n: number) => (n === 1 ? 'Encontré 1 cosa por revisar:' : `Encontré ${n} cosas por revisar:`),
      ideasIntro: (have: string[]) => `Con lo que tienes en el banco (${have.join(', ')}) puedes armar:`,
      ideasEmpty: 'Tu banco está vacío. Estas ideas son fáciles para empezar; arrastra las piezas desde el catálogo:',
      ideaReady: 'Ya tienes todo.',
      ideaMissing: (names: string[]) => `Te falta: ${names.join(', ')}.`,
      ideas: {
        distanceAlarm: 'Alarma de distancia: suena cuando algo se acerca.',
        plantCare: 'Aviso de riego: una luz te dice cuándo la planta tiene sed.',
        nightLight: 'Luz de noche: se prende sola cuando oscurece.',
        motionLight: 'Luz con movimiento: se prende cuando alguien pasa.',
        weatherStation: 'Estación del clima: muestra la temperatura y la humedad en una pantalla.',
        radar: 'Radar: un servo gira y mide distancias.',
        knobServo: 'Servo con perilla: lo giras con la mano y el servo te sigue.',
        robotCar: 'Carrito que esquiva: avanza y frena cuando ve algo adelante.',
        doorbell: 'Timbre: suena cuando alguien aprieta el botón.',
      },
      simulating: 'Empiezo la simulación.',
      simulateBlocked: 'Arregla primero los peligros en rojo; así no simulo algo que se puede quemar.',
      enclosure: 'Preparo la caja para imprimir.',
      sketch: 'Creo el código para tu placa.',
    },
  },
} as const;
