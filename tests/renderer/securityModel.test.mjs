import test from 'node:test';
import assert from 'node:assert/strict';
import { SecurityModel, demoScore, worstLevel, securityScore, scoreLevel } from '../../renderer/models/securityModel.js';

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

test('the security score follows the risks, not the share of files: each fix moves it', () => {
  assert.equal(securityScore({ red: 0, yellow: 0 }), 100);
  assert.equal(securityScore({ red: 1, yellow: 2 }), 75);
  assert.equal(securityScore({ red: 0, yellow: 2 }), 90); // the red one is fixed: +15
  assert.equal(securityScore({ red: 0, yellow: 3 }), 85); // a red one went to "to review": +10
  assert.equal(securityScore({ red: 9, yellow: 0 }), 0); // never below zero
  assert.equal(scoreLevel({ red: 1, yellow: 0 }), 'red');
  assert.equal(scoreLevel({ red: 0, yellow: 3 }), 'yellow');
  assert.equal(scoreLevel({ red: 0, yellow: 0 }), 'green');
});
