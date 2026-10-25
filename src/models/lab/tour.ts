// Pure tour model for the lab's welcome walkthrough.
// Types, reducer, and the "should we offer this tour?" helper.

export type TourStep = {
  id: string;
  target: string; // value of the data-tour attribute on the element to highlight
  placement: "top" | "bottom" | "left" | "right";
  title: string;
  text: string;
};

export type TourState = {
  active: boolean;
  step: number; // 0-based index into steps, or -1 when not active
  steps: TourStep[];
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "catalog",
    target: "catalog",
    placement: "right",
    title: "El catálogo",
    text: "Acá están todas las piezas que podés usar. Arrastrá una al banco o tocá una para verla de cerca.",
  },
  {
    id: "bench",
    target: "bench",
    placement: "top",
    title: "El banco de trabajo",
    text: "Acá armás tu circuito. Arrastrá las piezas desde el catálogo y conectá los pines.",
  },
  {
    id: "toolbar-wire",
    target: "toolbar-wire",
    placement: "bottom",
    title: "Conectar solo",
    text: "Apretá esto y Qubi conecta todo automático: la energía, tierra y señales.",
  },
  {
    id: "toolbar-sim",
    target: "toolbar-sim",
    placement: "bottom",
    title: "Simular",
    text: "Mirá cómo funciona tu circuito en acción. Los sensores muestran valores y los motores se mueven.",
  },
  {
    id: "toolbar-box",
    target: "toolbar-box",
    placement: "bottom",
    title: "La caja",
    text: "Creá una caja imprimible para tu circuito. Podés verla por dentro o descargar el archivo STL.",
  },
  {
    id: "toolbar-code",
    target: "toolbar-code",
    placement: "bottom",
    title: "El código",
    text: "Generá el código Arduino listo para cargar en tu placa. Lo descargás como archivo .ino.",
  },
  {
    id: "check",
    target: "check",
    placement: "left",
    title: "La revisión",
    text: "Acá Qubi te avisa si algo está mal conectado. En verde: todo bien. En amarillo: podés mejorar.",
  },
  {
    id: "chat",
    target: "chat",
    placement: "left",
    title: "El chat con Qubi",
    text: "Chateá con Qubi: pedile que revise, conecte, o que te dé ideas para tu próximo proyecto.",
  },
  {
    id: "qubi",
    target: "qubi",
    placement: "top",
    title: "Qubi",
    text: "Acá está Qubi, tu ayudante. Mirá cómo camina por el banco y te muestra lo que hace.",
  },
];

export const INITIAL_STATE: TourState = {
  active: false,
  step: -1,
  steps: TOUR_STEPS,
};

export type TourAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "prev" }
  | { type: "skip" }
  | { type: "finish" };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { ...state, active: true, step: 0 };
    case "next":
      if (!state.active) return state;
      if (state.step < state.steps.length - 1) {
        return { ...state, step: state.step + 1 };
      }
      return { ...state, active: false, step: state.steps.length };
    case "prev":
      if (state.step > 0) {
        return { ...state, step: state.step - 1 };
      }
      return state;
    case "skip":
      return { ...INITIAL_STATE };
    case "finish":
      return { ...INITIAL_STATE };
    default:
      return state;
  }
}

export function shouldOfferTour(seen: boolean): boolean {
  return !seen;
}

export function isTourComplete(state: TourState): boolean {
  return !state.active || state.step >= state.steps.length;
}