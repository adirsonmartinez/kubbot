// Natural-language git intent parser for the chat (typed or, later, dictated).
// Pure function, no DOM or services: parseGitIntent(text) -> intent | null.
//   { type: 'commit', message }            message may be '' (the agent asks for it)
//   { type: 'revert', sha }                sha 'HEAD' when none is given ("deshaz el último commit")
//   { type: 'reset', sha }                 sha null when none is given (destructive: never guessed)
//   { type: 'createBranch', name }         name may be ''
//   { type: 'checkout', target }           target may be ''
//   { type: 'explain', topic }             conceptual question: explain, never execute
//   { type: 'help' }
// Tolerates accents, casing, filler ("por favor", "oye") and synonyms. Rule-based, not an LLM.

export const SHA_RE = /\b(?=[0-9a-f]*\d)[0-9a-f]{4,40}\b/;

const FILLER = /\b(por favor|porfa|porfavor|oye|ok|vale|hey|gracias|ia|asistente|quiero que|necesito que|puedes|podrias|podria|me gustaria que|quisiera que|quiero|necesito|ahora|ya)\b/g;

// lowercase, no accents, no punctuation, no filler
export function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!,;]/g, ' ')
    .replace(FILLER, ' ')
    .replace(/\s+/g, ' ').trim();
}

// "login de usuario" -> "login-de-usuario". Never starts with "-" (git would read it as an option).
export function slugBranch(s) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/["'´`“”]/g, '').trim().replace(/\s+/g, '-').replace(/[^\w./-]/g, '').replace(/^-+|-+$/g, '');
}

// Drops filler words at the start until the real content (message / branch name) begins
function stripLead(s, words) {
  const re = new RegExp(`^\\s*(?:${words}|[:\\-–])(?=\\s|$|:)`, 'i');
  let prev;
  do { prev = s; s = s.replace(re, ''); } while (s !== prev);
  return s.trim();
}

const TOPICS = ['commit', 'rollback', 'reset', 'branch', 'diff'];
const GIT_WORDS = /\b(commit|rollback|revert|reset|rama|branch|checkout|git)\b/;

const TRIGGERS = {
  reset: /\b(reset\w*|resete\w*|reinici\w*|empez\w* de cero|empezar de nuevo|volver? al (inicio|principio|cero|origen)|vuelve al (inicio|principio)|(borra|elimina|limpia)\w* todo|descart\w* (todo|los cambios))\b/,
  revert: /\b(rollback|roll back|revert\w*|deshac\w*|deshaz|desha\w*|undo|retroced\w*|anula\w*|quita\w* (el )?(ultimo |anterior )?commit|elimina\w* (el )?(ultimo )?commit|borra\w* (el )?(ultimo )?commit|echa\w* (para )?atras|vuelve\w* (para )?atras|volver (para )?atras|regres\w* (al )?(commit )?anterior|vuelve al commit anterior|paso atras|marcha atras)\b|\b(vuelve|volver|regresa\w*|retorna\w*)\b.*\b(commit|version)\b/,
  commit: /\b(commit\w*|comit\w*|confirma\w* (los )?cambios|guarda\w* (los |mis |todos los )?(cambios|avances|progreso|trabajo)|registra\w* (los )?cambios|sube\w* (los )?cambios|salva\w* (los )?cambios)\b/,
};
const CREATE_VERB = /\b(crea\w*|nuev[ao]|new|abre\w*|abrir|haz|hacer|genera\w*|inicia\w*|arranca\w*|agrega\w*|anade\w*|monta\w*|saca\w*|bifurca\w*)\b/;
const CHECKOUT_VERB = /\b(checkout|switch|cambia\w*|cambiate|muevete|mueve\w*|pasa\w*|pasate|ir|ve|vete|vamos|salta\w*|entra\w*|usa\w*|selecciona\w*|trabaja\w*|activa\w*)\b/;
const CHECKOUT_VERB_RAW = /\b(checkout|switch|cambia\w*|cámbiate|cambiate|muévete|muevete|mueve\w*|pasa\w*|pásate|ir|ve|vete|vamos|salta\w*|entra\w*|usa\w*|selecciona\w*|trabaja\w*|activa\w*)\b/i;

export function parseGitIntent(text) {
  const raw = (text ?? '').trim();
  const n = normalize(raw);
  if (!n) return null;

  // Questions: explain a git concept, or leave it to the normal chat ("¿qué commit subió secretos?")
  if (/^(que|cual|cuales|cuantos|cuantas|quien|como|por que|para que|donde|cuando|en que)\b/.test(n)) {
    if (!GIT_WORDS.test(n)) return null;
    if (!/\b(es|son|significa|hace|sirve|diferencia|diferencias|hago|funciona|uso)\b/.test(n)) return null;
    if (/diferencia/.test(n) && /reset/.test(n) && /(rollback|revert)/.test(n)) return { type: 'explain', topic: 'diff' };
    const topic = /reset/.test(n) ? 'reset' : /rollback|revert/.test(n) ? 'rollback' : /commit/.test(n) ? 'commit'
      : /rama|branch/.test(n) ? 'branch' : null;
    return topic ? { type: 'explain', topic } : { type: 'help' };
  }

  if (/^(ayuda|help|comandos|comandos git|ayuda git|que puedes hacer|que sabes hacer)$/.test(n)) return { type: 'help' };

  // Which intent? The one whose trigger appears first ("haz un commit: deshacer bug" is a commit)
  const found = [];
  for (const type of ['reset', 'revert', 'commit']) {
    const m = TRIGGERS[type].exec(n);
    if (m) found.push({ type, idx: m.index });
  }
  const mentionsBranch = /\b(rama|branch)\b/.test(n);
  const isCheckout = /\b(checkout|switch)\s+\S+/.test(n)
    || (CHECKOUT_VERB.test(n) && mentionsBranch)
    || /^(cambia\w*|cambiate|ve|vete|ir|vamos|pasa\w*|muevete)\s+(a|hacia)\s+\S+$/.test(n);
  if (isCheckout) found.push({ type: 'checkout', idx: n.search(CHECKOUT_VERB) < 0 ? 0 : n.search(CHECKOUT_VERB) });
  else if (mentionsBranch && (CREATE_VERB.test(n) || /^(git )?branch\s+\S+/.test(n))) {
    found.push({ type: 'createBranch', idx: n.search(/\b(rama|branch)\b/) });
  }
  if (!found.length) return null;
  const order = ['reset', 'revert', 'createBranch', 'checkout', 'commit'];
  found.sort((a, b) => a.idx - b.idx || order.indexOf(a.type) - order.indexOf(b.type));
  const { type } = found[0];

  if (type === 'reset') return { type, sha: (n.match(SHA_RE) ?? [null])[0] };
  if (type === 'revert') return { type, sha: (n.match(SHA_RE) ?? ['HEAD'])[0] };

  if (type === 'createBranch') {
    let rest = raw.replace(/^.*?\b(rama|branch)\b/i, '');
    rest = stripLead(rest, 'nueva|nuevo|new|llamada|llamado|nombrada|nombrado|de nombre|con nombre|con el nombre|que se llame|se llame|que se llama|el nombre|nombre|para|con|de|la|el|una?|que|sea|se|llame|llama|como|por|a');
    return { type, name: slugBranch(rest.split(/[,.;]/)[0]) };
  }

  if (type === 'checkout') {
    let rest = raw.replace(/^.*?\b(checkout|switch|cambia\w*|cámbiate|muévete|mueve\w*|pasa\w*|pásate|ir|ve|vete|vamos|salta\w*|entra\w*|usa\w*|selecciona\w*|trabaja\w*|activa\w*)\b/i, '');
    rest = stripLead(rest, 'a|al|hasta|hacia|en|la|el|rama|branch|llamada|llamado|de nombre|nombre|-b');
    return { type, target: slugBranch(rest.split(/[,.;]/)[0]) };
  }

  // commit
  let message = raw.replace(/^.*?\b(commit\w*|comit\w*|confirma\w*|gu[aá]rd\w*|registra\w*|sube\w*|salva\w*)\b/i, '');
  message = stripLead(message, 'los|mis|todos|todo|el|la|un|una|cambios|avances|progreso|trabajo|con|mensaje|texto|nombre|titulo|título|descripcion|descripción|que se llam[ea]|se llam[ea]|llamad[oa]|que dig[ae]|que dice|diciendo|como|de|para|poniendo');
  message = message.replace(/^['"´`“”]+|['"´`“”]+$/g, '').replace(/\s*(por favor|porfa)\s*$/i, '').trim();
  return { type: 'commit', message };
}
