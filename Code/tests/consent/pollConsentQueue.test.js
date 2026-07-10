import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { pollAgent1ConsentQueue } from '../../src/consent/pollConsentQueue.js';

test('reads pending rows from intelligence_agent.agent4_consent_queue', async () => {
  const db = makeFakeDb({
    agent4_consent_queue: (state) => {
      assert.equal(state.filters.status, 'pending');
      return { data: [{ id: 'row-1', telegram_id: 123, generated_content_id: 'gc-1', decision_type: 'quota_deletion', decision: 'approved' }], error: null };
    }
  });

  const rows = await pollAgent1ConsentQueue(db);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'row-1');
  assert.deepEqual(db.schemaCalls, ['intelligence_agent']);
});

test('returns an empty array when there are no pending rows', async () => {
  const db = makeFakeDb({ agent4_consent_queue: () => ({ data: [], error: null }) });

  assert.deepEqual(await pollAgent1ConsentQueue(db), []);
});

test('throws on a database error', async () => {
  const db = makeFakeDb({ agent4_consent_queue: () => ({ data: null, error: { message: 'connection reset' } }) });

  await assert.rejects(() => pollAgent1ConsentQueue(db), /connection reset/);
});
