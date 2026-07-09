import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isNotFoundError } from '../../src/db/errors.js';

test('returns true for PGRST116 (supabase .single() found zero rows)', () => {
  assert.equal(isNotFoundError({ code: 'PGRST116', message: 'Cannot coerce the result to a single JSON object' }), true);
});

test('returns false for other error codes', () => {
  assert.equal(isNotFoundError({ code: '23505', message: 'duplicate key' }), false);
});

test('returns false for null/undefined error', () => {
  assert.equal(isNotFoundError(null), false);
  assert.equal(isNotFoundError(undefined), false);
});
