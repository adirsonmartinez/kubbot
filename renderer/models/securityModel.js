// Security traffic light per file: green (safe), yellow (review), red (risk), grey (not evaluated).
// Today demo rules decide by file name. An AI agent overrides any file with setScore().
import { Observable } from '../core/observable.js';
import { baseName } from './fileTree.js';

export const LEVELS = ['green', 'yellow', 'red', 'grey'];
export const LEVEL_RANK = { grey: 0, green: 1, yellow: 2, red: 3 };

export const worstLevel = (levels) => levels.reduce((worst, l) => (LEVEL_RANK[l] > LEVEL_RANK[worst] ? l : worst), 'grey');

// Returns { level, reasonKey }. reasonKey maps to strings.security.reasons.
export function demoScore(path) {
  const name = baseName(path).toLowerCase();
  if (/^\.env\.(example|sample|template)$/.test(name)) return { level: 'yellow', reasonKey: 'envTemplate' };
  if (/^\.env(\..+)?$/.test(name)) return { level: 'red', reasonKey: 'envFile' };
  if (/\.(pem|key|p12|pfx|keystore|jks)$/.test(name) || /^id_(rsa|ed25519|ecdsa)/.test(name)) return { level: 'red', reasonKey: 'privateKey' };
  if (/(secret|credential|password|passwd|private[-_]?key|service[-_]?account)/.test(name)) return { level: 'red', reasonKey: 'secretName' };
  if (/\.sql$/.test(name)) return { level: 'yellow', reasonKey: 'sql' };
  if (/(auth|login|session|token|jwt|middleware|crypto)/.test(name)) return { level: 'yellow', reasonKey: 'sensitiveLogic' };
  if (/^(dockerfile|docker-compose.*|vercel\.json|netlify\.toml|firebase\.json|config\.toml|\.npmrc)$/.test(name) ||
      /(\.config\.(js|cjs|mjs|ts)|\.ya?ml)$/.test(name) || /^(config|settings)\./.test(name)) {
    return { level: 'yellow', reasonKey: 'config' };
  }
  return { level: 'green', reasonKey: 'clean' };
}

export class SecurityModel {
  #agentScores = new Map(); // path -> { level, reason }

  // `version` changes every time a score changes, so view models know when to recompute
  store = new Observable({ version: 0 });

  // { level, reason?, reasonKey?, by: 'agent' | 'remi' | 'demo' }. reasonKey always comes from the demo
  // rule, so the technical detail of the original finding is kept after an override.
  scoreOf(path) {
    const demo = demoScore(path);
    const override = this.#agentScores.get(path);
    if (override) return { reasonKey: demo.reasonKey, ...override };
    return { ...demo, by: 'demo' };
  }

  setScore(path, level, reason = '', by = 'agent') {
    if (!path || !LEVELS.includes(level)) return false;
    this.#agentScores.set(path, { level, reason, by });
    this.store.set({ version: this.store.state.version + 1 });
    return true;
  }
}

// The project's security score (the ring on the map): starts at 100 and every open risk takes points
// off, so each repair moves it (a share of files would barely change in a big project).
const RED_POINTS = 15;
const YELLOW_POINTS = 5;
export const securityScore = ({ red = 0, yellow = 0 } = {}) => Math.max(0, 100 - red * RED_POINTS - yellow * YELLOW_POINTS);
// The ring's color: the worst light still open
export const scoreLevel = ({ red = 0, yellow = 0 } = {}) => (red ? 'red' : yellow ? 'yellow' : 'green');
