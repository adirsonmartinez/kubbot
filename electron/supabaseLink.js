// The pure part of "Conectar mi cuenta" for Supabase (supabaseConnect.js does the calls): reading the
// answers of Supabase's MCP server, choosing the public key, and the text of .env.local and .gitignore.
// Tested in supabaseLink.test.js.

const ENV_URL = 'NEXT_PUBLIC_SUPABASE_URL';
const ENV_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const REGION = 'sa-east-1'; // São Paulo: the closest one to Chile

// A tool result ({ content: [{ type: 'text', text }], isError }) -> the JSON in its text. Supabase may wrap
// data in other text (a note, tags), so the outermost [...] or {...} is taken.
function readToolJson(result) {
  const body = (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  if (result?.isError) {
    let message = body.trim();
    try { message = JSON.parse(message)?.error?.message ?? message; } catch { /* plain text */ }
    throw new Error(String(message).slice(0, 300) || 'Supabase error');
  }
  try { return JSON.parse(body); } catch { /* wrapped */ }
  const starts = [body.indexOf('['), body.indexOf('{')].filter((i) => i >= 0);
  if (starts.length) {
    const start = Math.min(...starts);
    const end = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
    try { return JSON.parse(body.slice(start, end + 1)); } catch { /* not JSON */ }
  }
  throw new Error('Supabase did not answer with JSON');
}

// Supabase wraps its answers by name: { organizations: [...] }, { projects: [...] }, maybe { project: {...} }.
// A bare list or item is accepted too.
function listOf(answer, key) {
  if (Array.isArray(answer)) return answer;
  return Array.isArray(answer?.[key]) ? answer[key] : [];
}
const itemOf = (answer, key) => (answer && typeof answer[key] === 'object' && !Array.isArray(answer[key]) ? answer[key] : answer);

// get_cost -> what confirm_cost needs back unchanged ({ type, recurrence, amount }); the amount is in USD
function readCost(answer) {
  const amount = Number(answer?.amount);
  const recurrence = answer?.recurrence === 'hourly' ? 'hourly' : answer?.recurrence === 'monthly' ? 'monthly' : null;
  if (!Number.isFinite(amount) || !recurrence) throw new Error('Supabase did not say the cost');
  return { type: answer.type === 'branch' ? 'branch' : 'project', amount, recurrence };
}

// get_publishable_keys -> the key a browser app may use: a modern publishable key, else the legacy anon
// key. Never a disabled key and never anything else (service_role is a secret).
function pickPublicKey(answer) {
  // a bare list, or the first list inside the answer ({ keys: [...] }, { publishable_keys: [...] }…)
  const list = Array.isArray(answer) ? answer : Object.values(answer ?? {}).find(Array.isArray) ?? [];
  const value = (k) => k.api_key ?? k.key ?? k.value ?? null;
  const live = list.filter((k) => !k.disabled && typeof value(k) === 'string');
  const modern = live.find((k) => value(k).startsWith('sb_publishable_'));
  const anon = live.find((k) => k.name === 'anon');
  return modern ? value(modern) : anon ? value(anon) : null;
}

// .env.local with our variables replaced (or added at the end); the person's other lines stay
function mergeEnv(textIn, vars) {
  const lines = String(textIn ?? '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  for (const [name, val] of Object.entries(vars)) {
    const line = `${name}=${val}`;
    const at = lines.findIndex((l) => l.startsWith(`${name}=`));
    if (at >= 0) lines[at] = line;
    else lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}

// .gitignore with ".env*.local" added, or null when a rule already keeps .env.local out of git
function protectEnv(textIn) {
  const rules = String(textIn ?? '').split('\n').map((l) => l.trim());
  if (rules.some((r) => ['.env*', '.env*.local', '.env.local', '*.local', '.env.*'].includes(r))) return null;
  const base = String(textIn ?? '');
  return `${base}${base && !base.endsWith('\n') ? '\n' : ''}.env*.local\n`;
}

function projectNameFor(folder) {
  const slug = String(folder ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return slug || 'mi-proyecto';
}

// get_project_url -> https://<ref>.supabase.co (plain text or JSON)
function readToolUrl(result) {
  const body = (result?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
  return body.match(/https:\/\/[a-z0-9-]+\.supabase\.(co|in)\b/i)?.[0] ?? null;
}

const isReady = (project) => project?.status === 'ACTIVE_HEALTHY';

module.exports = { readToolJson, readToolUrl, listOf, itemOf, readCost, pickPublicKey, mergeEnv, protectEnv, projectNameFor, isReady, ENV_URL, ENV_KEY, REGION };
