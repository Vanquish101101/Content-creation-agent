import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from '../helpers/fakeSupabase.js';
import { makeFakeRedis } from '../helpers/fakeRedis.js';
import { createAgent1Notifier } from '../../src/delivery/agent1Notifier.js';

test('notifyAgent1 inserts a row into agent1_delivery_queue with the given payload', async () => {
  const db = makeFakeDb({
    agent1_delivery_queue: (state) => {
      assert.equal(state.operation, 'insert');
      assert.equal(state.payload.telegram_id, 123);
      assert.equal(state.payload.message_type, 'content_ready');
      assert.equal(state.payload.generated_content_id, 'gc-1');
      assert.deepEqual(state.payload.payload, { text: 'готово' });
      assert.equal(state.payload.attempt_count, 0);
      assert.equal(state.payload.status, 'pending');
      return { data: null, error: null };
    }
  });
  const redis = makeFakeRedis();
  const notifyAgent1 = createAgent1Notifier({ db, _redis: redis });

  await notifyAgent1({
    telegramId: 123,
    messageType: 'content_ready',
    generatedContentId: 'gc-1',
    payload: { text: 'готово' }
  });
});

test('notifyAgent1 allows a null generatedContentId (e.g. quota_warning has no single generation)', async () => {
  const db = makeFakeDb({
    agent1_delivery_queue: (state) => {
      assert.equal(state.payload.generated_content_id, null);
      assert.equal(state.payload.message_type, 'quota_warning');
      return { data: null, error: null };
    }
  });
  const redis = makeFakeRedis();
  const notifyAgent1 = createAgent1Notifier({ db, _redis: redis });

  await notifyAgent1({ telegramId: 123, messageType: 'quota_warning', payload: { usedGb: 9.6 } });
});

test('notifyAgent1 publishes a delivery_ready event to notifications:agent1_from_agent4', async () => {
  const db = makeFakeDb({
    agent1_delivery_queue: () => ({ data: null, error: null })
  });
  const redis = makeFakeRedis();
  const notifyAgent1 = createAgent1Notifier({ db, _redis: redis });

  await notifyAgent1({ telegramId: 123, messageType: 'content_ready', payload: {} });

  assert.equal(redis.published.length, 1);
  assert.equal(redis.published[0].channel, 'notifications:agent1_from_agent4');
  const event = JSON.parse(redis.published[0].message);
  assert.equal(event.event, 'delivery_ready');
  assert.equal(event.telegram_id, 123);
  assert.equal(event.message_type, 'content_ready');
  assert.equal(typeof event.timestamp, 'string');
});

test('notifyAgent1 retries the Supabase insert on failure and does not throw if a later attempt succeeds', async () => {
  let attempts = 0;
  const db = makeFakeDb({
    agent1_delivery_queue: () => {
      attempts += 1;
      if (attempts < 2) {
        return { data: null, error: { message: 'connection reset' } };
      }
      return { data: null, error: null };
    }
  });
  const redis = makeFakeRedis();
  const notifyAgent1 = createAgent1Notifier({ db, _redis: redis, _retryDelaysMs: [0, 0] });

  await notifyAgent1({ telegramId: 123, messageType: 'content_ready', payload: {} });

  assert.equal(attempts, 2);
});

test('notifyAgent1 does not throw when the Supabase insert fails on every retry (logged, not fatal)', async () => {
  const db = makeFakeDb({
    agent1_delivery_queue: () => ({ data: null, error: { message: 'still down' } })
  });
  const redis = makeFakeRedis();
  const notifyAgent1 = createAgent1Notifier({ db, _redis: redis, _retryDelaysMs: [0, 0] });

  await notifyAgent1({ telegramId: 123, messageType: 'content_ready', payload: {} });

  assert.equal(redis.published.length, 1, 'Redis publish (best-effort) still attempted despite Supabase failure');
});

test('notifyAgent1 does not throw when the Redis publish fails (best-effort layer)', async () => {
  const db = makeFakeDb({
    agent1_delivery_queue: () => ({ data: null, error: null })
  });
  const redis = makeFakeRedis();
  redis.publish = async () => { throw new Error('redis unreachable'); };
  const notifyAgent1 = createAgent1Notifier({ db, _redis: redis });

  await notifyAgent1({ telegramId: 123, messageType: 'content_ready', payload: {} });
});

test('notifyAgent1 works with no Redis configured at all (redis param omitted)', async () => {
  const db = makeFakeDb({
    agent1_delivery_queue: () => ({ data: null, error: null })
  });
  const notifyAgent1 = createAgent1Notifier({ db });

  await notifyAgent1({ telegramId: 123, messageType: 'content_ready', payload: {} });
});
