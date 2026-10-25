// Help while the person writes to Qubi: a warning when a key or password was pasted by mistake, a nudge
// when the message is a single word, and part names to complete ("sens…" -> "Sensor de distancia").
// Pure: the chat's view model calls it on every keystroke.

export type PromptHint = { kind: "secret" | "short" };
export type PartName = { id: string; name: string };
export type Completion = { id: string; name: string };

const MAX_COMPLETIONS = 5;
const MIN_QUERY = 3;

// Things that look like a key or a password typed into the message
const SECRET_TEXT = [
  /\b(?:sk|pk|rk)[-_](?:live|test|ant)?[-_]?[\w-]{16,}/i,
  /\bAKIA[0-9A-Z]{12,}/,
  /\bgh[pousr]_[\w]{20,}/,
  /\beyJ[\w-]{10,}\.[\w-]{10,}\./,
  /\b(?:contraseña|password|clave|token|secret)\s*[:=]\s*\S{6,}/i,
];

// Lowercase without accents, so "camara" finds "Cámara"
export const fold = (text: string): string => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const wordsOf = (text: string): string[] => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export function analyzePrompt(text: string): PromptHint[] {
  const draft = String(text ?? "");
  if (!draft.trim()) return [];
  const hints: PromptHint[] = [];
  if (SECRET_TEXT.some((re) => re.test(draft))) hints.push({ kind: "secret" });
  // A single finished word ("hola ") says too little for Qubi to act on
  if (/\s$/.test(draft) && wordsOf(draft).length === 1 && wordsOf(draft)[0].length >= 3) hints.push({ kind: "short" });
  return hints;
}

// The word being typed (after a "@" it can be shorter) -> parts whose name starts with it, or has a word that does
export function completions(text: string, parts: PartName[]): Completion[] {
  const draft = String(text ?? "");
  if (!draft.trim() || /\s$/.test(draft)) return [];
  const token = draft.split(/\s+/).pop() ?? "";
  const at = token.startsWith("@");
  const query = fold(at ? token.slice(1) : token);
  if (!query || (!at && query.length < MIN_QUERY)) return [];
  const starts = (name: string) => fold(name).startsWith(query);
  const inside = (name: string) => wordsOf(name).some((w) => w.startsWith(query));
  const first = parts.filter((p) => starts(p.name));
  const rest = parts.filter((p) => !starts(p.name) && inside(p.name));
  return [...first, ...rest].slice(0, MAX_COMPLETIONS).map((p) => ({ id: p.id, name: p.name }));
}

// The message with a completion applied: it replaces the word being typed
export function applyCompletion(text: string, item: Completion): string {
  return String(text ?? "").replace(/\S*$/, "") + `${item.name} `;
}
