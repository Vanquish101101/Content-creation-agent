import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDecisionEvent } from '../../src/consent/parseDecisionEvent.js';

const VALID_RAW = JSON.stringify({
  event: 'decision_ready',
  queue_id: 'row-1',
  telegram_id: 123,
  generated_content_id: 'gc-1',
  decision_type: 'quota_deletion',
  decision: 'approved',
  timestamp: '2026-07-10T10:00:00Z'
});

test('parses a valid decision_ready event', () => {
  const event = parseDecisionEvent(VALID_RAW);

  assert.deepEqual(event, {
    queueId: 'row-1',
    telegramId: 123,
    generatedContentId: 'gc-1',
    decisionType: 'quota_deletion',
    decision: 'approved',
    timestamp: '2026-07-10T10:00:00Z'
  });
});

test('queueId defaults to null when not present', () => {
  const raw = JSON.stringify({
    event: 'decision_ready',
    telegram_id: 123,
    generated_content_id: 'gc-1',
    decision_type: 'publish_moderation',
    decision: 'rejected',
    timestamp: 't'
  });

  assert.equal(parseDecisionEvent(raw).queueId, null);
});

test('returns null for invalid JSON', () => {
  assert.equal(parseDecisionEvent('not json'), null);
});

test('returns null for a different event type', () => {
  assert.equal(parseDecisionEvent(JSON.stringify({ event: 'wizard_ready' })), null);
});

test('returns null when a required field is missing', () => {
  const raw = JSON.stringify({
    event: 'decision_ready',
    telegram_id: 123,
    decision_type: 'quota_deletion',
    decision: 'approved',
    timestamp: 't'
    // generated_content_id missing
  });

  assert.equal(parseDecisionEvent(raw), null);
});

test('returns null for an unrecognized decision_type', () => {
  const raw = JSON.stringify({
    event: 'decision_ready',
    telegram_id: 123,
    generated_content_id: 'gc-1',
    decision_type: 'something_else',
    decision: 'approved',
    timestamp: 't'
  });

  assert.equal(parseDecisionEvent(raw), null);
});

test('returns null for an unrecognized decision value', () => {
  const raw = JSON.stringify({
    event: 'decision_ready',
    telegram_id: 123,
    generated_content_id: 'gc-1',
    decision_type: 'quota_deletion',
    decision: 'maybe',
    timestamp: 't'
  });

  assert.equal(parseDecisionEvent(raw), null);
});
