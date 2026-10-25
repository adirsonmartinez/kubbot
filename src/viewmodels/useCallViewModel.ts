"use client";

// ViewModel for the voice call with Qubi. Two ways to talk, chosen by start():
// - ElevenLabs (a real voice-to-voice call): if /api/voice answers a signed URL. The lab tools become
//   client tools of the voice agent, so what he is asked by voice happens on the bench.
// - The browser (free, no keys): the person's finished phrases go to `ask(text, { mode: "voice" })`
//   (the chat's agent loop) and the reply is spoken aloud. While he speaks, he does not listen; if the
//   person talks over him, he stops (barge-in).
//
// The orchestrator wires: ask = chat.ask, applyAgentTool = lab.applyAgentTool, onAgentEvent = qubi.onAgentEvent,
// onCallEvent = qubi.onCallEvent (the robot's pose), onTranscript = adds a line to the chat. In browser mode
// the chat's own `ask` already shows both lines in the chat, so onTranscript only fires in ElevenLabs mode.

import { useCallback, useEffect, useReducer, useRef, useSyncExternalStore } from "react";
import { AGENT_TOOL_NAMES, resultText, type AgentOutcome, type AgentToolResult } from "@/models/lab/agentTools";
import type { AgentEvent, CallMode } from "@/models/qubi/types";
import { browserVoiceSupported, createBrowserVoice, VoiceError, type BrowserVoice } from "@/services/voice/browserVoice";
import { openElevenLabs, requestSignedUrl, type ElevenLabsSession } from "@/services/voice/elevenlabsVoice";
import { callErrorCode, callReducer, initialCall, type CallErrorCode } from "@/services/voice/speechText";
import { qubiCopy } from "@/views/copy/qubi";

// What the robot needs to know about the call (the director reads these)
export type CallEvent = { type: "call"; phase: "start" | "listening" | "thinking" | "speaking" | "end"; mode?: CallMode };

export type CallPreference = "auto" | "browser" | "elevenlabs";

export type CallOptions = {
  // The chat's agent loop: sends what the person said and answers Qubi's final text
  ask: (text: string, opts: { mode: "voice" }) => Promise<string>;
  // Runs one lab tool on the bench (the same function the chat uses)
  applyAgentTool: (name: string, input: unknown) => AgentOutcome | AgentToolResult;
  onAgentEvent?: (e: AgentEvent) => void;
  onCallEvent?: (e: CallEvent) => void;
  // A spoken line, to show in the chat (ElevenLabs mode only)
  onTranscript?: (who: "person" | "qubi", text: string) => void;
  // What Qubi should know about the bench when the call starts (ElevenLabs mode), e.g. describeDesign
  context?: () => string;
};

const COPY = qubiCopy.call;
const PROJECT = qubiCopy.greetings.project;

const randomGreeting = (): string => {
  const list = qubiCopy.greetings.call;
  return list[Math.floor(Math.random() * list.length)].replace("{project}", PROJECT);
};

const asOutcomeResult = (value: AgentOutcome | AgentToolResult): AgentToolResult =>
  "result" in value && value.result && typeof value.result === "object" ? (value.result as AgentToolResult) : (value as AgentToolResult);

const partOf = (result: AgentToolResult, input: unknown): string | undefined => {
  const given = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  for (const v of [result.part, result.id, given.part]) if (typeof v === "string" && v) return v;
  return undefined;
};

const noop = () => () => undefined;

export function useCallViewModel(options: CallOptions) {
  const [state, dispatch] = useReducer(callReducer, initialCall);

  // The latest options and state, for callbacks that outlive a render
  const opts = useRef(options);
  const live = useRef(state);
  useEffect(() => {
    opts.current = options;
    live.current = state;
  });

  const run = useRef({ token: 0, voice: null as BrowserVoice | null, eleven: null as ElevenLabsSession | null, busy: false, pending: "", tools: false });

  // Whether the browser can listen. ElevenLabs does not depend on it: start() tries it first.
  const supported = useSyncExternalStore(noop, () => browserVoiceSupported().recognition, () => false);

  const emit = useCallback((phase: CallEvent["phase"], mode?: CallMode) => opts.current.onCallEvent?.({ type: "call", phase, mode }), []);

  const release = useCallback(() => {
    const r = run.current;
    r.token++;
    r.voice?.stop();
    r.voice = null;
    void r.eleven?.end();
    r.eleven = null;
    r.busy = false;
    r.pending = "";
    r.tools = false;
  }, []);

  const fail = useCallback(
    (code: CallErrorCode) => {
      release();
      dispatch({ type: "error", code });
      emit("end");
    },
    [release, emit],
  );

  const stop = useCallback(() => {
    release();
    dispatch({ type: "end" });
    emit("end");
  }, [release, emit]);

  // --- Browser mode ---

  const speakReply = useCallback(
    async (voice: BrowserVoice, token: number, text: string) => {
      dispatch({ type: "activity", activity: "speaking" });
      emit("speaking", "browser");
      await voice.speak(text);
      if (run.current.token !== token) return;
      dispatch({ type: "activity", activity: "listening" });
      emit("listening", "browser");
    },
    [emit],
  );

  const handlePhrase = useCallback(
    async (voice: BrowserVoice, token: number, text: string) => {
      const r = run.current;
      if (r.busy) {
        r.pending = r.pending ? `${r.pending} ${text}` : text; // said while Qubi was still thinking
        return;
      }
      r.busy = true;
      let next: string | null = text;
      while (next && r.token === token) {
        dispatch({ type: "activity", activity: "thinking" });
        emit("thinking", "browser");
        let reply: string;
        try {
          reply = (await opts.current.ask(next, { mode: "voice" })).trim() || COPY.emptyReply;
        } catch {
          reply = qubiCopy.director.error;
        }
        if (r.token !== token) break;
        next = r.pending || null;
        r.pending = "";
        if (next) continue; // the person added something: answer that instead of reading the old reply
        await speakReply(voice, token, reply);
        next = r.pending || null;
        r.pending = "";
      }
      if (r.token === token) r.busy = false;
    },
    [emit, speakReply],
  );

  const startBrowser = useCallback(
    async (token: number) => {
      const voice = createBrowserVoice({
        onInterim: (text) => dispatch({ type: "caption", text }),
        onFinal: (text) => void handlePhrase(voice, token, text),
        onError: (code) => {
          if (run.current.token === token) fail(code);
        },
        onBargeIn: () => {
          if (run.current.token !== token) return;
          dispatch({ type: "activity", activity: "listening" });
          emit("listening", "browser");
        },
      });
      run.current.voice = voice;
      try {
        await voice.start();
      } catch (error) {
        if (run.current.token === token) fail(error instanceof VoiceError ? error.code : (callErrorCode(error) ?? "failed"));
        return;
      }
      if (run.current.token !== token) {
        voice.stop();
        return;
      }
      dispatch({ type: "connected", mode: "browser" });
      emit("start", "browser");
      void speakReply(voice, token, randomGreeting());
    },
    [emit, fail, handlePhrase, speakReply],
  );

  // --- ElevenLabs mode ---

  const runTool = useCallback((name: string, input: unknown): string => {
    const o = opts.current;
    run.current.tools = true;
    o.onAgentEvent?.({ type: "toolStart", name, input });
    const result = asOutcomeResult(o.applyAgentTool(name, input));
    o.onAgentEvent?.({ type: "toolEnd", name, input, ok: result.ok === true, part: partOf(result, input) });
    return resultText(result);
  }, []);

  // Returns true when the call is on; false when ElevenLabs is not available (so the browser can take over)
  const startEleven = useCallback(
    async (token: number, prefer: CallPreference): Promise<boolean> => {
      const signed = await requestSignedUrl();
      if (run.current.token !== token) return true; // hung up meanwhile
      if (!signed.ok) {
        if (prefer === "elevenlabs") fail(signed.reason);
        return prefer === "elevenlabs";
      }
      try {
        const session = await openElevenLabs(signed.signedUrl, {
          tools: AGENT_TOOL_NAMES,
          runTool,
          greeting: randomGreeting(),
          onTranscript: (who, text) => {
            if (run.current.token !== token) return;
            opts.current.onTranscript?.(who, text);
            if (who === "qubi") opts.current.onAgentEvent?.({ type: "reply", text });
            else dispatch({ type: "caption", text });
          },
          onMode: (mode) => {
            if (run.current.token !== token) return;
            dispatch({ type: "activity", activity: mode });
            emit(mode, "elevenlabs");
            if (mode === "listening" && run.current.tools) {
              run.current.tools = false;
              opts.current.onAgentEvent?.({ type: "done" });
            }
          },
          onEnd: (reason) => {
            if (run.current.token !== token) return;
            if (reason === "error") fail("network");
            else stop();
          },
          onError: (code) => {
            if (run.current.token === token) fail(code);
          },
        });
        if (run.current.token !== token) {
          void session.end();
          return true;
        }
        run.current.eleven = session;
        dispatch({ type: "connected", mode: "elevenlabs" });
        emit("start", "elevenlabs");
        const context = opts.current.context?.();
        if (context) session.sendContext(context);
        return true;
      } catch (error) {
        const code = error instanceof VoiceError ? error.code : "failed";
        if (code === "micDenied" || prefer === "elevenlabs") {
          fail(code);
          return true;
        }
        return false; // any other trouble: the browser voice still works
      }
    },
    [emit, fail, runTool, stop],
  );

  // --- Commands ---

  const start = useCallback(
    async (prefer?: CallPreference) => {
      const status = live.current.status;
      if (status === "connecting" || status === "on") return;
      const want: CallPreference = prefer === "browser" || prefer === "elevenlabs" ? prefer : "auto";
      release();
      const token = run.current.token;
      dispatch({ type: "connecting" });
      if (want !== "browser" && (await startEleven(token, want))) return;
      if (run.current.token !== token) return;
      await startBrowser(token);
    },
    [release, startBrowser, startEleven],
  );

  const toggleMute = useCallback(() => {
    const muted = !live.current.muted;
    dispatch({ type: "mute", muted });
    run.current.voice?.setMuted(muted);
    run.current.eleven?.setMuted(muted);
  }, []);

  // Hanging up when the screen goes away
  useEffect(() => release, [release]);

  return { state, start, stop, toggleMute, supported };
}

export type CallViewModel = ReturnType<typeof useCallViewModel>;
