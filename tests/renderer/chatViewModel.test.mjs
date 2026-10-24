import './setup.mjs';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { ChatViewModel } from '../../renderer/viewmodels/chatViewModel.js';
import { createEventBus, EVENTS } from '../../renderer/core/eventBus.js';

test('map messages that arrive while an answer streams are shown when it ends', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    let finish;
    const agentModel = {
      reply: (_t, { onText }) => new Promise((resolve) => { finish = () => { onText('hola'); resolve({ text: 'hola' }); }; }),
    };
    const vm = new ChatViewModel({ agentModel, bus });
    const sending = vm.send('pregunta');
    bus.emit(EVENTS.repairFinished, { entry: { path: 'a.js', status: 'verified', changes: [], plan: [] } });
    finish();
    await sending;
    mock.timers.tick(5000);
    const texts = vm.store.state.messages.map((m) => m.text);
    assert.ok(texts.includes('hola'));
    assert.ok(texts.some((t) => t?.includes('a.js')), 'the queued repair message was shown');
    assert.equal(vm.store.state.typing, false);
  } finally {
    mock.timers.reset();
  }
});


test('a live answer is one run: steps for tools and subagents, then the result', async () => {
  const bus = createEventBus();
  const agentModel = {
    reply: async (_t, { onEvent, onText }) => {
      onEvent({ type: 'thinking', delta: 'Miro el mapa', parent: null });
      onEvent({ type: 'tool', id: 't1', name: 'list_risks', target: '', parent: null });
      onEvent({ type: 'tool_done', id: 't1', error: false });
      onEvent({ type: 'subagent', id: 's1', description: 'Revisar la base de datos', kind: 'Explore', parent: null });
      onEvent({ type: 'tool', id: 't2', name: 'read_file', target: 'db.sql', parent: 's1' });
      onEvent({ type: 'text', delta: 'Nada grave', parent: 's1' });
      onEvent({ type: 'tool_done', id: 't2', error: true });
      onEvent({ type: 'tool_done', id: 's1', error: false });
      onText('Todo **bien**');
      onEvent({ type: 'result', durationMs: 4200, turns: 3, inputTokens: 100, outputTokens: 50 });
      return { text: 'Todo **bien**' };
    },
  };
  const connection = { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: 'opus', effort: 'high' } } };
  const vm = new ChatViewModel({ agentModel, bus, connection });
  await vm.send('audita');
  const run = vm.store.state.messages.find((m) => m.run);
  assert.equal(run.text, 'Todo **bien**');
  assert.equal(run.thinking, 'Miro el mapa');
  assert.equal(run.run.status, 'done');
  assert.equal(run.run.model, 'opus');
  assert.deepEqual(run.run.steps.map((s) => [s.kind, s.name ?? s.description, s.status, s.parent]), [
    ['tool', 'list_risks', 'done', null],
    ['subagent', 'Revisar la base de datos', 'done', null],
    ['tool', 'read_file', 'error', 's1'],
  ]);
  assert.equal(run.run.steps[1].output, 'Nada grave');
  assert.deepEqual(run.run.result, { durationMs: 4200, turns: 3, inputTokens: 100, outputTokens: 50 });
  assert.equal(vm.store.state.messages.filter((m) => m.role === 'tool').length, 0, 'no loose tool lines');
});

test("the agent's suggestions become chips: questions are sent, actions run on the app", async () => {
  const bus = createEventBus();
  const calls = [];
  const actions = {
    repair: (path, from) => calls.push(['repair', path, from]),
    locate: (path) => calls.push(['locate', path]),
  };
  const answer = 'Listo.\n```sugerencias\n- ¿Qué hago ahora?\n- reparar: src/db.js\n- auditar: api/login.js\n- ver: src\n```';
  const agentModel = { reply: async (_t, { onText }) => { onText(answer); return { text: answer }; } };
  const connection = { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } };
  const vm = new ChatViewModel({ agentModel, bus, actions, connection });
  await vm.send('revisa');
  const chips = vm.store.state.chips;
  assert.deepEqual(chips.map((c) => c.kind), ['ask', 'repair', 'audit', 'locate']);
  assert.ok(chips[1].label.includes('db.js'));
  vm.choose(chips[1], 'button');
  vm.choose(chips[3]);
  assert.deepEqual(calls, [['repair', 'src/db.js', 'button'], ['locate', 'src']]);
  assert.ok(chips[2].prompt.includes('api/login.js'), 'audit sends the audit request as one message');
});

test('a suggestion without its app action is not offered', async () => {
  const bus = createEventBus();
  const answer = 'x\n```sugerencias\n- reparar: a.js\n- Otra pregunta\n```';
  const agentModel = { reply: async (_t, { onText }) => { onText(answer); return { text: answer }; } };
  const vm = new ChatViewModel({ agentModel, bus, actions: {} });
  await vm.send('hola');
  assert.deepEqual(vm.store.state.chips.map((c) => c.kind), ['ask']);
});

test('the agent gets the last messages of the person (to adapt how it talks)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const seen = [];
    const agentModel = { reply: async (_t, { recent }) => { seen.push(recent); return { text: 'ok' }; } };
    const vm = new ChatViewModel({ agentModel, bus });
    await vm.send('uno');
    mock.timers.tick(5000); // the demo's "typing…" delay
    await vm.send('dos');
    assert.deepEqual(seen, [[], ['uno']]);
  } finally {
    mock.timers.reset();
  }
});

test('opening a folder shows a card with its counts and what to do next', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const actions = { showRisks: () => {}, repairWorst: () => {} };
    const vm = new ChatViewModel({ agentModel: { reply: async () => ({}) }, bus, actions });
    bus.emit(EVENTS.folderOpened, { name: 'src', path: 'src', files: 12, folders: 2, counts: { red: 1, yellow: 2, green: 9 } });
    mock.timers.tick(5000);
    const card = vm.store.state.messages.at(-1).card;
    assert.equal(card.kind, 'folder');
    assert.equal(card.name, 'src');
    assert.deepEqual(card.counts, { red: 1, yellow: 2, green: 9 });
    assert.deepEqual(card.actions.map((a) => a.kind), ['risks', 'repair', 'ask']);
  } finally {
    mock.timers.reset();
  }
});

test('selecting a risky file shows a card: what is it, repair, audit', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const actions = { repair: () => {} };
    const vm = new ChatViewModel({ agentModel: { reply: async () => ({}) }, bus, actions });
    bus.emit(EVENTS.fileSelected, { path: 'src/db.js', level: 'red', reason: 'Clave a la vista', by: 'demo' });
    mock.timers.tick(5000);
    const { card } = vm.store.state.messages.at(-1);
    assert.equal(card.kind, 'file');
    assert.equal(card.level, 'red');
    assert.deepEqual(card.actions.map((a) => a.kind), ['ask', 'repair', 'audit']);
    assert.ok(card.actions[2].prompt.includes('src/db.js') && card.actions[2].prompt.includes('Clave a la vista'));
  } finally {
    mock.timers.reset();
  }
});

test('a file name in the chat opens its card with the first lines and what can be done with it', async () => {
  const bus = createEventBus();
  const opened = [];
  const actions = {
    entryOf: async (p) => ({ 'index.html': { type: 'file' }, src: { type: 'dir' }, '.env': { type: 'file' } })[p] ?? null, // asks the disk
    fileInfo: () => ({ level: 'green', reason: '', by: 'demo' }),
    readFile: async () => ({ ok: true, data: '<h1>Hola</h1>\n<p>x</p>' }),
    openFile: async (p, how) => { opened.push([p, how]); return { ok: true }; },
    locate: (p) => opened.push([p, 'map']),
  };
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus, actions });
  await vm.openFile('index.html');
  await new Promise((r) => setTimeout(r, 0));
  const card = vm.store.state.messages.at(-1).card;
  assert.equal(card.kind, 'file');
  assert.deepEqual(card.preview, { lines: ['<h1>Hola</h1>', '<p>x</p>'], more: 0 });
  const kinds = card.actions.map((a) => a.kind);
  assert.ok(kinds.includes('open') && kinds.includes('reveal'), kinds.join());
  assert.ok(!kinds.includes('locate'), 'the radar map hides files without problems: no "Ver en el mapa"');
  // Green only by the demo rule: nobody checked it, so it does not say "Seguro"; it offers a review
  assert.equal(card.level, 'grey');
  assert.ok(kinds.includes('audit'));
  card.actions.find((a) => a.kind === 'open').run();
  assert.deepEqual(opened.at(-1), ['index.html', 'default']);

  await vm.openFile('src'); // a folder goes to the map
  assert.deepEqual(opened.at(-1), ['src', 'map']);

  await vm.openFile('.env'); // never shown
  assert.equal(vm.store.state.messages.at(-1).card.preview, 'secret');

  await vm.openFile('nope.js');
  assert.match(vm.store.state.messages.at(-1).text, /nope\.js/);
});

test('files changed on disk come as a card with a button to open each', () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus, actions: { entryOf: () => ({ type: 'file' }), fileInfo: () => ({}), readFile: async () => ({ ok: false }) } });
  bus.emit(EVENTS.diskChanged, { paths: ['index.html', 'a.tmp', 'css/app.css'] });
  const card = vm.store.state.messages.at(-1).card;
  assert.equal(card.kind, 'changes');
  assert.deepEqual(card.paths, ['index.html', 'css/app.css']);
  assert.deepEqual(card.actions.map((a) => a.kind), ['open', 'open']);
});

test('opening, revealing or showing on the map adds no fake message and no second card', async () => {
  const bus = createEventBus();
  const actions = {
    entryOf: async () => ({ type: 'file' }),
    fileInfo: () => ({ level: 'red', reason: 'clave a la vista', by: 'agent' }),
    readFile: async () => ({ ok: true, data: 'x' }),
    openFile: async () => ({ ok: true }),
    locate: (p) => bus.emit(EVENTS.fileSelected, { path: p, level: 'green', by: 'demo' }), // the map answers with its card
  };
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus, actions });
  await vm.openFile('a.html');
  const before = vm.store.state.messages.length;
  const card = vm.store.state.messages.at(-1).card;
  for (const kind of ['open', 'reveal', 'locate']) vm.choose(card.actions.find((a) => a.kind === kind));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(vm.store.state.messages.length, before);

  mock.timers.enable({ apis: ['setTimeout'] }); // map messages wait in a short queue
  try {
    bus.emit(EVENTS.fileSelected, { path: 'b.js', level: 'green', by: 'demo' }); // a map card for an unchecked file
    mock.timers.tick(5000);
  } finally {
    mock.timers.reset();
  }
  assert.equal(vm.store.state.messages.find((m) => m.card?.path === 'b.js').card.level, 'grey', 'map cards agree: unchecked, not "Seguro"');
});


test('files saved one after another join one "Se guardó" card instead of piling up', () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus, actions: { entryOf: async () => ({ type: 'file' }) } });
  bus.emit(EVENTS.diskChanged, { paths: ['a.css'] });
  bus.emit(EVENTS.diskChanged, { paths: ['a.css'] });
  bus.emit(EVENTS.diskChanged, { paths: ['b.js'] });
  const cards = vm.store.state.messages.filter((m) => m.card?.kind === 'changes');
  assert.equal(cards.length, 1);
  assert.deepEqual(cards[0].card.paths, ['a.css', 'b.js']);
  assert.equal(cards[0].card.actions.length, 2);
});

test('a question waiting for its turn says so until the agent really starts', async () => {
  const bus = createEventBus();
  let start;
  let finish;
  const agentModel = {
    reply: (_t, { onStart, onText }) => new Promise((resolve) => {
      start = onStart;
      finish = () => { onText('Listo'); resolve({ text: 'Listo' }); };
    }),
  };
  const connection = { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } };
  const vm = new ChatViewModel({ agentModel, bus, connection });
  const sending = vm.send('hola');
  await new Promise((r) => setTimeout(r, 0));
  const runOf = () => vm.store.state.messages.find((m) => m.run).run;
  assert.equal(runOf().queued, true);
  start('1');
  assert.equal(runOf().queued, false);
  finish();
  await sending;
  assert.equal(runOf().status, 'done');
});

test('a repair is one card: its steps, the agent explanation and the result, instead of loose messages', () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus, actions: { showRepairs: () => {} } });
  const before = vm.store.state.messages.length;
  bus.emit(EVENTS.repairStarted, { path: 'tests/a.js', agent: 'Claude' });
  const card = () => vm.store.state.messages.find((m) => m.run?.kind === 'repair');
  assert.equal(card().run.status, 'running');
  assert.equal(card().run.path, 'tests/a.js');
  bus.emit(EVENTS.repairTool, { path: 'tests/a.js', name: 'mcp__platanus__platanus_read_file' });
  assert.deepEqual(card().run.steps.map((s) => [s.name, s.status]), [['read_file', 'running']], 'one orb at a time: the newest step');
  bus.emit(EVENTS.repairText, { path: 'tests/a.js', delta: 'Encontré ' });
  bus.emit(EVENTS.repairText, { path: 'tests/a.js', delta: 'nada' });
  assert.deepEqual(card().run.steps.map((s) => s.status), ['done']);
  bus.emit(EVENTS.repairTool, { path: 'tests/a.js', name: 'platanus_set_file_score' });
  bus.emit(EVENTS.repairText, { path: 'tests/a.js', delta: 'Falsa alarma.' });
  bus.emit(EVENTS.repairFinished, { entry: { path: 'tests/a.js', status: 'clear', changes: [], plan: [] } });
  assert.equal(card().text, 'Encontré nada\n\nFalsa alarma.', 'text after a tool is a new paragraph');
  assert.equal(card().run.status, 'done');
  assert.equal(card().run.result.status, 'clear');
  assert.match(card().run.result.text, /Falsa alarma/);
  assert.equal(vm.store.state.messages.length, before + 1, 'everything lives in the one card');
  assert.ok(vm.store.state.chips?.length, 'the repairs history is offered as a chip');
});

test('a failed repair closes its card with the error; a later "verified" comes as its own row', () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
  bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: '' });
  bus.emit(EVENTS.repairTool, { path: 'a.js', name: 'platanus_read_file' });
  bus.emit(EVENTS.repairFinished, { entry: { path: 'a.js', status: 'failed', error: 'Sin conexión', changes: [], plan: [] } });
  const run = vm.store.state.messages.find((m) => m.run?.kind === 'repair').run;
  assert.equal(run.status, 'error');
  assert.deepEqual(run.steps.map((s) => s.status), ['error']);
  bus.emit(EVENTS.repairFinished, { entry: { path: 'a.js', status: 'verified', changes: [], plan: [] } });
});

test('during a repair its steps name the file and the color, and the map does not interrupt with cards', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
    bus.emit(EVENTS.folderOpened, { name: 'tests', files: 3, folders: 0, counts: { red: 1, yellow: 0, green: 2 } }); // Remi moves the map first…
    bus.emit(EVENTS.repairStarted, { path: 'tests/a.js', agent: 'Claude' }); // …then the repair starts
    bus.emit(EVENTS.repairTool, { path: 'tests/a.js', name: 'read_file', target: 'tests/a.js' });
    bus.emit(EVENTS.repairTool, { path: 'tests/a.js', name: 'set_file_score', target: 'tests/a.js', level: 'green' });
    bus.emit(EVENTS.folderOpened, { name: 'tests', files: 3, folders: 0, counts: { red: 1, yellow: 0, green: 2 } }); // Remi flew the camera there
    mock.timers.tick(5000);
    const run = vm.store.state.messages.find((m) => m.run?.kind === 'repair').run;
    assert.deepEqual(run.steps.map((s) => [s.name, s.target, s.level]), [['read_file', 'tests/a.js', null], ['set_file_score', 'tests/a.js', 'green']]);
    assert.equal(vm.store.state.messages.filter((m) => m.card).length, 0);
    bus.emit(EVENTS.repairFinished, { entry: { path: 'tests/a.js', status: 'clear', changes: [], plan: [] } });
    bus.emit(EVENTS.folderOpened, { name: 'tests', files: 3, folders: 0, counts: { red: 0, yellow: 0, green: 3 } }); // after it: cards again
    mock.timers.tick(5000);
    assert.equal(vm.store.state.messages.filter((m) => m.card).length, 1);
  } finally {
    mock.timers.reset();
  }
});

test('text written before and after a tool becomes two paragraphs, not one glued sentence', async () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
  bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: 'Claude' });
  bus.emit(EVENTS.repairText, { path: 'a.js', delta: 'Falsa alarma.' });
  bus.emit(EVENTS.repairTool, { path: 'a.js', name: 'set_file_score', target: 'a.js', level: 'green' });
  bus.emit(EVENTS.repairText, { path: 'a.js', delta: 'Buenas noticias' });
  assert.equal(vm.store.state.messages.find((m) => m.run?.kind === 'repair').text, 'Falsa alarma.\n\nBuenas noticias');

  const agentModel = {
    reply: async (_t, { onEvent, onText }) => {
      onText('Reviso.');
      onEvent({ type: 'tool', id: 't1', name: 'read_file', target: 'a.js', parent: null });
      onEvent({ type: 'tool_done', id: 't1', error: false });
      onText('Todo bien');
      return { text: 'Reviso.Todo bien' };
    },
  };
  const live = new ChatViewModel({ agentModel, bus: createEventBus(), connection: { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } } });
  await live.send('hola');
  assert.equal(live.store.state.messages.find((m) => m.run).text, 'Reviso.\n\nTodo bien');
});

test('while the person is asked to approve a change, the working card says so (listening orb)', async () => {
  const bus = createEventBus();
  let finish;
  const agentModel = { reply: (_t, { onText, onStart }) => new Promise((resolve) => { onStart(); finish = () => { onText('Listo'); resolve({ text: 'Listo' }); }; }) };
  const vm = new ChatViewModel({ agentModel, bus, connection: { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } } });
  const sending = vm.send('arregla vercel.json');
  await new Promise((r) => setTimeout(r, 0));
  bus.emit(EVENTS.agentAwaiting, { path: 'vercel.json', waiting: true });
  const run = () => vm.store.state.messages.find((m) => m.run).run;
  assert.equal(run().awaiting, 'vercel.json');
  bus.emit(EVENTS.agentAwaiting, { path: 'vercel.json', waiting: false });
  assert.equal(run().awaiting, null);
  finish();
  await sending;

  bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: 'Claude' }); // a repair waits the same way
  bus.emit(EVENTS.agentAwaiting, { path: 'a.js', waiting: true });
  assert.equal(vm.store.state.messages.find((m) => m.run?.kind === 'repair').run.awaiting, 'a.js');
});

test('a run whose agent stops halfway ends as an error and keeps what it wrote', async () => {
  const bus = createEventBus();
  const agentModel = { reply: async (_t, { onText }) => { onText('Empiezo a revisar…'); return { text: 'Empiezo a revisar…', html: '<strong>Se detuvo</strong>', tone: 'alert' }; } };
  const vm = new ChatViewModel({ agentModel, bus, connection: { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } } });
  await vm.send('revisa');
  const m = vm.store.state.messages.find((x) => x.run);
  assert.equal(m.run.status, 'error');
  assert.equal(m.run.error, '<strong>Se detuvo</strong>');
  assert.equal(m.text, 'Empiezo a revisar…');
});

test('a change the agent writes shows live: the proposed diff while asking, then the applied one', async () => {
  const bus = createEventBus();
  let finish;
  let emit;
  const agentModel = { reply: (_t, { onEvent, onText, onStart }) => new Promise((resolve) => { onStart(); emit = onEvent; finish = () => { onText('Listo'); resolve({ text: 'Listo' }); }; }) };
  const vm = new ChatViewModel({ agentModel, bus, connection: { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } } });
  const sending = vm.send('arregla vercel.json');
  await new Promise((r) => setTimeout(r, 0));
  emit({ type: 'tool', id: 'w1', name: 'write_file', target: 'vercel.json', parent: null });
  const diff = { added: 1, removed: 1, created: false, truncated: false, hunks: [{ lines: [{ type: 'del', text: 'a', old: 1 }, { type: 'add', text: 'b', new: 1 }] }] };
  bus.emit(EVENTS.agentAwaiting, { path: 'vercel.json', waiting: true, diff });
  const step = () => vm.store.state.messages.find((m) => m.run).run.steps[0];
  assert.deepEqual(step().proposed, diff);
  bus.emit(EVENTS.agentAwaiting, { path: 'vercel.json', waiting: false });
  bus.emit(EVENTS.agentChanged, { path: 'vercel.json', reason: 'x', diff });
  emit({ type: 'tool_done', id: 'w1', error: false });
  assert.deepEqual(step().diff, diff);
  assert.equal(step().status, 'done');
  finish();
  await sending;
});

test('in a repair, the saved change completes its write step instead of adding a second one', () => {
  const bus = createEventBus();
  const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
  bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: 'Claude' });
  bus.emit(EVENTS.repairTool, { path: 'a.js', name: 'write_file', target: 'a.js' });
  const diff = { added: 2, removed: 0, created: false, truncated: false, hunks: [] };
  bus.emit(EVENTS.repairChanged, { path: 'a.js', change: { path: 'a.js', reason: 'x', diff } });
  const steps = vm.store.state.messages.find((m) => m.run?.kind === 'repair').run.steps;
  assert.equal(steps.length, 1);
  assert.equal(steps[0].status, 'done');
  assert.deepEqual(steps[0].diff, diff);
});

test('opening another project closes a repair card left running and map cards come back', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const bus = createEventBus();
    const vm = new ChatViewModel({ agentModel: { reply: async () => ({ text: '' }) }, bus });
    bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: 'Claude' });
    bus.emit(EVENTS.projectOpened, { name: 'otro' });
    assert.equal(vm.store.state.messages.find((m) => m.run?.kind === 'repair').run.status, 'error');
    bus.emit(EVENTS.folderOpened, { name: 'src', files: 1, folders: 0, counts: { red: 0, yellow: 0, green: 1 } });
    mock.timers.tick(5000);
    assert.ok(vm.store.state.messages.some((m) => m.card?.kind === 'folder'));
  } finally { mock.timers.reset(); }
});

test('the approval wait goes to the card that is writing, not to a question waiting its turn', async () => {
  const bus = createEventBus();
  const agentModel = { reply: () => new Promise(() => {}) }; // a chat question that stays in line
  const vm = new ChatViewModel({ agentModel, bus, connection: { live: true, agentLabel: 'Claude', store: { state: { selected: 'claude', model: '', effort: 'low' } } } });
  bus.emit(EVENTS.repairStarted, { path: 'a.js', agent: 'Claude' });
  bus.emit(EVENTS.repairTool, { path: 'a.js', name: 'write_file', target: 'a.js' });
  vm.send('hola');
  await new Promise((r) => setTimeout(r, 0));
  const diff = { added: 1, removed: 0, created: false, truncated: false, hunks: [] };
  bus.emit(EVENTS.agentAwaiting, { path: 'a.js', waiting: true, diff });
  const repair = vm.store.state.messages.find((m) => m.run?.kind === 'repair').run;
  const chat = vm.store.state.messages.find((m) => m.run && m.run.kind !== 'repair').run;
  assert.equal(repair.awaiting, 'a.js');
  assert.deepEqual(repair.steps[0].proposed, diff);
  assert.equal(chat.awaiting ?? null, null);
  bus.emit(EVENTS.agentAwaiting, { path: 'a.js', waiting: false });
  assert.equal(vm.store.state.messages.find((m) => m.run?.kind === 'repair').run.awaiting, null);
});

test('an agent that reports a write only after it ends (OpenCode) still shows its diff, once', async () => {
  const bus = createEventBus();
  let emit;
  let finish;
  const agentModel = { reply: (_t, { onEvent, onText }) => new Promise((resolve) => { emit = onEvent; finish = () => { onText('Listo'); resolve({ text: 'Listo' }); }; }) };
  const vm = new ChatViewModel({ agentModel, bus, connection: { live: true, agentLabel: 'OpenCode', store: { state: { selected: 'opencode', model: '', effort: 'low' } } } });
  const sending = vm.send('arregla a.js');
  await new Promise((r) => setTimeout(r, 0));
  emit({ type: 'session', id: 's' });
  const queued = vm.store.state.messages.find((m) => m.run);
  vm.store.set({ messages: vm.store.state.messages.map((m) => (m === queued ? { ...m, run: { ...m.run, queued: false } } : m)) }); // started
  const diff = { added: 1, removed: 1, created: false, truncated: false, hunks: [] };
  bus.emit(EVENTS.agentChanged, { path: 'a.js', reason: 'x', diff }); // the change arrives before the tool line
  emit({ type: 'tool', id: 'c1', name: 'write_file', target: 'a.js', parent: null });
  emit({ type: 'tool_done', id: 'c1', error: false });
  const steps = vm.store.state.messages.find((m) => m.run).run.steps.filter((x) => x.name === 'write_file');
  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0].diff, diff);
  assert.equal(steps[0].status, 'done');
  finish();
  await sending;
});
