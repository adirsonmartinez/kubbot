// The chat agent's route. It runs ONE model turn with the lab tools and answers
// { text, toolCalls, stop, content }. The browser runs the tools on its own design and calls again with
// the results until stop is not "tool_use". The key stays on the server; no key answers 503.

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { COMPONENTS } from "@/models/lab/catalog";
import { parseDesign } from "@/models/lab/circuit";
import {
  AGENT_TOOLS,
  WIRE_LIMITS,
  benchContext,
  sanitizeAgentMessages,
  type AgentBlock,
  type AgentReply,
  type AgentStop,
} from "@/models/lab/agentTools";
import { labCopy } from "@/views/copy/lab";

const DEFAULT_MODEL = "claude-opus-5-5";
const MAX_TOKENS = 16000;
const KNOWLEDGE_FILE = ".claude/skills/kubbot-lab/references/arduino.md";
const KNOWLEDGE_MAX_CHARS = 14000;

// A small per-address limit so a public deployment cannot be used to burn the key
const RATE = { perMinute: 40, seen: new Map<string, { count: number; resetAt: number }>() };

function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const hit = RATE.seen.get(ip);
  if (!hit || hit.resetAt < now) {
    if (RATE.seen.size > 1000) RATE.seen.clear();
    RATE.seen.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  hit.count++;
  return hit.count > RATE.perMinute;
}

// The Arduino notes (if the skill reference exists), cut at a line so no sentence is split
async function knowledge(): Promise<string> {
  try {
    const text = await readFile(path.join(process.cwd(), KNOWLEDGE_FILE), "utf8");
    if (text.length <= KNOWLEDGE_MAX_CHARS) return text.trim();
    const cut = text.lastIndexOf("\n", KNOWLEDGE_MAX_CHARS);
    return text.slice(0, cut > 0 ? cut : KNOWLEDGE_MAX_CHARS).trim();
  } catch {
    return "";
  }
}

function catalogList(): string {
  const parts = labCopy.parts as Record<string, { name: string; desc: string }>;
  return COMPONENTS.map((c) => {
    const copy = parts[c.id];
    const power = c.kind === "board" ? `${c.logic} V lógica` : c.volts ? `${c.volts[0]}–${c.volts[1]} V, ${c.mA} mA` : `${c.mA} mA`;
    return `- ${c.id}: ${copy?.name ?? c.id} (${power}). ${copy?.desc ?? ""}`.trim();
  }).join("\n");
}

const PERSONA = `Eres Qubi, el robot de Qubbot, un laboratorio de sistemas Arduino en 3D. Eres especialista en Arduino y ayudas a personas que no saben electrónica ni programar (estudiantes, makers).

Cómo hablas
- Español sencillo y cálido, sin jerga. Di "cable" y "pieza", no "net" ni "componente". Nombra las piezas con su nombre en español (por ejemplo "Sensor de distancia"), no con su id.
- Explica cada conexión en una o dos frases que entienda un chico de 14 años. Los nombres de pines (D3, GND) solo si ayudan, y de pasada.
- Respuestas cortas. Sin tablas ni títulos; una lista corta solo si de verdad ayuda.

Cómo trabajas
- Sugiere proyectos usando solamente las piezas del catálogo de abajo. Si piden algo que no está, dilo y ofrece lo más parecido que sí hay.
- Cuando te pidan algo ("ponle un sensor", "conéctalo", "arma una alarma"), hazlo tú con las herramientas, sin pedir permiso para los pasos obvios. Primero la placa, luego las piezas y al final los cables; para cablear usa lab_auto_wire, y lab_connect solo para un cable concreto.
- Después de cada cambio mira el veredicto de la herramienta. El verificador del laboratorio decide si un cableado es seguro, no tú. Nunca digas que un cableado está bien si la revisión está en rojo: cuéntalo, explica la causa en una o dos frases y corrígelo. Si está en amarillo, menciona el aviso. En verde no prometas perfección: el verificador no revisa resistencias, diodos de protección ni la fuente de los motores.
- Para ver cómo está el banco usa lab_view cuando dudes; el estado actual también está al final de estas instrucciones.
- Cuando pidan simular, la caja o el código, usa lab_simulate, lab_make_enclosure o lab_make_sketch.
- Al terminar, resume en una o tres frases qué quedó armado y qué sigue. No repitas todos los pasos.
- Solo ayudas con el laboratorio y con electrónica y Arduino. No des instrucciones para dañar equipos o personas.`;

async function systemPrompt(design: Parameters<typeof benchContext>[0]): Promise<Anthropic.Beta.BetaTextBlockParam[]> {
  const notes = await knowledge();
  const stable = [PERSONA, `Catálogo (solo estos ids se pueden poner):\n${catalogList()}`, notes && `Conocimiento de Arduino:\n${notes}`].filter(Boolean).join("\n\n");
  return [
    { type: "text", text: stable, cache_control: { type: "ephemeral" } },
    { type: "text", text: benchContext(design) },
  ];
}

const STOP: Record<string, AgentStop> = {
  end_turn: "end",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  model_context_window_exceeded: "max_tokens",
  refusal: "refusal",
};

function toReply(message: Anthropic.Beta.BetaMessage): AgentReply {
  const stop = STOP[message.stop_reason ?? "end_turn"] ?? "end";
  const content: AgentBlock[] = [];
  for (const block of message.content) {
    if (block.type === "text") content.push({ type: "text", text: block.text });
    else if (block.type === "tool_use") content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
    else if (block.type === "thinking") content.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
    else if (block.type === "redacted_thinking") content.push({ type: "redacted_thinking", data: block.data });
  }
  // A turn cut off mid-call has no usable calls
  const toolCalls = stop === "tool_use" ? content.flatMap((b) => (b.type === "tool_use" ? [{ id: b.id, name: b.name, input: b.input }] : [])) : [];
  const text = content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  return { text, toolCalls, stop, content };
}

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "no-key" }, 503);
  if (limited(request)) return json({ error: "rate" }, 429);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > WIRE_LIMITS.bodyBytes) return json({ error: "too-big" }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad-request" }, 400);
  }
  const input = (body && typeof body === "object" ? body : {}) as { messages?: unknown; design?: unknown };
  const messages = sanitizeAgentMessages(input.messages);
  if (!messages) return json({ error: "bad-request" }, 400);
  const { design } = parseDesign(input.design);

  try {
    const client = new Anthropic();
    const message = await client.beta.messages.create({
      model: process.env.QUBBOT_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: await systemPrompt(design),
      tools: AGENT_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
      messages: messages as Anthropic.Beta.BetaMessageParam[],
      // A policy refusal is retried by the API on its own default fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    return json(toReply(message));
  } catch (error) {
    // Never log the key or the request; the status is enough to diagnose
    const status = error instanceof Anthropic.APIError ? error.status : undefined;
    console.error("agent route failed", status ?? "no-status");
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return json({ error: "bad-key" }, 503);
    if (error instanceof Anthropic.RateLimitError) return json({ error: "busy" }, 429);
    return json({ error: "api" }, 502);
  }
}
