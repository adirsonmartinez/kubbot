// Voice with ElevenLabs Conversational AI: a real voice-to-voice call. The server route (/api/voice)
// owns the key and answers a signed URL; this file opens the session with the official SDK and gives
// Qubi's lab tools to the voice agent as client tools, so what he is asked by voice really happens on
// the bench. The key never reaches the browser.

import { callErrorCode, type CallErrorCode } from "./speechText";
import { VoiceError } from "./browserVoice";

export type SignedUrlResult = { ok: true; signedUrl: string } | { ok: false; reason: "noKey" | "network" | "failed" };

// Asks the server for a signed URL. 503: the server has no ElevenLabs key (the browser voice takes over).
export async function requestSignedUrl(fetchFn: typeof fetch = fetch, signal?: AbortSignal): Promise<SignedUrlResult> {
  try {
    const response = await fetchFn("/api/voice", { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal });
    if (response.status === 503) return { ok: false, reason: "noKey" };
    if (!response.ok) return { ok: false, reason: "failed" };
    const data = (await response.json()) as { signedUrl?: unknown };
    return typeof data.signedUrl === "string" && data.signedUrl.startsWith("wss://")
      ? { ok: true, signedUrl: data.signedUrl }
      : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "network" };
  }
}

export type ElevenLabsHandlers = {
  // Every lab tool name the voice agent may call
  tools: readonly string[];
  // Runs one tool on the bench and answers the text the voice agent receives
  runTool: (name: string, input: unknown) => Promise<string> | string;
  // The greeting for this call (the agent's first message is "{{greeting}}")
  greeting?: string;
  onTranscript: (who: "person" | "qubi", text: string) => void;
  onMode: (mode: "speaking" | "listening") => void;
  onEnd: (reason: "user" | "agent" | "error") => void;
  onError: (code: CallErrorCode) => void;
};

export type ElevenLabsSession = {
  end(): Promise<void>;
  setMuted(muted: boolean): void;
  // Tells the agent something about the bench without making it speak
  sendContext(text: string): void;
};

// Opens the call. Throws a VoiceError (micDenied, network, failed) when it cannot connect.
export async function openElevenLabs(signedUrl: string, handlers: ElevenLabsHandlers): Promise<ElevenLabsSession> {
  const { Conversation, stripAudioTags } = await import("@elevenlabs/client");
  const clientTools: Record<string, (parameters: unknown) => Promise<string>> = {};
  for (const name of handlers.tools) {
    clientTools[name] = async (parameters) => handlers.runTool(name, parameters ?? {});
  }
  try {
    const conversation = await Conversation.startSession({
      signedUrl,
      connectionType: "websocket",
      textOnly: false,
      clientTools,
      ...(handlers.greeting ? { dynamicVariables: { greeting: handlers.greeting } } : {}),
      onModeChange: ({ mode }) => handlers.onMode(mode),
      onMessage: ({ message, role }) => {
        const text = stripAudioTags(String(message ?? "")).trim();
        if (text) handlers.onTranscript(role === "agent" ? "qubi" : "person", text);
      },
      // A failed tool is answered to the agent by the SDK and the call goes on: only connection errors end it
      onError: (message, context) => {
        if ((context as { clientToolName?: unknown } | undefined)?.clientToolName) return;
        const code = callErrorCode(message);
        if (code) handlers.onError(code);
      },
      onDisconnect: (details) => handlers.onEnd(details.reason === "error" ? "error" : details.reason),
    });
    return {
      end: () => conversation.endSession().catch(() => undefined),
      setMuted: (muted) => conversation.setMicMuted(muted),
      sendContext: (text) => conversation.sendContextualUpdate(text),
    };
  } catch (error) {
    throw new VoiceError(callErrorCode(error) ?? "failed");
  }
}
