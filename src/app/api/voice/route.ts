// The voice call's route. With ELEVENLABS_API_KEY on the server it makes sure Qubi's ElevenLabs
// Conversational AI agent exists (created, or updated when its configuration changed) and answers
// { signedUrl }, a short-lived URL the browser opens a call with. Without a key it answers 503 and the
// browser voice takes over. The key stays on the server and is never logged or sent.
//
// The agent is "private" (only reachable with a signed URL). Its client tools are the lab's own tools
// (AGENT_TOOLS), which the browser runs on the bench. The agent's configuration carries a hash in a tag
// (`qubi-<hash>`), so a restart reuses the agent and a new prompt, tool or voice updates it.

import { createHash } from "node:crypto";
import { COMPONENTS } from "@/models/lab/catalog";
import { AGENT_TOOLS, type AgentToolSchema } from "@/models/lab/agentTools";
import { clientKey, createLimiter } from "@/lib/rateLimit";
import { readBody } from "@/lib/readBody";
import { voiceFailure } from "@/lib/voiceFailure";
import { labCopy } from "@/views/copy/lab";
import { qubiCopy } from "@/views/copy/qubi";

const API = "https://api.elevenlabs.io";
const AGENT_NAME = "Qubi · Qubbot Lab";
const TAG_PREFIX = "qubi-";
const TTS_MODEL = process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_v4_turbo";
const LLM = process.env.ELEVENLABS_LLM?.trim() || "gemini-2.5-flash"; // fast: a voice turn cannot wait
const TOOL_TIMEOUT_SECS = 20;
const REQUEST_TIMEOUT_MS = 15_000;

// The Venezuelan voice "Juan" of the public library (as in the Electron app). It has to be in the
// account; if it cannot be added, the premade fallback voice is used so the call never fails over it.
const JUAN = { id: "GRGd9ooJazPy9jV7czfS", owner: "ef2f1a10114f060c2070a37c6a1882c5fe07bff3f111d07a8d99d2c55c7f4031", name: "Juan (Qubi)" };
const FALLBACK_VOICE = "JBFqnCBsd6RMkjVDRZzb";

// What the browser needs from the conversation (the SDK only handles the events listed)
const CLIENT_EVENTS = [
  "conversation_initiation_metadata",
  "ping",
  "audio",
  "interruption",
  "user_transcript",
  "agent_response",
  "agent_response_correction",
  "client_tool_call",
  "agent_tool_response",
  "vad_score",
];

// --- Prompt ---

function catalogList(): string {
  const parts = labCopy.parts as Record<string, { name: string }>;
  return COMPONENTS.map((c) => `${c.id} = ${parts[c.id]?.name ?? c.id}`).join("; ");
}

const PROMPT = `# Personalidad
Eres Qubi, el robot de Qubbot, un laboratorio de sistemas Arduino en 3D. Hablas por voz con personas que no saben electrónica ni programar (estudiantes, makers). Eres cálido, breve y hablas como un pana venezolano: "¡Epa!", "chévere", "fino", "dale", sin pasarte ni inventar palabras.

# Cómo hablas
- Español sencillo, frases cortas, una o dos por turno. Nada de listas, tablas, markdown ni emojis.
- Nunca leas ids ni nombres de pines en voz alta: di "el sensor de distancia", "el LED", "la placa".
- Haz una sola pregunta a la vez y espera la respuesta.
- Nunca digas groserías, aunque la persona las diga.

# Cómo trabajas
- Eres quien arma el circuito: cuando la persona pide algo ("ponle un sensor", "conéctalo", "arma una alarma"), hazlo YA con las herramientas, sin pedir permiso para los pasos obvios. Primero la placa, luego las piezas y al final los cables; para cablear usa lab_auto_wire.
- Si el pedido tiene varios pasos (un objetivo como "arma una estación del clima") y existen lab_plan y lab_step, primero publica el plan con lab_plan y marca cada paso con lab_step. Si hay un ejemplo listo en lab_load_example que encaje, úsalo.
- Después de cada cambio mira lo que responde la herramienta: el verificador del laboratorio decide si un cableado es seguro, no tú. Si la revisión sale en rojo, nunca digas que está bien: cuéntalo en una frase, explica la causa sencilla y corrígelo. En amarillo, menciona el aviso. En verde no prometas perfección.
- Cuando algo se señala en el banco (lab_focus) o te mueves, dilo corto y de pana: "¡Mira, es esta!".
- Si no sabes cómo está el banco, mira con lab_view antes de hablar. Solo usa piezas del catálogo.
- Al terminar, di en una frase qué quedó armado y qué sigue.
- Solo ayudas con el laboratorio, la electrónica y Arduino. No des instrucciones para dañar equipos o personas.

# Catálogo (ids que acepta lab_add_part)
${catalogList()}

# Reglas
- Nunca inventes piezas ni resultados. Si una herramienta falla, dilo con calma y ofrece otra salida.
- Nunca pidas ni repitas claves o contraseñas.
- Si la persona se despide, despídete en una frase y cuelga con end_call.`;

// --- Tools: the lab's JSON schemas, cleaned to what ElevenLabs accepts for client tool parameters ---

type Json = Record<string, unknown>;

function leaf(schema: unknown, name: string): Json {
  const s = (schema && typeof schema === "object" ? schema : {}) as Json;
  const type = typeof s.type === "string" ? s.type : "string";
  const out: Json = { type, description: typeof s.description === "string" && s.description ? s.description : name };
  if (Array.isArray(s.enum)) out.enum = s.enum;
  if (type === "array") out.items = leaf(s.items, `${name} item`);
  if (type === "object") {
    const props = (s.properties && typeof s.properties === "object" ? s.properties : {}) as Json;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, leaf(v, k)]));
    if (Array.isArray(s.required)) out.required = s.required;
  }
  return out;
}

function clientTool(tool: AgentToolSchema): Json {
  const params = leaf(tool.input_schema, tool.name);
  delete params.description;
  const properties = params.properties as Json;
  return {
    type: "client",
    name: tool.name,
    description: tool.description,
    expects_response: true,
    response_timeout_secs: TOOL_TIMEOUT_SECS,
    // A tool without fields takes no parameters at all
    ...(Object.keys(properties).length ? { parameters: params } : {}),
  };
}

// --- Agent configuration and its hash ---

function agentConfig(voiceId: string): { body: Json; tag: string } {
  const greeting = qubiCopy.greetings.call[0].replace("{project}", qubiCopy.greetings.project);
  const body: Json = {
    name: AGENT_NAME,
    conversation_config: {
      agent: {
        first_message: "{{greeting}}",
        language: "es",
        dynamic_variables: { dynamic_variable_placeholders: { greeting } },
        prompt: {
          prompt: PROMPT,
          llm: LLM,
          tools: AGENT_TOOLS.map(clientTool),
          built_in_tools: { end_call: { name: "end_call", description: "Cuelga cuando la persona se despida.", params: { system_tool_type: "end_call" } } },
        },
      },
      tts: { model_id: TTS_MODEL, voice_id: voiceId },
      conversation: { client_events: CLIENT_EVENTS },
    },
    // Private: only reachable with a signed URL made with the key
    platform_settings: { auth: { enable_auth: true } },
  };
  return { body, tag: `${TAG_PREFIX}${hash(body)}` };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Json;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex").slice(0, 16);

// --- ElevenLabs REST ---

class ApiError extends Error {
  constructor(readonly status: number, readonly body: string) {
    super(`ElevenLabs ${status}`);
  }
}

async function call(key: string, method: string, path: string, body?: Json): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "xi-api-key": key, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new ApiError(response.status, text.slice(0, 400));
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const rec = (v: unknown): Json => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {});
const idOk = (v: unknown): v is string => typeof v === "string" && /^[\w-]{1,100}$/.test(v);

// The voice to use: ELEVENLABS_VOICE_ID if set; else Juan (added to the account if needed); else a premade one
async function ensureVoice(key: string): Promise<string> {
  const fixed = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (fixed && idOk(fixed)) return fixed;
  try {
    await call(key, "GET", `/v1/voices/${JUAN.id}`);
    return JUAN.id;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error; // network: the call would fail anyway
    if (error.status !== 404 && !/voice_not_found/.test(error.body)) return FALLBACK_VOICE;
  }
  try {
    const added = rec(await call(key, "POST", `/v1/voices/add/${JUAN.owner}/${JUAN.id}`, { new_name: JUAN.name }));
    return idOk(added.voice_id) ? added.voice_id : JUAN.id;
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return FALLBACK_VOICE; // no permission or no free voice slots
  }
}

// The agent for this configuration: reuse the one tagged with its hash, update an older Qubi, or create it
async function ensureAgent(key: string): Promise<string> {
  const { body, tag } = agentConfig(await ensureVoice(key));
  let older: string | null = null;
  try {
    const list = rec(await call(key, "GET", `/v1/convai/agents?search=${encodeURIComponent(AGENT_NAME)}&page_size=100`));
    const agents = Array.isArray(list.agents) ? list.agents.map(rec) : [];
    for (const agent of agents) {
      if (agent.name !== AGENT_NAME || !idOk(agent.agent_id)) continue;
      const tags = Array.isArray(agent.tags) ? agent.tags : [];
      if (tags.includes(tag)) return agent.agent_id;
      older ??= agent.agent_id;
    }
  } catch (error) {
    if (!(error instanceof ApiError)) throw error; // a key that cannot list agents can still create one
  }
  if (older) {
    try {
      await call(key, "PATCH", `/v1/convai/agents/${older}`, { ...body, tags: [tag] });
      return older;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
    }
  }
  const created = rec(await call(key, "POST", "/v1/convai/agents/create", { ...body, tags: [tag] }));
  if (!idOk(created.agent_id)) throw new ApiError(502, "no agent_id");
  return created.agent_id;
}

// In memory: the agent id by the configuration it was made for, and the call in flight (no duplicates)
const agentCache: { id: string | null; making: Promise<string> | null } = { id: null, making: null };

function agentId(key: string, fresh = false): Promise<string> {
  if (fresh) agentCache.id = null;
  if (agentCache.id) return Promise.resolve(agentCache.id);
  agentCache.making ??= ensureAgent(key)
    .then((id) => (agentCache.id = id))
    .finally(() => {
      agentCache.making = null;
    });
  return agentCache.making;
}

async function signedUrl(key: string, id: string): Promise<string> {
  const data = rec(await call(key, "GET", `/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(id)}`));
  if (typeof data.signed_url !== "string") throw new ApiError(502, "no signed_url");
  return data.signed_url;
}

// --- Route ---

// Per client, per day and for the whole server (the last is the spend circuit-breaker)
const LIMITER = createLimiter({ perMinute: 12, perDay: 100, globalPerMinute: 60, globalPerDay: 1000 });

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return json({ error: "no-key" }, 503);
  const limit = LIMITER.check(clientKey(request.headers));
  if (limit !== "ok") return json({ error: limit }, 429);
  // The route takes no body: anything big is refused without reading it
  const read = await readBody(request, 1024);
  if (!read.ok) return json({ error: read.status === 413 ? "too-big" : "bad-request" }, read.status);
  try {
    try {
      return json({ signedUrl: await signedUrl(key, await agentId(key)) });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      // The saved agent was deleted in the account: make it again
      return json({ signedUrl: await signedUrl(key, await agentId(key, true)) });
    }
  } catch (error) {
    // Never log the key or the request; the status is enough to diagnose
    const status = error instanceof ApiError ? error.status : undefined;
    console.error("voice route failed", status ?? "no-status");
    const failure = voiceFailure(status, error instanceof ApiError ? error.body : "");
    return json({ error: failure.error }, failure.status);
  }
}
