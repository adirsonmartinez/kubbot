// Pure helpers for the voice call: no React, no browser APIs, no fetch, so Node can test them.
// - which speechSynthesis voice to use (rankVoices / pickVoice);
// - turning a chat reply into text that sounds right and cutting it into short chunks (cleanForSpeech,
//   splitSentences), because long utterances get cut off by some browsers;
// - the state of the call (callReducer) and how errors become codes the view translates;
// - the barge-in detector: "is the person talking over Qubi?", from microphone levels.

import type { CallMode, CallState } from "../../models/qubi/types.ts";

// --- Voices ---

export type VoiceInfo = { name: string; lang: string; localService?: boolean; default?: boolean };

// Best first. Qubi is Venezuelan, but any Spanish voice is better than none.
export const VOICE_LANG_ORDER = ["es-VE", "es-US", "es-MX", "es-ES"] as const;
const LANG_WEIGHT = 100; // one step in the order above; bigger than any quality bonus, so the order wins
const OTHER_SPANISH = 20;
const QUALITY = /natural|neural|premium|enhanced|online|google|siri/i;
const QUALITY_BONUS = 45;
const LOCAL_BONUS = 5;

// "es_VE" (Android) and "es-ve" both become "es-VE"; "" if it is not a language tag
export function normalizeLang(lang: string): string {
  const parts = String(lang ?? "").trim().replace(/_/g, "-").split("-");
  const base = parts[0]?.toLowerCase() ?? "";
  if (!base) return "";
  return parts[1] ? `${base}-${parts[1].toUpperCase()}` : base;
}

export const isSpanish = (lang: string): boolean => normalizeLang(lang).split("-")[0] === "es";

// Higher is better; -1 means "not Spanish, never use"
export function voiceScore(voice: VoiceInfo): number {
  const lang = normalizeLang(voice.lang);
  if (!isSpanish(lang)) return -1;
  const at = VOICE_LANG_ORDER.indexOf(lang as (typeof VOICE_LANG_ORDER)[number]);
  let score = at >= 0 ? (VOICE_LANG_ORDER.length - at) * LANG_WEIGHT : OTHER_SPANISH;
  if (QUALITY.test(voice.name)) score += QUALITY_BONUS;
  if (voice.localService) score += LOCAL_BONUS;
  return score;
}

// Only the Spanish voices, best first (ties keep a stable order by name)
export function rankVoices<T extends VoiceInfo>(voices: readonly T[]): T[] {
  return voices
    .map((voice) => ({ voice, score: voiceScore(voice) }))
    .filter((v) => v.score >= 0)
    .sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name))
    .map((v) => v.voice);
}

export const pickVoice = <T extends VoiceInfo>(voices: readonly T[]): T | null => rankVoices(voices)[0] ?? null;

// --- Text to speak ---

// A chat reply to plain speech: no markdown, links, code or emoji, one clean paragraph per line
export function cleanForSpeech(text: string): string {
  return String(text ?? "")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/[*~|]+/g, "")
    .replace(/_+/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const ENDERS = new Set([".", "!", "?", "…"]);
const CLOSERS = new Set(["”", '"', ")", "]", "»", "'"]);

// Cuts text into sentences. A "." between digits (3.3 V) or inside a word is not an end.
function sentencesOf(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n") {
      out.push(text.slice(start, i));
      start = i + 1;
      continue;
    }
    if (!ENDERS.has(ch)) continue;
    let end = i + 1;
    while (end < text.length && (ENDERS.has(text[end]) || CLOSERS.has(text[end]))) end++;
    if (end < text.length && !/\s/.test(text[end])) {
      i = end - 1;
      continue; // "3.3", "hc-sr04.TRIG": not the end of a sentence
    }
    out.push(text.slice(start, end));
    start = end;
    i = end - 1;
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

// A sentence longer than `max` is cut at a comma or semicolon, then at a space, never in a word
function breakLong(sentence: string, max: number): string[] {
  if (sentence.length <= max) return [sentence];
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "));
    if (cut < max * 0.4) cut = window.lastIndexOf(" ");
    const hard = cut <= 0; // one unbroken word: hard cut
    const end = hard ? max : cut + 1;
    pieces.push(rest.slice(0, end).trim());
    rest = rest.slice(end).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

// Short chunks for the voice, in order. Tiny sentences ("¡Listo!") join the next one so the voice does
// not stutter; no chunk is longer than `max` characters (unless it is a single enormous word).
export function splitSentences(text: string, max = 160, min = 28): string[] {
  const chunks: string[] = [];
  for (const sentence of sentencesOf(cleanForSpeech(text))) chunks.push(...breakLong(sentence, max));
  const merged: string[] = [];
  for (const chunk of chunks) {
    const last = merged[merged.length - 1];
    if (last !== undefined && (last.length < min || chunk.length < min) && last.length + 1 + chunk.length <= max) {
      merged[merged.length - 1] = `${last} ${chunk}`;
    } else {
      merged.push(chunk);
    }
  }
  return merged;
}

// --- Errors ---

// What the view translates (copy.call.errors). `noSpeech`: this browser cannot hear; `micDenied`: no
// microphone or no permission; `network`; `noKey`: ElevenLabs was asked for but the server has no key.
export type CallErrorCode = "noSpeech" | "micDenied" | "network" | "noKey" | "failed";

// A SpeechRecognition error code, or an Error from getUserMedia / fetch / the ElevenLabs SDK, to a
// CallErrorCode. null: harmless (the browser reports silence as an error; the call just goes on).
export function callErrorCode(error: unknown): CallErrorCode | null {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object"
        ? `${(error as { error?: unknown }).error ?? ""} ${(error as { name?: unknown }).name ?? ""} ${(error as { message?: unknown }).message ?? ""}`
        : "";
  const text = raw.trim();
  if (/^(no-speech|aborted)$/i.test(text)) return null;
  if (/not-allowed|service-not-allowed|audio-capture|NotAllowed|NotFound|NotReadable|PermissionDenied|permission|microphone|getUserMedia/i.test(text)) return "micDenied";
  if (/language-not-supported|bad-grammar|unsupported/i.test(text)) return "noSpeech";
  if (/network|fetch|websocket|socket|offline|timed? ?out|SessionConnection|ECONN/i.test(text)) return "network";
  return "failed";
}

// --- The call ---

export type CallActivity = "idle" | "listening" | "thinking" | "speaking";
// CallState (the contract) plus what the bar shows: what Qubi is doing and the live caption
export type CallModel = CallState & { activity: CallActivity; caption: string };

export const initialCall: CallModel = { status: "off", mode: null, muted: false, error: null, activity: "idle", caption: "" };

export type CallAction =
  | { type: "connecting" }
  | { type: "connected"; mode: CallMode }
  | { type: "activity"; activity: Exclude<CallActivity, "idle"> }
  | { type: "caption"; text: string }
  | { type: "mute"; muted?: boolean } // no `muted`: toggles
  | { type: "error"; code: CallErrorCode }
  | { type: "end" };

export function callReducer(state: CallModel, action: CallAction): CallModel {
  switch (action.type) {
    case "connecting":
      if (state.status === "connecting" || state.status === "on") return state;
      return { ...initialCall, status: "connecting" };
    case "connected":
      // A late event after hanging up must not bring the call back
      if (state.status !== "connecting") return state;
      return { ...state, status: "on", mode: action.mode, error: null, activity: "listening", caption: "" };
    case "activity":
      if (state.status !== "on" || state.activity === action.activity) return state;
      // The caption is what the person is saying: it ends when Qubi starts to think or speak
      return { ...state, activity: action.activity, caption: action.activity === "listening" ? state.caption : "" };
    case "caption":
      if (state.status !== "on" || state.caption === action.text) return state;
      return { ...state, caption: action.text };
    case "mute": {
      if (state.status !== "on" && state.status !== "connecting") return state;
      const muted = action.muted ?? !state.muted;
      return muted === state.muted ? state : { ...state, muted, caption: muted ? "" : state.caption };
    }
    case "error":
      return { ...initialCall, status: "error", mode: state.mode, error: action.code };
    case "end":
      return initialCall;
  }
}

// --- Barge-in ---

// "Is the person talking over Qubi?" from microphone levels (0..1 RMS, with echo cancellation on) while
// Qubi speaks. The first `graceMs` only measure how much of Qubi's own voice leaks into the microphone;
// after that, the person is talking when the level stays above max(threshold, leak * factor) for `holdMs`.
export type BargeInOptions = { threshold?: number; leakFactor?: number; holdMs?: number; graceMs?: number };

export function createBargeInDetector(options: BargeInOptions = {}) {
  const threshold = options.threshold ?? 0.06;
  const leakFactor = options.leakFactor ?? 2.5;
  const holdMs = options.holdMs ?? 300;
  const graceMs = options.graceMs ?? 500;
  let startedAt: number | null = null;
  let leakSum = 0;
  let leakCount = 0;
  let aboveSince: number | null = null;

  return {
    // Call when Qubi starts to speak
    reset(now: number) {
      startedAt = now;
      leakSum = 0;
      leakCount = 0;
      aboveSince = null;
    },
    // Feed one level; true when the person has been talking long enough
    push(level: number, now: number): boolean {
      if (startedAt === null) this.reset(now);
      if (now - (startedAt ?? now) < graceMs) {
        leakSum += level;
        leakCount++;
        return false;
      }
      const leak = leakCount ? leakSum / leakCount : 0;
      const trigger = Math.max(threshold, leak * leakFactor);
      if (level < trigger) {
        aboveSince = null;
        return false;
      }
      aboveSince ??= now;
      return now - aboveSince >= holdMs;
    },
  };
}
