const test = require('node:test');
const assert = require('node:assert/strict');
const { readToolJson, pickPublicKey, mergeEnv, protectEnv, projectNameFor, isReady, ENV_URL, ENV_KEY } = require('./supabaseLink');

const text = (t, isError = false) => ({ isError, content: [{ type: 'text', text: t }] });

test('tool results: plain JSON, or JSON wrapped in other text; an error result throws with its message', () => {
  assert.deepEqual(readToolJson(text('[{"id":"o1","name":"Ana"}]')), [{ id: 'o1', name: 'Ana' }]);
  assert.deepEqual(readToolJson(text('Below is the result:\n<data>{"id":"p1","status":"ACTIVE_HEALTHY"}</data>\nUse it wisely')), { id: 'p1', status: 'ACTIVE_HEALTHY' });
  assert.throws(() => readToolJson(text('The free project limit was reached', true)), /free project limit/);
  assert.throws(() => readToolJson(text('no json here')), /JSON/);
});

test('the public key: a modern publishable key first, else the legacy anon key; never a disabled one', () => {
  const keys = [
    { name: 'anon', type: 'legacy', api_key: 'eyJlegacy' },
    { name: 'default', type: 'publishable', api_key: 'sb_publishable_new', disabled: true },
    { name: 'web', type: 'publishable', api_key: 'sb_publishable_web' },
  ];
  assert.equal(pickPublicKey(keys), 'sb_publishable_web');
  assert.equal(pickPublicKey(keys.slice(0, 2)), 'eyJlegacy');
  assert.equal(pickPublicKey([{ name: 'service_role', type: 'legacy', api_key: 'eyJsecret' }]), null, 'never the service role');
  assert.equal(pickPublicKey({ keys: [{ name: 'anon', api_key: 'eyJa' }] }), 'eyJa', 'also inside { keys }');
});

test('.env.local: our two variables are replaced or added; everything else stays', () => {
  const before = '# mine\nOTHER=1\nNEXT_PUBLIC_SUPABASE_URL=old\n';
  const after = mergeEnv(before, { [ENV_URL]: 'https://x.supabase.co', [ENV_KEY]: 'sb_publishable_k' });
  assert.equal(after, '# mine\nOTHER=1\nNEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_k\n');
  assert.equal(mergeEnv('', { A: '1' }), 'A=1\n');
});

test('.gitignore: adds .env*.local unless a rule already covers it', () => {
  assert.equal(protectEnv('node_modules\n'), 'node_modules\n.env*.local\n');
  assert.equal(protectEnv('node_modules'), 'node_modules\n.env*.local\n');
  assert.equal(protectEnv(''), '.env*.local\n');
  for (const covered of ['.env*', '.env*.local', '.env.local', '.env*\n!.env.example', '*.local']) assert.equal(protectEnv(covered), null, covered);
});

test('the Supabase project name comes from the folder: lowercase letters, numbers and dashes', () => {
  assert.equal(projectNameFor('Mi Tienda Online!'), 'mi-tienda-online');
  assert.equal(projectNameFor('ñandú_2'), 'nandu-2');
  assert.equal(projectNameFor('***'), 'mi-proyecto');
  assert.equal(projectNameFor('a'.repeat(80)).length, 40);
});

test('a project is ready when Supabase says it is healthy', () => {
  assert.equal(isReady({ status: 'ACTIVE_HEALTHY' }), true);
  assert.equal(isReady({ status: 'COMING_UP' }), false);
  assert.equal(isReady(null), false);
});

test('the project URL: from JSON or from plain text', () => {
  const { readToolUrl } = require('./supabaseLink');
  assert.equal(readToolUrl(text('https://abc.supabase.co')), 'https://abc.supabase.co');
  assert.equal(readToolUrl(text('{"url":"https://abc.supabase.co"}')), 'https://abc.supabase.co');
  assert.equal(readToolUrl(text('nothing')), null);
});

test('lists come wrapped by name ({ organizations: [...] }, { projects: [...] }), as Supabase answers', () => {
  const { listOf, itemOf } = require('./supabaseLink');
  assert.deepEqual(listOf({ organizations: [{ id: 'o1', name: 'Rial' }] }, 'organizations'), [{ id: 'o1', name: 'Rial' }]);
  assert.deepEqual(listOf([{ id: 'p1' }], 'projects'), [{ id: 'p1' }], 'a bare list too');
  assert.deepEqual(listOf({ other: 1 }, 'projects'), []);
  assert.deepEqual(itemOf({ project: { id: 'p1', status: 'COMING_UP' } }, 'project'), { id: 'p1', status: 'COMING_UP' });
  assert.deepEqual(itemOf({ id: 'p1' }, 'project'), { id: 'p1' }, 'or the item itself');
});

test('the keys may come wrapped under any name', () => {
  assert.equal(pickPublicKey({ publishable_keys: [{ name: 'anon', api_key: 'eyJx' }] }), 'eyJx');
  assert.equal(pickPublicKey({ note: 'x', data: [{ type: 'publishable', key: 'sb_publishable_y' }] }), 'sb_publishable_y');
});

test('an error answer as JSON shows only its message', () => {
  assert.throws(() => readToolJson(text('{"error":{"name":"Error","message":"Free project limit reached"}}', true)), (err) => err.message === 'Free project limit reached');
});

test('the cost: read from get_cost, and what confirm_cost needs back', () => {
  const { readCost } = require('./supabaseLink');
  assert.deepEqual(readCost({ type: 'project', amount: 0, recurrence: 'monthly' }), { type: 'project', amount: 0, recurrence: 'monthly' });
  assert.deepEqual(readCost({ amount: 10, recurrence: 'hourly', extra: 1 }), { type: 'project', amount: 10, recurrence: 'hourly' });
  assert.throws(() => readCost({ amount: 'x' }), /cost/);
});
