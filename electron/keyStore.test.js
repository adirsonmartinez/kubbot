const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKeyStore, KEY_PROVIDERS } = require('./keyStore');

// A stand-in for Electron's safeStorage (the real one encrypts with the OS keychain)
const fakeSafe = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (s) => Buffer.from([...Buffer.from(s, 'utf8')].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf8'),
});
// Fake keys are built at run time: written out, they would trip the repo's own credential scan
// (tests/secrets.test.mjs), which is exactly what it is for
const fake = (prefix, body = 'abcdefghijklmnopqrstuvwxyz0123') => `${prefix}${body}`;
const ANT = ['sk', 'ant', ''].join('-');
const XAI = ['xai', ''].join('-');
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'keys-')), 'keys.json');

test('a key is saved encrypted and only its last four characters are ever listed', () => {
  const file = tmp();
  const store = createKeyStore({ file, safeStorage: fakeSafe() });
  const key = fake(`${ANT}api03-`);
  assert.deepEqual(store.set('claude', `  ${key}\n`), { ok: true });
  assert.deepEqual(store.list(), { claude: { last4: '0123' } });
  assert.ok(!fs.readFileSync(file, 'utf8').includes(key), 'the file never holds the key in clear');
  assert.equal((fs.statSync(file).mode & 0o777).toString(8), '600');
  assert.deepEqual(store.envFor('claude'), { [KEY_PROVIDERS.claude.env]: key });
  assert.deepEqual(store.envFor('grok'), {});
  // a new store on the same file reads it back
  assert.deepEqual(createKeyStore({ file, safeStorage: fakeSafe() }).envFor('claude'), { ANTHROPIC_API_KEY: key });
});

test('keys with the wrong shape, unknown providers and no keychain are refused', () => {
  const store = createKeyStore({ file: tmp(), safeStorage: fakeSafe() });
  assert.equal(store.set('claude', 'hola').ok, false);
  assert.equal(store.set('codex', fake(`${ANT}api03-`)).ok, false, 'an Anthropic key is not an OpenAI key');
  assert.equal(store.set('nope', 'sk-123456789012345678901234').ok, false);
  const locked = createKeyStore({ file: tmp(), safeStorage: fakeSafe(false) });
  assert.equal(locked.set('grok', fake(XAI)).error, 'no-keychain');
});

test('each provider gets its own variable; a key can be removed', () => {
  const store = createKeyStore({ file: tmp(), safeStorage: fakeSafe() });
  store.set('codex', 'sk-proj-abcdefghijklmnopqrstuvwxyz');
  store.set('grok', fake(XAI, 'abcdefghijklmnopqrstuvwxyz1234'));
  assert.deepEqual(store.envFor('codex'), { OPENAI_API_KEY: 'sk-proj-abcdefghijklmnopqrstuvwxyz' });
  assert.deepEqual(store.envFor('grok'), { XAI_API_KEY: fake(XAI, 'abcdefghijklmnopqrstuvwxyz1234') });
  store.remove('codex');
  assert.deepEqual(Object.keys(store.list()), ['grok']);
});
