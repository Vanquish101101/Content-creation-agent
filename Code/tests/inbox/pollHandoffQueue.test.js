import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { pollAgent1HandoffQueue } from '../../src/inbox/pollHandoffQueue.js';

test('pollAgent1HandoffQueue reads pending rows via .schema(intelligence_agent)', async () => {
  const db = makeFakeDb({
    agent4_handoff_queue: (state) => {
      assert.equal(state.filters.status, 'pending');
      return {
        data: [
          { id: 'q1', telegram_id: 123, wizard_hash: 'abc', mode: 'content', status: 'pending' },
          { id: 'q2', telegram_id: 456, wizard_hash: 'def', mode: 'publish', status: 'pending' }
        ],
        error: null
      };
    }
  });

  const rows = await pollAgent1HandoffQueue(db);

  assert.deepEqual(db.schemaCalls, ['intelligence_agent']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].telegram_id, 123);
  assert.equal(rows[1].wizard_hash, 'def');
});

test('pollAgent1HandoffQueue returns an empty array when nothing is pending', async () => {
  const db = makeFakeDb({
    agent4_handoff_queue: () => ({ data: [], error: null })
  });

  const rows = await pollAgent1HandoffQueue(db);

  assert.deepEqual(rows, []);
});

test('pollAgent1HandoffQueue throws when Supabase returns an error', async () => {
  const db = makeFakeDb({
    agent4_handoff_queue: () => ({ data: null, error: { message: 'timeout' } })
  });

  await assert.rejects(() => pollAgent1HandoffQueue(db), /timeout/);
});
