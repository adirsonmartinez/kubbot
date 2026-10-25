// The welcome interview: Qubi asks what you want to build and what you know, then
// recommends an example project. Pure model — no React, no I/O.

import type { ExampleName } from "../lab/examples.ts";

// What the person answers (each question gets one answer)
export type BuildIntent =
  | "medir distancia"
  | "cuidar plantas"
  | "clima de mi cuarto"
  | "alarma de movimiento"
  | "un robot que se mueve"
  | "otra cosa";

export type ExperienceLevel = "nunca" | "un poco" | "sí";

export type WelcomeAnswer = {
  build: BuildIntent;
  freeText?: string; // only when build === "otra cosa"
  experience: ExperienceLevel;
};

// A recommendation the view passes to the agent
export type WelcomeRecommendation = {
  example: ExampleName | null;
  prompt: string; // what to say to Qubi
  parts: string[]; // catalog IDs to suggest
};

// Internal step: 0 = not started, 1 = asked first question, 2 = asked second, 3 = done
export type WelcomeState = {
  step: 0 | 1 | 2 | 3;
  answer: WelcomeAnswer | null;
  recommendation: WelcomeRecommendation | null;
};

const OFF: WelcomeState = { step: 0, answer: null, recommendation: null };

// Actions for the reducer
type WelcomeAction =
  | { type: "answer-build"; value: BuildIntent; freeText?: string }
  | { type: "answer-experience"; value: ExperienceLevel }
  | { type: "back" }
  | { type: "skip" };

// Pure reducer that advances the interview
export function welcomeReducer(state: WelcomeState, action: WelcomeAction): WelcomeState {
  if (action.type === "skip") return { ...OFF, step: 3 };
  if (action.type === "back") return state.step === 1 ? OFF : state.step === 3 && state.answer ? { ...OFF, step: 1, answer: state.answer } : state;

  if (state.step === 0 && action.type === "answer-build") {
    const answer: WelcomeAnswer = {
      build: action.value,
      experience: "nunca",
    };
    if (action.value === "otra cosa" && action.freeText) {
      answer.freeText = action.freeText;
    }
    return { ...OFF, step: 1, answer };
  }

  if (state.step === 1 && action.type === "answer-experience") {
    const recommendation = recommend({ ...state.answer!, experience: action.value });
    return { step: 3, answer: { ...state.answer!, experience: action.value }, recommendation };
  }

  return state;
}

// Decide the recommendation from the answers
export function recommend(answers: { build: BuildIntent; freeText?: string; experience: ExperienceLevel }): WelcomeRecommendation {
  const level = answers.experience;
  const intro = introFor(level);

  switch (answers.build) {
    case "medir distancia":
      return {
        example: "parkingSensor",
        prompt: `${intro}\n\nQuiero armar un sensor de estacionamiento: que un servo gire y el sensor de distancia mida a qué está la pared. Muestra la distancia en la pantalla.`,
        parts: ["hc-sr04", "servo-sg90", "oled-128x64", "led"],
      };
    case "cuidar plantas":
      return {
        example: "plantWaterer",
        prompt: `${intro}\n\nQuiero armar un sistema de riego: que una planta mida si la tierra está seca y un relé encienda una bomba. Un LED avisa cuando riega.`,
        parts: ["soil", "relay", "led", "battery-aa4"],
      };
    case "clima de mi cuarto":
      return {
        example: "weatherStation",
        prompt: `${intro}\n\nQuiero armar una estación del clima: que un sensor lea la temperatura y la humedad y las muestre en una pantalla OLED.`,
        parts: ["dht22", "oled-128x64"],
      };
    case "alarma de movimiento":
      return {
        example: "parkingSensor",
        prompt: `${intro}\n\nQuiero armar una alarma de movimiento: que un sensor PIR detecte cuando alguien pasa y un zumbador suene.`,
        parts: ["pir", "buzzer", "battery-aa4"],
      };
    case "un robot que se mueve":
      return {
        example: "parkingSensor",
        prompt: `${intro}\n\nQuiero armar un robot que se mueva y no choque: que un sensor de distancia mida adelante y un motor gire para esquivar.`,
        parts: ["hc-sr04", "servo-sg90", "l298n", "battery-aa4", "led"],
      };
    case "otra cosa": {
      const text = answers.freeText || "no lo sé";
      return {
        example: null,
        prompt: `${intro}\n\nMe gustaría armar algo como esto: "${text}". ¿Qué piezas me sugieres y cómo lo armo?`,
        parts: [],
      };
    }
    default:
      return { example: null, prompt: `${intro}\n\n¿Qué me sugieres armar?`, parts: [] };
  }
}

function introFor(level: ExperienceLevel): string {
  switch (level) {
    case "nunca":
      return "Hola Qubi, nunca armé nada con Arduino y quiero aprender desde cero.";
    case "un poco":
      return "Hola Qubi, ya hice algo pequeño con Arduino y quiero avanzar.";
    case "sí":
      return "Hola Qubi, ya tengo experiencia con Arduino y quiero armar algo más avanzado.";
  }
}