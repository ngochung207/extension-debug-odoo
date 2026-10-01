import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clockText } from '../../../../src/entrypoints/panel/clock.ts';

test('the clock: 24-hour time, a short date in the panel language, the full one with the time zone', () => {
  const d = new Date(2026, 9, 1, 9, 5); // Thursday 1 October 2026, 09:05 local time
  const vi = clockText(d, 'vi');
  assert.equal(vi.time, '09:05');
  assert.match(vi.date, /01\/10/);
  const en = clockText(d, 'en');
  assert.equal(en.time, '09:05');
  assert.match(en.date, /Thu.*Oct.*1/);
  assert.match(en.full, /^Thursday, October 1, 2026 · 09:05 · /);
});
