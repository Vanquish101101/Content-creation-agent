import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeRedis } from '../helpers/fakeRedis.js';
import { subscribeToConsent } from '../../src/consent/subscribe.js';

test('subscribes to the notifications:agent4_from_agent1 channel', async () => {
  const redis = makeFakeRedis();

  await subscribeToConsent({ _redis: redis, onDecision: () => {} });

  assert.deepEqual(redis.subscribedChannels, ['notifications:agent4_from_agent1']);
});

test('dispatches a decision_ready message to onDecision', async () => {
  const redis = makeFakeRedis();
  let received = null;
  await subscribeToConsent({ _redis: redis, onDecision: (event) => { received = event; } });

  redis._emitMessage('notifications:agent4_from_agent1', JSON.stringify({
    event: 'decision_ready',
    telegram_id: 123,
    generated_content_id: 'gc-1',
    decision_type: 'quota_deletion',
    decision: 'approved',
    timestamp: '2026-07-10T10:00:00.000Z'
  }));

  assert.equal(received.telegramId, 123);
  assert.equal(received.generatedContentId, 'gc-1');
  assert.equal(received.decisionType, 'quota_deletion');
});

test('ignores messages on other channels', async () => {
  const redis = makeFakeRedis();
  let calls = 0;
  await subscribeToConsent({ _redis: redis, onDecision: () => { calls++; } });

  redis._emitMessage('some:other:channel', JSON.stringify({ event: 'decision_ready' }));

  assert.equal(calls, 0);
});

test('ignores malformed messages instead of throwing', async () => {
  const redis = makeFakeRedis();
  await subscribeToConsent({ _redis: redis, onDecision: () => {} });

  assert.doesNotThrow(() => redis._emitMessage('notifications:agent4_from_agent1', '{not json'));
});
