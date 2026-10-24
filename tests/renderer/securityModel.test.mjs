import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityModel, demoScore, worstLevel } from '../../renderer/models/securityModel.js';

test('demo rules: secrets are red, templates yellow, plain code green', () => {
  assert.equal(demoScore('.env').level, 'red');
  assert.equal(demoScore('.env.example').level, 'yellow');
  assert.equal(demoScore('src/app.js').level, 'green');
});

test('an override keeps the original rule (reasonKey) and who set it', () => {
  const m = new SecurityModel();
  m.setScore('.env', 'yellow', 'plan listo', 'remi');
  const s = m.scoreOf('.env');
  assert.equal(s.level, 'yellow');
  assert.equal(s.by, 'remi');
  assert.equal(s.reasonKey, 'envFile');
});

test('invalid levels are rejected and worstLevel ranks red highest', () => {
  const m = new SecurityModel();
  assert.equal(m.setScore('a.js', 'purple'), false);
  assert.equal(worstLevel(['green', 'red', 'yellow']), 'red');
});
