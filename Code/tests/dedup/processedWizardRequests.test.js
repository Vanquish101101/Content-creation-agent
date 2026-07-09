import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { isWizardProcessed, markWizardProcessed } from '../../src/dedup/processedWizardRequests.js';

test('isWizardProcessed returns true when a matching row exists', async () => {
  const db = makeFakeDb({
    processed_wizard_requests: (state) => {
      assert.equal(state.filters.telegram_id, 123);
      assert.equal(state.filters.wizard_hash, 'abc');
      return { data: { id: 'row-1' }, error: null };
    }
  });

  const processed = await isWizardProcessed(db, 123, 'abc');

  assert.equal(processed, true);
});

test('isWizardProcessed returns false when no matching row exists', async () => {
  // Найдено живой проверкой 2026-07-10: реальный supabase-js .single() на
  // пустом результате возвращает НЕ {data:null,error:null}, а ошибку PGRST116
  // ("Cannot coerce the result to a single JSON object") — именно так, не
  // просто null, ведёт себя настоящий PostgREST.
  const db = makeFakeDb({
    processed_wizard_requests: () => ({
      data: null,
      error: { message: 'Cannot coerce the result to a single JSON object', code: 'PGRST116' }
    })
  });

  const processed = await isWizardProcessed(db, 123, 'abc');

  assert.equal(processed, false);
});

test('markWizardProcessed inserts a new row with telegram_id and wizard_hash', async () => {
  const db = makeFakeDb({
    processed_wizard_requests: (state) => {
      assert.equal(state.operation, 'insert');
      assert.deepEqual(state.payload, { telegram_id: 123, wizard_hash: 'abc' });
      return { data: null, error: null };
    }
  });

  await markWizardProcessed(db, 123, 'abc');
});

test('markWizardProcessed does not throw on a unique-violation (already marked concurrently)', async () => {
  const db = makeFakeDb({
    processed_wizard_requests: () => ({
      data: null,
      error: { message: 'duplicate key value violates unique constraint', code: '23505' }
    })
  });

  await assert.doesNotReject(() => markWizardProcessed(db, 123, 'abc'));
});
