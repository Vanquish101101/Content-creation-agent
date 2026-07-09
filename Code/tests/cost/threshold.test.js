import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresConfirmation } from '../../src/cost/threshold.js';

test('returns false when estimated cost is below the default threshold ($0.50)', () => {
  assert.equal(requiresConfirmation(0.10), false);
});

test('returns false when estimated cost equals the default threshold exactly', () => {
  assert.equal(requiresConfirmation(0.50), false);
});

test('returns true when estimated cost exceeds the default threshold', () => {
  assert.equal(requiresConfirmation(0.51), true);
});

test('accepts a custom threshold', () => {
  assert.equal(requiresConfirmation(1.2, 1.0), true);
  assert.equal(requiresConfirmation(0.8, 1.0), false);
});
