// API keys the person chose to use instead of a subscription login (Claude, ChatGPT · Codex, Grok).
// Saved encrypted with the OS keychain (Electron safeStorage) in a 0600 file; the values never leave the
// main process: the window only learns which providers have one and its last four characters. A key
// reaches its agent CLI only as an environment variable of that run (agents.js). Tested in keyStore.test.js.
const fs = require('node:fs');
const path = require('node:path');

// provider -> the variable its CLI reads (verified: `claude --help`, the codex and grok binaries)
const KEY_PROVIDERS = {
  claude: { env: 'ANTHROPIC_API_KEY', shape: /^sk-ant-[\w-]{16,}$/ },
  codex: { env: 'OPENAI_API_KEY', shape: /^sk-(?!ant-)[\w-]{16,}$/ },
  grok: { env: 'XAI_API_KEY', shape: /^xai-[\w-]{16,}$/ },
};

function createKeyStore({ file, safeStorage }) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
  };
  const write = (data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    fs.chmodSync(file, 0o600);
  };
  const decrypt = (entry) => {
    try { return safeStorage.decryptString(Buffer.from(entry.data, 'base64')); } catch { return null; }
  };

  return {
    // { provider: { last4 } } (never the key)
    list() {
      return Object.fromEntries(Object.entries(read()).filter(([p]) => KEY_PROVIDERS[p]).map(([p, e]) => [p, { last4: e.last4 }]));
    },
    // -> { ok: true } or { ok: false, error: 'unknown' | 'shape' | 'no-keychain' }
    set(provider, value) {
      const spec = KEY_PROVIDERS[provider];
      if (!spec) return { ok: false, error: 'unknown' };
      const key = String(value ?? '').trim();
      if (!spec.shape.test(key)) return { ok: false, error: 'shape' };
      if (!safeStorage?.isEncryptionAvailable?.()) return { ok: false, error: 'no-keychain' };
      const data = read();
      data[provider] = { data: safeStorage.encryptString(key).toString('base64'), last4: key.slice(-4) };
      write(data);
      return { ok: true };
    },
    remove(provider) {
      const data = read();
      delete data[provider];
      write(data);
      return { ok: true };
    },
    // The environment of one run of that provider's CLI
    envFor(provider) {
      const spec = KEY_PROVIDERS[provider];
      const entry = spec && read()[provider];
      const key = entry && decrypt(entry);
      return key ? { [spec.env]: key } : {};
    },
  };
}

module.exports = { createKeyStore, KEY_PROVIDERS };
