// Voice in the browser, free and with no keys: the Web Speech API listens (SpeechRecognition) and
// speaks (speechSynthesis). The call view model wires it to the chat.
//
// - Listening is continuous with interim results (the live caption). Final phrases go to `onFinal`.
// - While Qubi speaks the recognizer is paused, so he does not hear himself.
// - Barge-in: while he speaks, a second microphone stream (with echo cancellation) is measured; when the
//   person talks over him, the speech is cancelled and listening resumes (see createBargeInDetector).
// - No recognizer in this browser: `browserVoiceSupported().recognition` is false and start() fails with
//   the code `noSpeech`.

import {
  callErrorCode,
  createBargeInDetector,
  normalizeLang,
  pickVoice,
  splitSentences,
  type CallErrorCode,
} from "./speechText";

// --- The slice of the Web Speech API this file uses (lib.dom has no SpeechRecognition types) ---

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: { length: number; [index: number]: RecognitionResult } };
type RecognitionErrorEvent = { error: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function browserVoiceSupported(): { recognition: boolean; synthesis: boolean } {
  return {
    recognition: recognitionCtor() !== null,
    synthesis: typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined",
  };
}

// --- The voice ---

export const PRIMARY_LANG = "es-VE";
export const FALLBACK_LANG = "es-ES";
const RESTART_MS = 250; // Chrome ends the recognizer after silence; restart it quickly
const STORM_LIMIT = 6; // restarts that end at once, in a row, before giving up
const STORM_MS = 400;
const VOICES_WAIT_MS = 600;
const LEVEL_EVERY_MS = 50;

// What start() throws: the code is what the view translates
export class VoiceError extends Error {
  readonly code: CallErrorCode;
  constructor(code: CallErrorCode) {
    super(code);
    this.name = "VoiceError";
    this.code = code;
  }
}

export type BrowserVoiceEvents = {
  onInterim: (text: string) => void; // what the person is saying right now
  onFinal: (text: string) => void; // a finished phrase
  onError: (code: CallErrorCode) => void; // fatal: the call cannot go on
  onBargeIn?: () => void; // the person talked over Qubi (speech is already cancelled)
};

export type BrowserVoice = {
  start(): Promise<void>; // asks for the microphone; throws a VoiceError on failure
  stop(): void;
  setMuted(muted: boolean): void;
  speak(text: string): Promise<void>; // resolves when finished or cancelled
  cancelSpeech(): void;
  isSpeaking(): boolean;
};

export function createBrowserVoice(events: BrowserVoiceEvents): BrowserVoice {
  let recognition: Recognition | null = null;
  let lang: string = PRIMARY_LANG;
  let active = false; // the call is on
  let muted = false;
  let speaking = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;
  let fastEnds = 0;
  let lastStart = 0;
  let speechToken = 0; // a new value cancels whatever was being spoken
  let voice: SpeechSynthesisVoice | null = null;

  // The barge-in microphone
  let stream: MediaStream | null = null;
  let audio: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let levelTimer: ReturnType<typeof setInterval> | null = null;
  const detector = createBargeInDetector();

  const wantsListening = () => active && !muted && !speaking;

  // --- Listening ---

  function stopRecognition() {
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    const r = recognition;
    recognition = null;
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    try {
      r.abort();
    } catch {
      /* already stopped */
    }
  }

  function startRecognition() {
    if (!wantsListening() || recognition) return;
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript ?? "";
        if (e.results[i].isFinal) {
          const text = piece.trim();
          if (text) {
            events.onInterim("");
            events.onFinal(text);
          }
        } else {
          interim += piece;
        }
      }
      if (interim.trim()) events.onInterim(interim.trim());
    };
    r.onerror = (e) => {
      if (e.error === "language-not-supported" && lang !== FALLBACK_LANG) {
        lang = FALLBACK_LANG; // es-VE is not offered here: es-ES is
        return;
      }
      const code = callErrorCode(e.error);
      if (code) fail(code);
    };
    r.onend = () => {
      if (recognition !== r) return;
      recognition = null;
      const now = Date.now();
      fastEnds = now - lastStart < STORM_MS ? fastEnds + 1 : 0;
      if (fastEnds >= STORM_LIMIT) {
        fail("failed");
        return;
      }
      if (wantsListening()) restartTimer = setTimeout(startRecognition, RESTART_MS);
    };
    recognition = r;
    lastStart = Date.now();
    try {
      r.start();
    } catch {
      recognition = null;
      restartTimer = setTimeout(startRecognition, RESTART_MS * 2);
    }
  }

  function fail(code: CallErrorCode) {
    if (!active) return;
    teardown();
    events.onError(code);
  }

  // --- Barge-in microphone ---

  async function openLevelMeter() {
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!media?.getUserMedia) return;
    stream = await media.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio = new Ctx();
    analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    audio.createMediaStreamSource(stream).connect(analyser);
  }

  function startWatching() {
    if (!analyser || levelTimer) return;
    const node = analyser;
    const buffer = new Float32Array(node.fftSize);
    detector.reset(Date.now());
    levelTimer = setInterval(() => {
      if (!speaking || muted) return;
      node.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
      if (detector.push(Math.sqrt(sum / buffer.length), Date.now())) {
        cancelSpeech();
        events.onBargeIn?.();
      }
    }, LEVEL_EVERY_MS);
  }

  function stopWatching() {
    if (levelTimer) clearInterval(levelTimer);
    levelTimer = null;
  }

  // --- Speaking ---

  async function chooseVoice(): Promise<SpeechSynthesisVoice | null> {
    const synth = window.speechSynthesis;
    if (voice) return voice;
    let voices = synth.getVoices();
    if (!voices.length) {
      // Chrome loads the voice list late
      await new Promise<void>((resolve) => {
        const done = () => {
          synth.removeEventListener("voiceschanged", done);
          resolve();
        };
        synth.addEventListener("voiceschanged", done);
        setTimeout(done, VOICES_WAIT_MS);
      });
      voices = synth.getVoices();
    }
    voice = pickVoice(voices);
    return voice;
  }

  function speakChunk(text: string, chosen: SpeechSynthesisVoice | null, token: number): Promise<void> {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (chosen) u.voice = chosen;
      u.lang = chosen ? normalizeLang(chosen.lang) || PRIMARY_LANG : PRIMARY_LANG;
      u.rate = 1.03;
      u.pitch = 1;
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(guard);
        resolve();
      };
      // Some browsers never fire `end` for a cancelled utterance: do not wait forever
      const guard = setTimeout(done, Math.max(4000, text.length * 120));
      u.onend = done;
      u.onerror = done;
      if (token !== speechToken) return done();
      window.speechSynthesis.speak(u);
    });
  }

  async function speak(text: string): Promise<void> {
    if (!browserVoiceSupported().synthesis) return;
    const chunks = splitSentences(text);
    if (!chunks.length) return;
    const token = ++speechToken;
    window.speechSynthesis.cancel();
    speaking = true;
    stopRecognition(); // so he does not hear himself
    events.onInterim("");
    startWatching();
    try {
      const chosen = await chooseVoice();
      for (const chunk of chunks) {
        if (token !== speechToken) break;
        await speakChunk(chunk, chosen, token);
      }
    } finally {
      if (token === speechToken) {
        speaking = false;
        stopWatching();
        if (active) startRecognition();
      }
    }
  }

  function cancelSpeech() {
    speechToken++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    if (speaking) {
      speaking = false;
      stopWatching();
      if (active) startRecognition();
    }
  }

  // --- Lifecycle ---

  function teardown() {
    active = false;
    cancelSpeech();
    stopWatching();
    stopRecognition();
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
    void audio?.close().catch(() => undefined);
    audio = null;
  }

  return {
    async start() {
      if (active) return;
      if (!recognitionCtor()) throw new VoiceError("noSpeech");
      active = true;
      try {
        await openLevelMeter(); // asks for the microphone now, so a refusal shows up before anything else
      } catch (error) {
        active = false;
        throw new VoiceError(callErrorCode(error) ?? "micDenied");
      }
      startRecognition();
    },
    stop: teardown,
    setMuted(value) {
      muted = value;
      stream?.getAudioTracks().forEach((t) => (t.enabled = !value));
      if (value) {
        stopRecognition();
        events.onInterim("");
      } else {
        startRecognition();
      }
    },
    speak,
    cancelSpeech,
    isSpeaking: () => speaking,
  };
}
