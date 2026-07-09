import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { createHandoffPoller } from '../../src/inbox/poller.js';

test('pollOnce calls onRow for each pending row', async () => {
  const db = makeFakeDb({
    agent4_handoff_queue: () => ({
      data: [
        { id: 'q1', telegram_id: 123, wizard_hash: 'abc', mode: 'content' },
        { id: 'q2', telegram_id: 456, wizard_hash: 'def', mode: 'publish' }
      ],
      error: null
    })
  });
  const seen = [];
  const poller = createHandoffPoller({ db, onRow: async (row) => { seen.push(row.telegram_id); } });

  await poller.pollOnce();

  assert.deepEqual(seen, [123, 456]);
});

test('pollOnce does not throw when the queue read fails (logs and continues)', async () => {
  const db = makeFakeDb({
    agent4_handoff_queue: () => ({ data: null, error: { message: 'timeout' } })
  });
  const poller = createHandoffPoller({ db, onRow: async () => {} });

  await assert.doesNotReject(() => poller.pollOnce());
});

test('start() schedules repeated pollOnce ticks, stop() halts them', async () => {
  let fromCalls = 0;
  const baseDb = makeFakeDb({ agent4_handoff_queue: () => ({ data: [], error: null }) });
  const db = { schema() { return db; }, from(table) { fromCalls += 1; return baseDb.from(table); } };
  const poller = createHandoffPoller({ db, onRow: async () => {} });

  poller.start(10);
  await new Promise((resolve) => setTimeout(resolve, 55));
  poller.stop();
  const callsAfterStop = fromCalls;
  await new Promise((resolve) => setTimeout(resolve, 55));

  assert.ok(callsAfterStop >= 2, `expected at least 2 polling ticks, got ${callsAfterStop}`);
  assert.equal(fromCalls, callsAfterStop, 'stop() must prevent further polling');
});
