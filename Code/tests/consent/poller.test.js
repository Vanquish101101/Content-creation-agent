import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createConsentPoller } from '../../src/consent/poller.js';

test('pollOnce calls onRow for each pending row', async () => {
  const db = makeFakeDb({
    agent4_consent_queue: () => ({
      data: [
        { id: 'row-1', telegram_id: 123, generated_content_id: 'gc-1', decision_type: 'quota_deletion', decision: 'approved' },
        { id: 'row-2', telegram_id: 456, generated_content_id: 'gc-2', decision_type: 'publish_moderation', decision: 'rejected' }
      ],
      error: null
    })
  });
  const seen = [];
  const poller = createConsentPoller({ db, onRow: async (row) => { seen.push(row.id); } });

  await poller.pollOnce();

  assert.deepEqual(seen, ['row-1', 'row-2']);
});

test('pollOnce does not throw when the queue read fails (logs and continues)', async () => {
  const db = makeFakeDb({ agent4_consent_queue: () => ({ data: null, error: { message: 'timeout' } }) });
  const poller = createConsentPoller({ db, onRow: async () => {} });

  await assert.doesNotReject(() => poller.pollOnce());
});

test('start() schedules repeated pollOnce ticks, stop() halts them', async () => {
  let fromCalls = 0;
  const baseDb = makeFakeDb({ agent4_consent_queue: () => ({ data: [], error: null }) });
  const db = { schema() { return db; }, from(table) { fromCalls += 1; return baseDb.from(table); } };
  const poller = createConsentPoller({ db, onRow: async () => {} });

  poller.start(10);
  await new Promise((resolve) => setTimeout(resolve, 55));
  poller.stop();
  const callsAfterStop = fromCalls;
  await new Promise((resolve) => setTimeout(resolve, 55));

  assert.ok(callsAfterStop >= 2, `expected at least 2 polling ticks, got ${callsAfterStop}`);
  assert.equal(fromCalls, callsAfterStop, 'stop() must prevent further polling');
});
