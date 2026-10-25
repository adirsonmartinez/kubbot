// The tour's visible text (Spanish, warm and simple). The ViewModel reads it to build the card.

export const tourCopy = {
  catalog: {
    title: 'El catálogo',
    text: 'Aquí están todas las piezas que puedes usar. Arrastra una al banco o toca una para verla de cerca.',
  },
  bench: {
    title: 'El banco de trabajo',
    text: 'Aquí armas tu circuito. Arrastra las piezas desde el catálogo y conecta los pines.',
  },
  toolbarWire: {
    title: 'Conectar solo',
    text: 'Toca esto y Qubi conecta todo automático: la energía, la tierra y las señales.',
  },
  toolbarSim: {
    title: 'Simular',
    text: 'Mira cómo funciona tu circuito en acción. Los sensores muestran valores y los motores se mueven.',
  },
  toolbarBox: {
    title: 'La caja',
    text: 'Crea una caja imprimible para tu circuito. Puedes verla por dentro o descargar el archivo para imprimirla.',
  },
  toolbarCode: {
    title: 'El código',
    text: 'Genera el código Arduino listo para cargar en tu placa. Lo descargas como archivo .ino.',
  },
  check: {
    title: 'La revisión',
    text: 'Aquí Qubi te avisa si algo está mal conectado. En verde: todo bien. En amarillo: puedes mejorar.',
  },
  chat: {
    title: 'El chat con Qubi',
    text: 'Chatea con Qubi: pídele que revise, que conecte, o que te dé ideas para tu próximo proyecto.',
  },
  qubi: {
    title: 'Qubi',
    text: 'Aquí está Qubi, tu ayudante. Mira cómo camina por el banco y te muestra lo que hace.',
  },
};

export type TourCopyKey = keyof typeof tourCopy;

// The tour's frame: the card's buttons and the offer after the welcome
export const tourUi = {
  step: (n: number, total: number) => `Paso ${n} de ${total}`,
  skip: 'Saltar',
  skipAria: 'Saltar el recorrido',
  prev: 'Anterior',
  prevAria: 'Paso anterior',
  next: 'Siguiente',
  nextAria: 'Siguiente paso',
  last: 'Terminar',
  offerTitle: '¿Quieres un recorrido?',
  offerText: 'En un minuto te muestro dónde está cada cosa del laboratorio.',
  offerYes: 'Sí, vamos',
  offerNo: 'Ahora no',
};