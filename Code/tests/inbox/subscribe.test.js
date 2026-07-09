import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeRedis } from '../helpers/fakeRedis.js';
import { subscribeToInbox } from '../../src/inbox/subscribe.js';

test('subscribes to the notifications:agent4 channel', async () => {
  const redis = makeFakeRedis();

  await subscribeToInbox({ _redis: redis, onWizardReady: () => {}, onDigestReady: () => {} });

  assert.deepEqual(redis.subscribedChannels, ['notifications:agent4']);
});

test('dispatches a wizard_ready message to onWizardReady', async () => {
  const redis = makeFakeRedis();
  let received = null;
  await subscribeToInbox({ _redis: redis, onWizardReady: (event) => { received = event; }, onDigestReady: () => {} });

  redis._emitMessage('notifications:agent4', JSON.stringify({
    event: 'wizard_ready',
    telegram_id: 123,
    wizard_hash: 'abc',
    mode: 'content',
    timestamp: '2026-07-10T10:00:00.000Z'
  }));

  assert.equal(received.telegram_id, 123);
  assert.equal(received.wizard_hash, 'abc');
});

test('dispatches a digest_ready message to onDigestReady', async () => {
  const redis = makeFakeRedis();
  let received = null;
  await subscribeToInbox({ _redis: redis, onWizardReady: () => {}, onDigestReady: (event) => { received = event; } });

  redis._emitMessage('notifications:agent4', JSON.stringify({
    event: 'digest_ready',
    run_id: 'r1',
    timestamp: '2026-07-10T10:05:00.000Z'
  }));

  assert.equal(received.run_id, 'r1');
});

test('ignores messages on other channels', async () => {
  const redis = makeFakeRedis();
  let calls = 0;
  await subscribeToInbox({ _redis: redis, onWizardReady: () => { calls++; }, onDigestReady: () => { calls++; } });

  redis._emitMessage('some:other:channel', JSON.stringify({ event: 'wizard_ready', telegram_id: 1, wizard_hash: 'a', mode: 'content', timestamp: 't' }));

  assert.equal(calls, 0);
});

test('ignores malformed messages instead of throwing', async () => {
  const redis = makeFakeRedis();
  await subscribeToInbox({ _redis: redis, onWizardReady: () => {}, onDigestReady: () => {} });

  assert.doesNotThrow(() => redis._emitMessage('notifications:agent4', '{not json'));
});
