// Small formatting helpers shared by the views
import test from 'node:test';
import assert from 'node:assert/strict';
import { daysAgo } from '../../renderer/core/format.js';

test('daysAgo counts calendar days, not 24-hour blocks', () => {
  const now = new Date(2026, 9, 24, 9, 0); // Oct 24, 09:00 local
  assert.equal(daysAgo(new Date(2026, 9, 24, 0, 5).toISOString(), now), 0);
  assert.equal(daysAgo(new Date(2026, 9, 23, 23, 50).toISOString(), now), 1); // 10 minutes ago, but yesterday
  assert.equal(daysAgo(new Date(2026, 9, 21, 12, 0).toISOString(), now), 3);
  assert.equal(daysAgo(new Date(2026, 8, 24, 12, 0).toISOString(), now), 30);
});

test('daysAgo is null for a missing or broken date, and never negative', () => {
  const now = new Date(2026, 9, 24, 9, 0);
  assert.equal(daysAgo(undefined, now), null);
  assert.equal(daysAgo('not a date', now), null);
  assert.equal(daysAgo(new Date(2026, 9, 25).toISOString(), now), 0);
});
